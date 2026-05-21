const express = require('express');
const router = express.Router();
const { getChatCompletion } = require('../services/llm');
const HubSpotMCPClient = require('../services/hubspot');

// In-memory store for pending actions
const pendingActions = new Map();

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
        const hubspot = new HubSpotMCPClient(req.session);
        const tools = await hubspot.listTools();

        const messages = [
            ...history.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: message }
        ];
        const response = await getChatCompletion(messages, tools);

        if (response.tool_calls) {
            const executionId = Math.random().toString(36).substring(7);
            pendingActions.set(executionId, response.tool_calls);

            return res.json({
                reply: response.content || 'I have some HubSpot actions to propose:',
                proposal: response.tool_calls,
                executionId
            });
        }

        res.json({ reply: response.content });
    } catch (error) {
        console.error('Chat error:', error.message);
        res.status(500).json({ error: 'Failed to process chat: ' + error.message });
    }
});

router.post('/execute', async (req, res) => {
    const { executionId, approved } = req.body;
    const tokens = req.session.tokens;

    if (!tokens) return res.status(401).json({ error: 'Unauthorized' });

    const toolsToCall = pendingActions.get(executionId);
    if (!toolsToCall) return res.status(404).json({ error: 'Proposal not found' });

    pendingActions.delete(executionId);

    if (!approved) {
        return res.json({ reply: 'Action cancelled.' });
    }

    try {
        const hubspot = new HubSpotMCPClient(req.session);
        const results = [];

        for (const toolCall of toolsToCall) {
            const result = await hubspot.callTool(toolCall.function.name, JSON.parse(toolCall.function.arguments));
            results.push({ tool: toolCall.function.name, result });
        }

        res.json({
            reply: 'Successfully executed HubSpot actions.',
            results
        });
    } catch (error) {
        console.error('Execution error:', error.message);
        res.status(500).json({ error: 'Failed to execute actions: ' + error.message });
    }
});

module.exports = router;
