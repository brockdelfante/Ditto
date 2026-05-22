const express = require('express');
const router = express.Router();
const { getChatCompletion, generateSummary } = require('../services/llm');
const HubSpotMCPClient = require('../services/hubspot');

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

// ── Chat ──────────────────────────────────────────────────────────────────

router.post('/chat', async (req, res) => {
    const { message, history = [] } = req.body;
    const tokens = req.session.tokens;

    if (!tokens) {
        return res.json({ reply: 'Please connect to HubSpot first using the "Connect" button.', needsAuth: true });
    }

    try {
        const messages = [
            ...history.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: message }
        ];

        const response = await getChatCompletion(messages, []);

        const proposalPhrases = ['shall i', 'want me to', 'should i', 'would you like me to', 'go ahead', 'proceed', 'shall we', 'like me to', 'ready to'];
        const pendingAction = proposalPhrases.some(p => response.content?.toLowerCase().includes(p));

        res.json({ reply: response.content, pendingAction });
    } catch (error) {
        console.error('Chat error:', error.message);
        res.status(500).json({ error: 'Failed to process chat: ' + error.message });
    }
});

// ── Execute ───────────────────────────────────────────────────────────────

router.post('/execute', async (req, res) => {
    const { approved, message, history = [] } = req.body;
    const tokens = req.session.tokens;

    if (!tokens) return res.status(401).json({ error: 'Unauthorized' });

    if (!approved) {
        return res.json({ reply: "No problem, I won't make those changes. Is there anything else I can help you with?" });
    }

    try {
        const hubspot = new HubSpotMCPClient(req.session);

        const TOOLS_TTL = 10 * 60 * 1000;
        const cache = req.session.toolsCache;
        let tools;
        if (cache && (Date.now() - cache.fetchedAt) < TOOLS_TTL) {
            tools = cache.tools;
        } else {
            tools = await hubspot.listTools();
            req.session.toolsCache = { tools, fetchedAt: Date.now() };
        }

        const messages = [
            ...history.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: message || 'Yes, please go ahead.' }
        ];

        const response = await getChatCompletion(messages, tools);

        if (!response.tool_calls || response.tool_calls.length === 0) {
            return res.json({ reply: response.content || 'Done!' });
        }

        const toolResults = [];
        for (const toolCall of response.tool_calls) {
            const result = await hubspot.callTool(toolCall.function.name, JSON.parse(toolCall.function.arguments));
            toolResults.push({ tool: toolCall.function.name, result });
        }

        const reply = await generateSummary(history, message, toolResults);
        res.json({ reply });
    } catch (error) {
        console.error('Execution error:', error.message);
        res.status(500).json({ error: 'Failed to execute actions: ' + error.message });
    }
});

// ── Dashboard ─────────────────────────────────────────────────────────────

const DASHBOARD_TTL = 30 * 60 * 1000; // 30 minutes

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

    // Run all fetches in parallel
    const [
        currContacts, prevContacts,
        currDeals, prevDeals,
        currWon, prevWon,
        currLost, prevLost,
        overdueTasks, currTasks, prevTasks,
        currCalls, prevCalls,
        currMeetings, prevMeetings,
        overdueDeals,
        campaigns
    ] = await Promise.all([
        // Contacts
        safe('search_crm_objects', { objectType: 'contacts', limit: 100, filterGroups: [{ filters: dateFilters(currStart) }], properties: ['firstname', 'lastname', 'email', 'hs_lead_source'] }),
        safe('search_crm_objects', { objectType: 'contacts', limit: 1, filterGroups: [{ filters: dateFilters(prevStart, currStart) }], properties: ['createdate'] }),

        // Deals created
        safe('search_crm_objects', { objectType: 'deals', limit: 100, filterGroups: [{ filters: dateFilters(currStart) }], properties: ['dealname', 'amount', 'dealstage', 'pipeline', 'hubspot_owner_id'] }),
        safe('search_crm_objects', { objectType: 'deals', limit: 100, filterGroups: [{ filters: dateFilters(prevStart, currStart) }], properties: ['amount', 'dealstage'] }),

        // Closed won — filter by closedate
        safe('search_crm_objects', { objectType: 'deals', limit: 100, filterGroups: [{ filters: [{ propertyName: 'closedate', operator: 'GTE', value: String(currStart) }, { propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' }] }], properties: ['amount', 'createdate', 'closedate'] }),
        safe('search_crm_objects', { objectType: 'deals', limit: 100, filterGroups: [{ filters: [{ propertyName: 'closedate', operator: 'GTE', value: String(prevStart) }, { propertyName: 'closedate', operator: 'LT', value: String(currStart) }, { propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' }] }], properties: ['amount'] }),

        // Closed lost
        safe('search_crm_objects', { objectType: 'deals', limit: 1, filterGroups: [{ filters: [{ propertyName: 'closedate', operator: 'GTE', value: String(currStart) }, { propertyName: 'dealstage', operator: 'EQ', value: 'closedlost' }] }], properties: ['createdate'] }),
        safe('search_crm_objects', { objectType: 'deals', limit: 1, filterGroups: [{ filters: [{ propertyName: 'closedate', operator: 'GTE', value: String(prevStart) }, { propertyName: 'closedate', operator: 'LT', value: String(currStart) }, { propertyName: 'dealstage', operator: 'EQ', value: 'closedlost' }] }], properties: ['createdate'] }),

        // Tasks overdue
        safe('search_crm_objects', { objectType: 'tasks', limit: 1, filterGroups: [{ filters: [{ propertyName: 'hs_timestamp', operator: 'LT', value: String(now) }, { propertyName: 'hs_task_status', operator: 'NEQ', value: 'COMPLETED' }] }], properties: ['hs_task_status'] }),
        safe('search_crm_objects', { objectType: 'tasks', limit: 1, filterGroups: [{ filters: dateFilters(currStart) }], properties: ['createdate'] }),
        safe('search_crm_objects', { objectType: 'tasks', limit: 1, filterGroups: [{ filters: dateFilters(prevStart, currStart) }], properties: ['createdate'] }),

        // Calls
        safe('search_crm_objects', { objectType: 'calls', limit: 1, filterGroups: [{ filters: dateFilters(currStart) }], properties: ['createdate'] }),
        safe('search_crm_objects', { objectType: 'calls', limit: 1, filterGroups: [{ filters: dateFilters(prevStart, currStart) }], properties: ['createdate'] }),

        // Meetings
        safe('search_crm_objects', { objectType: 'meetings', limit: 1, filterGroups: [{ filters: dateFilters(currStart) }], properties: ['createdate'] }),
        safe('search_crm_objects', { objectType: 'meetings', limit: 1, filterGroups: [{ filters: dateFilters(prevStart, currStart) }], properties: ['createdate'] }),

        // Deals past expected close date (open)
        safe('search_crm_objects', { objectType: 'deals', limit: 1, filterGroups: [{ filters: [{ propertyName: 'closedate', operator: 'LT', value: String(now) }, { propertyName: 'dealstage', operator: 'NEQ', value: 'closedwon' }, { propertyName: 'dealstage', operator: 'NEQ', value: 'closedlost' }] }], properties: ['createdate'] }),

        // Campaign analytics
        safe('get_campaign_analytics', { limit: 10 })
    ]);

    // ── Calculate metrics ──────────────────────────────────────────────

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

    // Stage breakdown
    const stageMap = {};
    currDealResults.forEach(d => {
        const stage = d.properties?.dealstage || d.dealstage || 'unknown';
        stageMap[stage] = (stageMap[stage] || 0) + 1;
    });

    // Lead source breakdown
    const sourceMap = {};
    getResults(currContacts).forEach(c => {
        const src = c.properties?.hs_lead_source || c.hs_lead_source || 'Direct';
        sourceMap[src] = (sourceMap[src] || 0) + 1;
    });

    const data = {
        fetchedAt: now,
        contacts: {
            current: currContactsTotal,
            prior: prevContactsTotal,
            change: pct(currContactsTotal, prevContactsTotal),
            sources: sourceMap
        },
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
            calls: currCalls !== null ? { current: getTotal(currCalls), prior: getTotal(prevCalls), change: pct(getTotal(currCalls), getTotal(prevCalls)) } : null,
            meetings: currMeetings !== null ? { current: getTotal(currMeetings), prior: getTotal(prevMeetings), change: pct(getTotal(currMeetings), getTotal(prevMeetings)) } : null
        },
        campaigns: campaigns ? parseResult(campaigns) : null
    };

    req.session.dashboardCache = { data, fetchedAt: now };
    res.json(data);
});

module.exports = router;
