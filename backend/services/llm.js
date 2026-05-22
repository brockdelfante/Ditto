const axios = require('axios');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const SYSTEM_PROMPT = `You are a friendly and professional HubSpot assistant. Help users manage their HubSpot CRM through natural, conversational language.

RULES:
1. Never mention tool names, JSON, or technical details in your responses.
2. When a user asks you to do something, confirm what you're about to do in plain English and ask if they'd like to proceed. Example: "I'll create a new contact for Alice Smith with the email alice@example.com. Want me to go ahead?"
3. Only call tools after the user has confirmed. Wait for a clear "yes" or similar before acting.
4. If you need more information (like a name or email) before you can act, ask for it first.
5. Keep responses concise and conversational — like a helpful colleague, not a robot.`;

async function callOpenRouter(messages, tools = []) {
    const payload = {
        model: 'google/gemini-3.1-flash-lite',
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages]
    };

    if (tools.length > 0) {
        payload.tools = tools.map(tool => ({
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.inputSchema
            }
        }));
        payload.tool_choice = 'auto';
    }

    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', payload, {
        headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'HTTP-Referer': 'https://render.com',
            'X-Title': 'HubSpot Assistant',
            'Content-Type': 'application/json'
        }
    });

    if (!response.data.choices || response.data.choices.length === 0) {
        throw new Error('No completion choices returned from OpenRouter');
    }

    return response.data.choices[0].message;
}

async function getChatCompletion(messages, tools = []) {
    try {
        return await callOpenRouter(messages, tools);
    } catch (error) {
        console.error('Error calling OpenRouter:', error.response?.data || error.message);
        throw error;
    }
}

async function generateSummary(history, userMessage, toolResults) {
    try {
        const messages = [
            ...history.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: userMessage || 'Yes, go ahead.' },
            {
                role: 'user',
                content: `The following HubSpot actions were completed. Please summarize what was done in a friendly, natural way without mentioning tool names or technical details:\n${JSON.stringify(toolResults, null, 2)}`
            }
        ];
        const response = await callOpenRouter(messages);
        return response.content;
    } catch (error) {
        console.error('Error generating summary:', error.response?.data || error.message);
        return 'Done! The actions were completed successfully.';
    }
}

module.exports = { getChatCompletion, generateSummary };
