const express = require('express');
const router = express.Router();
const { getChatCompletion, generateSummary } = require('../services/llm');
const HubSpotMCPClient = require('../services/hubspot');

router.post('/chat', async (req, res) => {
    const { message, history = [] } = req.body;
    const tokens = req.session.tokens;

    if (!tokens) {
        return res.json({
            reply: 'Please connect to HubSpot first using the "Connect" button.',
            needsAuth: true
        });
    }

    try {
        const messages = [
            ...history.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: message }
        ];

        // No tools passed — LLM just converses and asks for confirmation before acting
        const response = await getChatCompletion(messages, []);

        // Detect if LLM is proposing an action and waiting for user confirmation
        const proposalPhrases = ['shall i', 'want me to', 'should i', 'would you like me to', 'go ahead', 'proceed', 'shall we', 'like me to', 'ready to'];
        const pendingAction = proposalPhrases.some(p => response.content?.toLowerCase().includes(p));

        res.json({ reply: response.content, pendingAction });
    } catch (error) {
        console.error('Chat error:', error.message);
        res.status(500).json({ error: 'Failed to process chat: ' + error.message });
    }
});

router.post('/execute', async (req, res) => {
    const { approved, message, history = [] } = req.body;
    const tokens = req.session.tokens;

    if (!tokens) return res.status(401).json({ error: 'Unauthorized' });

    if (!approved) {
        return res.json({ reply: "No problem, I won't make those changes. Is there anything else I can help you with?" });
    }

    try {
        const hubspot = new HubSpotMCPClient(req.session);

        // Fetch tools (cached per session)
        const TOOLS_TTL = 10 * 60 * 1000;
        const cache = req.session.toolsCache;
        let tools;
        if (cache && (Date.now() - cache.fetchedAt) < TOOLS_TTL) {
            tools = cache.tools;
        } else {
            tools = await hubspot.listTools();
            req.session.toolsCache = { tools, fetchedAt: Date.now() };
        }

        // Call LLM with full conversation history + tools so it generates the right tool calls
        const messages = [
            ...history.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: message || 'Yes, please go ahead.' }
        ];

        const response = await getChatCompletion(messages, tools);

        if (!response.tool_calls || response.tool_calls.length === 0) {
            return res.json({ reply: response.content || 'Done!' });
        }

        // Execute the tool calls
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

const DASHBOARD_TTL = 12 * 60 * 60 * 1000; // 12 hours

router.get('/dashboard', async (req, res) => {
    if (!req.session.tokens) return res.json({ connected: false });

    const cache = req.session.dashboardCache;
    if (cache && (Date.now() - cache.fetchedAt) < DASHBOARD_TTL) {
        return res.json(cache.data);
    }

    const hubspot = new HubSpotMCPClient(req.session);
    const data = { fetchedAt: Date.now() };

    try {
        data.contacts = await hubspot.callTool('search_crm_objects', {
            objectType: 'contacts',
            limit: 5,
            sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
            properties: ['firstname', 'lastname', 'email', 'createdate']
        });
    } catch (e) {
        console.error('Dashboard contacts error:', e.message);
        data.contacts = null;
    }

    try {
        data.deals = await hubspot.callTool('search_crm_objects', {
            objectType: 'deals',
            limit: 5,
            sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
            properties: ['dealname', 'amount', 'dealstage', 'closedate']
        });
    } catch (e) {
        console.error('Dashboard deals error:', e.message);
        data.deals = null;
    }

    try {
        data.companies = await hubspot.callTool('search_crm_objects', {
            objectType: 'companies',
            limit: 5,
            sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
            properties: ['name', 'domain', 'industry']
        });
    } catch (e) {
        console.error('Dashboard companies error:', e.message);
        data.companies = null;
    }

    req.session.dashboardCache = { data, fetchedAt: Date.now() };
    res.json(data);
});

module.exports = router;
