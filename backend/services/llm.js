const axios = require('axios');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = 'google/gemini-3.1-flash-lite';

const CHAT_SYSTEM_PROMPT = `You are a friendly and professional HubSpot assistant. Help users manage their HubSpot CRM.

RULES:
1. Keep responses short and conversational. Never mention tool names or JSON.
2. When a user asks you to CREATE, UPDATE, or DELETE something:
   - Call the appropriate tool (this stages the action — it won't run until the user confirms)
   - Also write a friendly message saying what you're about to do and asking if they'd like to proceed
   - Example: "I'll add Darren Seet as a new contact with email dseet@example.com. Want me to go ahead?"
3. When a user asks you to SEARCH or READ data, call the appropriate tool right away — no confirmation needed.
4. If you need more info before you can act (e.g. missing email), ask for it first.
5. Keep responses concise.`;

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

async function getChatCompletion(messages, tools = []) {
    try {
        return await callOpenRouter(CHAT_SYSTEM_PROMPT, messages, tools);
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
