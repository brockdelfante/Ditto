const express = require('express');
const router = express.Router();
const { getChatCompletion, generateSummary } = require('../services/llm');
const HubSpotMCPClient = require('../services/hubspot');
const emailValidator = require('../services/emailValidator');
const tavily = require('../services/tavily');

// Pending tool calls awaiting user confirmation
const pendingActions = new Map();

// Synthetic tools not backed by any MCP server
const SYNTHETIC_TOOLS = [
    {
        name: 'validate_email',
        description: "Validate an email address before creating a new HubSpot contact. Returns status: 'valid', 'invalid', 'disposable', 'unknown', 'accept_all', or 'catch_all'. Call before creating a contact. Also call on lookup/update if contact's ZB_STATUS property is missing or empty. Do NOT call if ZB_STATUS is already set on the contact.",
        inputSchema: {
            type: 'object',
            properties: {
                email: { type: 'string', description: 'Email address to validate' }
            },
            required: ['email']
        }
    },
    {
        name: 'write_to_info_panel',
        description: 'Log completed actions to the Agent Activity panel. Call once after completing any Pathway 1/2/3 action with type "summary". Use short declarative statements (one per line), separating distinct steps with "------" on its own line. Call once after Pathway 4 with type "research" and structured HTML. Do NOT call for reads or searches that did not complete a write action.',
        inputSchema: {
            type: 'object',
            properties: {
                content: { type: 'string', description: 'Plain text content with "------" separators between steps (summary), or structured HTML (research)' },
                type: { type: 'string', enum: ['summary', 'research'], description: '"summary" for action logs, "research" for Pathway 4 HTML briefings' }
            },
            required: ['content', 'type']
        }
    }
];

// Tavily tools cache (global — not per-session)
let tavilyToolsCache = null;
let tavilyToolsFetchedAt = 0;

async function getTavilyTools() {
    const TTL = 10 * 60 * 1000;
    if (tavilyToolsCache && (Date.now() - tavilyToolsFetchedAt) < TTL) return tavilyToolsCache;
    try {
        const tools = await tavily.listTools();
        tavilyToolsCache = tools || [];
        tavilyToolsFetchedAt = Date.now();
    } catch (err) {
        console.error('Failed to load Tavily tools:', err.message);
        tavilyToolsCache = tavilyToolsCache || [];
    }
    return tavilyToolsCache;
}

// Route a tool call to the correct service
async function executeTool(name, args, hubspot) {
    if (name === 'validate_email') {
        return await emailValidator.validateEmail(args.email);
    }
    if (name === 'write_to_info_panel') {
        return { content: args.content, type: args.type || 'summary' };
    }
    const tavilyTools = await getTavilyTools();
    if (tavilyTools.some(t => t.name === name)) {
        return await tavily.callTool(name, args);
    }
    return await hubspot.callTool(name, args);
}

// ── Helpers ───────────────────────────────────────────────────────────────

function parseResult(raw) {
    if (!raw) return null;
    if (raw.content && Array.isArray(raw.content)) {
        try { return JSON.parse(raw.content[0].text); } catch { return null; }
    }
    if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return null; } }
    return raw;
}

function getTotal(raw) {
    const r = parseResult(raw);
    return r?.total ?? (Array.isArray(r?.results) ? r.results.length : 0);
}

function getResults(raw) {
    const r = parseResult(raw);
    if (!r) return [];
    return Array.isArray(r.results) ? r.results : (Array.isArray(r) ? r : []);
}

function sumProp(results, prop) {
    return results.reduce((s, item) => {
        const v = parseFloat(item.properties?.[prop] ?? item[prop] ?? 0);
        return s + (isNaN(v) ? 0 : v);
    }, 0);
}

function pct(curr, prev) {
    if (!prev || prev === 0) return null;
    return Math.round(((curr - prev) / prev) * 100);
}

function dateFilters(from, to) {
    const f = [{ propertyName: 'createdate', operator: 'GTE', value: String(from) }];
    if (to) f.push({ propertyName: 'createdate', operator: 'LT', value: String(to) });
    return f;
}

async function getAllTools(session, hubspot) {
    const TOOLS_TTL = 10 * 60 * 1000;
    const cache = session.toolsCache;
    let hubspotTools;
    if (cache && (Date.now() - cache.fetchedAt) < TOOLS_TTL) {
        hubspotTools = cache.tools;
    } else {
        hubspotTools = await hubspot.listTools();
        session.toolsCache = { tools: hubspotTools, fetchedAt: Date.now() };
    }
    const tavilyTools = await getTavilyTools();
    return [...hubspotTools, ...tavilyTools, ...SYNTHETIC_TOOLS];
}

// Detect which pathway is active from recent conversation history
function detectPathway(messages) {
    const recent = messages.slice(-8).map(m =>
        typeof m.content === 'string' ? m.content.toLowerCase() : ''
    ).join(' ');
    if (recent.includes('bring me up to speed') || recent.includes('background research')) return 4;
    if (recent.includes('log sales') || recent.includes('log activity')) return 3;
    if (recent.includes('add a new contact') || recent.includes('add new contact')) return 2;
    if (recent.includes('manage an existing') || recent.includes('manage contact') || recent.includes('manage a contact')) return 1;
    return 0;
}

// Scope tools to what the active pathway actually needs
function scopeToolsForPathway(allTools, pathway, tavilyToolNames) {
    const name = t => t.name.toLowerCase();
    const isSearch = t => name(t).includes('search');
    const isRead = t => ['get', 'list', 'retrieve', 'fetch'].some(k => name(t).includes(k));
    const isWrite = t => ['manage', 'create', 'update', 'delete', 'upsert'].some(k => name(t).includes(k));
    const isEngagement = t => ['engagement', 'note', 'task', 'meeting', 'call'].some(k => name(t).includes(k));
    const isTavily = t => tavilyToolNames.includes(t.name);

    switch (pathway) {
        case 1: // Manage existing contact/company/deal — read + write, no Tavily
            return allTools.filter(t =>
                isSearch(t) || isRead(t) || isWrite(t) ||
                t.name === 'validate_email' || t.name === 'write_to_info_panel'
            );
        case 2: // Add new contact — search + create + validate + Tavily for domain lookup
            return allTools.filter(t =>
                isSearch(t) || (isWrite(t) && !isEngagement(t)) ||
                t.name === 'validate_email' || isTavily(t) || t.name === 'write_to_info_panel'
            );
        case 3: // Log activity — search + read + all write (engagements)
            return allTools.filter(t =>
                isSearch(t) || isRead(t) || isWrite(t) ||
                t.name === 'validate_email' || t.name === 'write_to_info_panel'
            );
        case 4: // Research — search + read + Tavily, no writes
            return allTools.filter(t =>
                isSearch(t) || isRead(t) || isTavily(t) || t.name === 'write_to_info_panel'
            );
        default: // General — read-only until a pathway is established
            return allTools.filter(t =>
                isSearch(t) || isRead(t) ||
                t.name === 'validate_email' || t.name === 'write_to_info_panel'
            );
    }
}

// ── Chat ──────────────────────────────────────────────────────────────────

router.post('/chat', async (req, res) => {
    const { message, history = [] } = req.body;
    const tokens = req.session.tokens;

    if (!tokens) {
        return res.json({ reply: 'Please connect to HubSpot first using the "Connect" button.', needsAuth: true });
    }

    try {
        const hubspot = new HubSpotMCPClient(req.session);
        const allTools = await getAllTools(req.session, hubspot);
        const tavilyToolNames = (await getTavilyTools()).map(t => t.name);

        const writeOps = ['manage_crm_objects', 'create', 'update', 'delete', 'upsert'];
        const MAX_LOOPS = 8;
        let loopMessages = [
            ...history.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: message }
        ];
        let panelUpdates = [];
        let loopCount = 0;

        while (loopCount < MAX_LOOPS) {
            const pathway = detectPathway(loopMessages);
            const tools = scopeToolsForPathway(allTools, pathway, tavilyToolNames);

            const response = await getChatCompletion(loopMessages, tools);
            console.log('LLM response tool_calls:', response.tool_calls?.length ?? 0, 'loop:', loopCount, 'pathway:', pathway);
            loopCount++;

            if (!response.tool_calls?.length) {
                // No tool calls — this is a plain text reply (question, clarification, or final answer)
                return res.json({
                    reply: response.content,
                    pendingAction: false,
                    panelUpdates: panelUpdates.length ? panelUpdates : undefined
                });
            }

            // Separate HubSpot writes from immediate tools.
            // ZB_STATUS-only updates are treated as immediate (no confirmation needed).
            const isZbStatusOnlyUpdate = (tc) => {
                try {
                    const args = JSON.parse(tc.function.arguments || '{}');
                    const props = args.properties || {};
                    const propKeys = Object.keys(props).map(k => k.toLowerCase());
                    return propKeys.length > 0 && propKeys.every(k => k === 'zb_status');
                } catch { return false; }
            };
            const hubspotWrites = response.tool_calls.filter(tc =>
                writeOps.some(op => tc.function.name.toLowerCase().includes(op)) && !isZbStatusOnlyUpdate(tc)
            );
            const immediateTools = response.tool_calls.filter(tc =>
                !writeOps.some(op => tc.function.name.toLowerCase().includes(op)) || isZbStatusOnlyUpdate(tc)
            );

            // Add assistant message with tool_calls to loop context
            loopMessages.push({
                role: 'assistant',
                content: response.content || null,
                tool_calls: response.tool_calls
            });

            // Execute all immediate tools (reads, validate_email, write_to_info_panel, Tavily)
            for (const toolCall of immediateTools) {
                let result;
                try {
                    result = await executeTool(toolCall.function.name, JSON.parse(toolCall.function.arguments), hubspot);
                    if (toolCall.function.name === 'write_to_info_panel') {
                        panelUpdates.push({ content: result.content, type: result.type || 'summary', timestamp: Date.now() });
                    }
                } catch (err) {
                    console.error(`Tool ${toolCall.function.name} error:`, err.message);
                    result = { error: err.message };
                }
                loopMessages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id || `call_${Date.now()}`,
                    content: JSON.stringify(result)
                });
            }

            if (hubspotWrites.length > 0) {
                const executionId = Math.random().toString(36).substring(7);
                pendingActions.set(executionId, { toolCalls: hubspotWrites, panelUpdates });
                return res.json({
                    reply: response.content || "I've prepared the action. Shall I go ahead?",
                    pendingAction: true,
                    executionId,
                    panelUpdates: panelUpdates.length ? panelUpdates : undefined
                });
            }
        }

        return res.json({
            reply: "I'm having trouble completing that request. Please try again.",
            panelUpdates: panelUpdates.length ? panelUpdates : undefined
        });
    } catch (error) {
        console.error('Chat error:', error.message);
        res.status(500).json({ error: 'Failed to process chat: ' + error.message });
    }
});

// ── Execute ───────────────────────────────────────────────────────────────

router.post('/execute', async (req, res) => {
    const { approved, message, history = [], executionId } = req.body;
    const tokens = req.session.tokens;

    if (!tokens) return res.status(401).json({ error: 'Unauthorized' });

    if (!approved) {
        if (executionId) pendingActions.delete(executionId);
        return res.json({ reply: "No problem. Is there anything else I can help with?" });
    }

    try {
        const hubspot = new HubSpotMCPClient(req.session);

        const pending = executionId ? pendingActions.get(executionId) : null;
        if (executionId) pendingActions.delete(executionId);

        const toolsToCall = Array.isArray(pending) ? pending : pending?.toolCalls;
        let panelUpdates = Array.isArray(pending) ? [] : (pending?.panelUpdates || []);

        if (!toolsToCall?.length) {
            return res.json({ reply: "I'm not sure what action to take. Could you describe what you'd like me to do?" });
        }

        const toolResults = [];
        for (const toolCall of toolsToCall) {
            console.log('Executing tool:', toolCall.function.name, toolCall.function.arguments);
            let result;
            try {
                result = await executeTool(toolCall.function.name, JSON.parse(toolCall.function.arguments), hubspot);
                if (toolCall.function.name === 'write_to_info_panel') {
                    panelUpdates.push({ content: result.content, type: result.type || 'summary', timestamp: Date.now() });
                }
            } catch (err) {
                // Auto-retry: pass error back to LLM to fix arguments
                const allTools = await getAllTools(req.session, hubspot);
                const tavilyToolNames = (await getTavilyTools()).map(t => t.name);
                const pathway = detectPathway(history.map(m => ({ content: m.content })));
                const tools = scopeToolsForPathway(allTools, pathway, tavilyToolNames);
                const retryMessages = [
                    ...history.map(m => ({ role: m.role, content: m.content })),
                    { role: 'user', content: message || 'Yes, go ahead.' },
                    { role: 'assistant', content: null, tool_calls: [toolCall] },
                    { role: 'tool', tool_call_id: toolCall.id || 'call_0', content: `Error: ${err.message}` }
                ];
                const fixResponse = await getChatCompletion(retryMessages, tools, true);
                if (fixResponse.tool_calls?.length) {
                    const fixed = fixResponse.tool_calls[0];
                    console.log('Retrying with fixed args:', fixed.function.arguments);
                    result = await executeTool(fixed.function.name, JSON.parse(fixed.function.arguments), hubspot);
                    if (fixed.function.name === 'write_to_info_panel') {
                        panelUpdates.push({ content: result.content, type: result.type || 'summary', timestamp: Date.now() });
                    }
                } else {
                    throw err;
                }
            }
            toolResults.push({ tool: toolCall.function.name, result });
        }

        const reply = await generateSummary(toolResults);

        // Auto-generate a panel summary if model didn't call write_to_info_panel
        if (!panelUpdates.length) {
            panelUpdates = [{ content: reply, type: 'summary', timestamp: Date.now() }];
        }

        res.json({ reply, panelUpdates });
    } catch (error) {
        console.error('Execution error:', error.message);
        res.status(500).json({ error: 'Failed to execute action: ' + error.message });
    }
});

// ── Dashboard ─────────────────────────────────────────────────────────────

const DASHBOARD_TTL = 30 * 60 * 1000;

router.get('/dashboard', async (req, res) => {
    if (!req.session.tokens) return res.json({ connected: false });

    const cache = req.session.dashboardCache;
    if (cache && (Date.now() - cache.fetchedAt) < DASHBOARD_TTL) {
        return res.json(cache.data);
    }

    const hubspot = new HubSpotMCPClient(req.session);
    const now = Date.now();
    const DAY30 = 30 * 24 * 60 * 60 * 1000;
    const currStart = now - DAY30;
    const prevStart = now - 2 * DAY30;

    async function safe(name, params) {
        try { return await hubspot.callTool(name, params); }
        catch (e) { console.error(`dashboard ${name} error:`, e.message); return null; }
    }

    const [
        currContacts, prevContacts,
        currDeals, prevDeals,
        currWon, prevWon,
        currLost, prevLost,
        overdueTasks, currTasks, prevTasks,
        currCalls, prevCalls,
        currMeetings, prevMeetings,
        currEmails, prevEmails,
        currNotes, prevNotes,
        overdueDeals,
        currCampaigns, prevCampaigns,
        currFormSubmissions, prevFormSubmissions,
        currPageViews, prevPageViews
    ] = await Promise.all([
        safe('search_crm_objects', { objectType: 'contacts', limit: 100, filterGroups: [{ filters: dateFilters(currStart) }], properties: ['firstname', 'lastname', 'email', 'hs_lead_source'] }),
        safe('search_crm_objects', { objectType: 'contacts', limit: 1, filterGroups: [{ filters: dateFilters(prevStart, currStart) }], properties: ['createdate'] }),
        safe('search_crm_objects', { objectType: 'deals', limit: 100, filterGroups: [{ filters: dateFilters(currStart) }], properties: ['dealname', 'amount', 'dealstage', 'pipeline', 'hubspot_owner_id'] }),
        safe('search_crm_objects', { objectType: 'deals', limit: 100, filterGroups: [{ filters: dateFilters(prevStart, currStart) }], properties: ['amount', 'dealstage'] }),
        safe('search_crm_objects', { objectType: 'deals', limit: 100, filterGroups: [{ filters: [{ propertyName: 'closedate', operator: 'GTE', value: String(currStart) }, { propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' }] }], properties: ['amount', 'createdate', 'closedate'] }),
        safe('search_crm_objects', { objectType: 'deals', limit: 100, filterGroups: [{ filters: [{ propertyName: 'closedate', operator: 'GTE', value: String(prevStart) }, { propertyName: 'closedate', operator: 'LT', value: String(currStart) }, { propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' }] }], properties: ['amount'] }),
        safe('search_crm_objects', { objectType: 'deals', limit: 1, filterGroups: [{ filters: [{ propertyName: 'closedate', operator: 'GTE', value: String(currStart) }, { propertyName: 'dealstage', operator: 'EQ', value: 'closedlost' }] }], properties: ['createdate'] }),
        safe('search_crm_objects', { objectType: 'deals', limit: 1, filterGroups: [{ filters: [{ propertyName: 'closedate', operator: 'GTE', value: String(prevStart) }, { propertyName: 'closedate', operator: 'LT', value: String(currStart) }, { propertyName: 'dealstage', operator: 'EQ', value: 'closedlost' }] }], properties: ['createdate'] }),
        safe('search_crm_objects', { objectType: 'tasks', limit: 1, filterGroups: [{ filters: [{ propertyName: 'hs_timestamp', operator: 'LT', value: String(now) }, { propertyName: 'hs_task_status', operator: 'NEQ', value: 'COMPLETED' }] }], properties: ['hs_task_status'] }),
        safe('search_crm_objects', { objectType: 'tasks', limit: 1, filterGroups: [{ filters: dateFilters(currStart) }], properties: ['createdate'] }),
        safe('search_crm_objects', { objectType: 'tasks', limit: 1, filterGroups: [{ filters: dateFilters(prevStart, currStart) }], properties: ['createdate'] }),
        safe('search_crm_objects', { objectType: 'calls', limit: 1, filterGroups: [{ filters: dateFilters(currStart) }], properties: ['createdate'] }),
        safe('search_crm_objects', { objectType: 'calls', limit: 1, filterGroups: [{ filters: dateFilters(prevStart, currStart) }], properties: ['createdate'] }),
        safe('search_crm_objects', { objectType: 'meetings', limit: 1, filterGroups: [{ filters: dateFilters(currStart) }], properties: ['createdate'] }),
        safe('search_crm_objects', { objectType: 'meetings', limit: 1, filterGroups: [{ filters: dateFilters(prevStart, currStart) }], properties: ['createdate'] }),
        safe('search_crm_objects', { objectType: 'emails', limit: 1, filterGroups: [{ filters: dateFilters(currStart) }], properties: ['createdate'] }),
        safe('search_crm_objects', { objectType: 'emails', limit: 1, filterGroups: [{ filters: dateFilters(prevStart, currStart) }], properties: ['createdate'] }),
        safe('search_crm_objects', { objectType: 'notes', limit: 1, filterGroups: [{ filters: dateFilters(currStart) }], properties: ['createdate'] }),
        safe('search_crm_objects', { objectType: 'notes', limit: 1, filterGroups: [{ filters: dateFilters(prevStart, currStart) }], properties: ['createdate'] }),
        safe('search_crm_objects', { objectType: 'deals', limit: 1, filterGroups: [{ filters: [{ propertyName: 'closedate', operator: 'LT', value: String(now) }, { propertyName: 'dealstage', operator: 'NEQ', value: 'closedwon' }, { propertyName: 'dealstage', operator: 'NEQ', value: 'closedlost' }] }], properties: ['createdate'] }),
        safe('get_campaign_analytics', { startDate: new Date(currStart).toISOString().split('T')[0], endDate: new Date(now).toISOString().split('T')[0] }),
        safe('get_campaign_analytics', { startDate: new Date(prevStart).toISOString().split('T')[0], endDate: new Date(currStart).toISOString().split('T')[0] }),
        safe('get_campaign_asset_metrics', { assetType: 'FORM', startDate: new Date(currStart).toISOString().split('T')[0], endDate: new Date(now).toISOString().split('T')[0] }),
        safe('get_campaign_asset_metrics', { assetType: 'FORM', startDate: new Date(prevStart).toISOString().split('T')[0], endDate: new Date(currStart).toISOString().split('T')[0] }),
        safe('get_campaign_asset_metrics', { assetType: 'SITE_PAGE', startDate: new Date(currStart).toISOString().split('T')[0], endDate: new Date(now).toISOString().split('T')[0] }),
        safe('get_campaign_asset_metrics', { assetType: 'SITE_PAGE', startDate: new Date(prevStart).toISOString().split('T')[0], endDate: new Date(currStart).toISOString().split('T')[0] })
    ]);

    const currContactsTotal = getTotal(currContacts);
    const prevContactsTotal = getTotal(prevContacts);
    const currDealResults = getResults(currDeals);
    const prevDealResults = getResults(prevDeals);
    const currDealTotal = getTotal(currDeals) || currDealResults.length;
    const prevDealTotal = getTotal(prevDeals) || prevDealResults.length;
    const currPipeline = sumProp(currDealResults, 'amount');
    const prevPipeline = sumProp(prevDealResults, 'amount');
    const currWonResults = getResults(currWon);
    const prevWonResults = getResults(prevWon);
    const currWonCount = getTotal(currWon) || currWonResults.length;
    const prevWonCount = getTotal(prevWon) || prevWonResults.length;
    const currWonValue = sumProp(currWonResults, 'amount');
    const prevWonValue = sumProp(prevWonResults, 'amount');
    const currLostCount = getTotal(currLost);
    const prevLostCount = getTotal(prevLost);
    const currTotalClosed = currWonCount + currLostCount;
    const prevTotalClosed = prevWonCount + prevLostCount;
    const currWinRate = currTotalClosed > 0 ? Math.round((currWonCount / currTotalClosed) * 100) : null;
    const prevWinRate = prevTotalClosed > 0 ? Math.round((prevWonCount / prevTotalClosed) * 100) : null;
    const currAvgDeal = currDealResults.length > 0 ? Math.round(currPipeline / currDealResults.length) : null;
    const prevAvgDeal = prevDealResults.length > 0 ? Math.round(prevPipeline / prevDealResults.length) : null;

    const stageMap = {};
    currDealResults.forEach(d => {
        const stage = d.properties?.dealstage || d.dealstage || 'unknown';
        stageMap[stage] = (stageMap[stage] || 0) + 1;
    });

    const sourceMap = {};
    getResults(currContacts).forEach(c => {
        const src = c.properties?.hs_lead_source || c.hs_lead_source || 'Direct';
        sourceMap[src] = (sourceMap[src] || 0) + 1;
    });

    const parseCampaignOpens = (raw) => {
        const r = parseResult(raw);
        if (!r) return 0;
        const items = Array.isArray(r) ? r : (Array.isArray(r?.results) ? r.results : []);
        return items.reduce((s, c) => s + (c.opens || c.emailOpens || 0), 0);
    };
    const currEmailOpens = parseCampaignOpens(currCampaigns);
    const prevEmailOpens = parseCampaignOpens(prevCampaigns);

    const parseAssetMetric = (raw, key) => {
        const r = parseResult(raw);
        if (!r) return 0;
        const items = Array.isArray(r) ? r : (Array.isArray(r?.results) ? r.results : []);
        return items.reduce((s, a) => s + (a[key] || 0), 0);
    };
    const currForms = parseAssetMetric(currFormSubmissions, 'submissions');
    const prevForms = parseAssetMetric(prevFormSubmissions, 'submissions');
    const currViews = parseAssetMetric(currPageViews, 'views');
    const prevViews = parseAssetMetric(prevPageViews, 'views');

    const data = {
        fetchedAt: now,
        contacts: { current: currContactsTotal, prior: prevContactsTotal, change: pct(currContactsTotal, prevContactsTotal), sources: sourceMap },
        deals: {
            created: { current: currDealTotal, prior: prevDealTotal, change: pct(currDealTotal, prevDealTotal) },
            pipeline: { current: currPipeline, prior: prevPipeline, change: pct(currPipeline, prevPipeline) },
            won: { count: { current: currWonCount, prior: prevWonCount, change: pct(currWonCount, prevWonCount) }, value: { current: currWonValue, prior: prevWonValue, change: pct(currWonValue, prevWonValue) } },
            lost: { current: currLostCount, prior: prevLostCount, change: pct(currLostCount, prevLostCount) },
            winRate: { current: currWinRate, prior: prevWinRate, change: currWinRate !== null && prevWinRate !== null ? currWinRate - prevWinRate : null, isPoints: true },
            avgSize: { current: currAvgDeal, prior: prevAvgDeal, change: pct(currAvgDeal, prevAvgDeal) },
            byStage: stageMap,
            overdueCount: getTotal(overdueDeals)
        },
        activity: {
            tasks: { current: getTotal(currTasks), prior: getTotal(prevTasks), change: pct(getTotal(currTasks), getTotal(prevTasks)) },
            overdueTasks: getTotal(overdueTasks),
            calls: { current: getTotal(currCalls), prior: getTotal(prevCalls), change: pct(getTotal(currCalls), getTotal(prevCalls)) },
            meetings: { current: getTotal(currMeetings), prior: getTotal(prevMeetings), change: pct(getTotal(currMeetings), getTotal(prevMeetings)) },
            emails: { current: getTotal(currEmails), prior: getTotal(prevEmails), change: pct(getTotal(currEmails), getTotal(prevEmails)) },
            notes: { current: getTotal(currNotes), prior: getTotal(prevNotes), change: pct(getTotal(currNotes), getTotal(prevNotes)) }
        },
        marketing: {
            emailOpens: { current: currEmailOpens, prior: prevEmailOpens, change: pct(currEmailOpens, prevEmailOpens) },
            formSubmissions: { current: currForms, prior: prevForms, change: pct(currForms, prevForms) },
            pageViews: { current: currViews, prior: prevViews, change: pct(currViews, prevViews) }
        }
    };

    req.session.dashboardCache = { data, fetchedAt: now };
    res.json(data);
});

module.exports = router;
