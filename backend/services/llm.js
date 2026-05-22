const axios = require('axios');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = 'deepseek/deepseek-v4-flash';

const CHAT_SYSTEM_PROMPT = `You are a friendly and professional HubSpot assistant.

BEHAVIOUR:
- Always use the available tools to answer requests. Never make up data.
- For reads/searches: call the tool and respond naturally with the results. No confirmation needed.
- For writes (creating, updating, deleting): call the tool to prepare the action, then ask the user to confirm in plain English before it runs. Example: "I'll add Darren Seet (dseet@example.com, 0401 678 897) as a new contact. Shall I go ahead?"
- If you need more info to complete a request, ask for it first — don't act on incomplete data.
- Never mention tools, APIs, JSON, or technical details. Just talk to the user like a helpful colleague.
- Keep responses short and natural.`;

const SUMMARY_SYSTEM_PROMPT = `You are a HubSpot assistant. Summarise what was just done in 1-2 friendly sentences. Never mention tool names or raw data.`;

async function callOpenRouter(systemPrompt, messages, tools = [], forceTools = false) {
    const payload = {
        model: MODEL,
        messages: [{ role: 'system', content: systemPrompt }, ...messages]
    };

    if (tools.length > 0) {
        payload.tools = tools.map(t => ({
            type: 'function',
            function: { name: t.name, description: t.description, parameters: t.inputSchema }
        }));
        payload.tool_choice = forceTools ? 'required' : 'auto';
    }

    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', payload, {
        headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'HTTP-Referer': 'https://render.com',
            'X-Title': 'HubSpot Assistant',
            'Content-Type': 'application/json'
        }
    });

    if (!response.data.choices?.length) throw new Error('No choices returned from OpenRouter');
    return response.data.choices[0].message;
}

async function getChatCompletion(messages, tools = [], forceTools = false) {
    try {
        return await callOpenRouter(CHAT_SYSTEM_PROMPT, messages, tools, forceTools);
    } catch (error) {
        console.error('Error calling OpenRouter:', error.response?.data || error.message);
        throw error;
    }
}

async function generateSummary(history, userMessage, toolResults) {
    try {
        const messages = [
            ...history.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: userMessage || 'Done.' },
            { role: 'user', content: `Tool results: ${JSON.stringify(toolResults)}` }
        ];
        const response = await callOpenRouter(SUMMARY_SYSTEM_PROMPT, messages);
        return response.content;
    } catch {
        return 'Done! The action completed successfully.';
    }
}

module.exports = { getChatCompletion, generateSummary };
