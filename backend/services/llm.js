const axios = require('axios');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const SYSTEM_PROMPT = `You are a friendly and professional HubSpot assistant. Help users manage their HubSpot CRM through natural conversation.

You can help users with contacts, companies, deals, campaigns, marketing events, and CRM properties.

RULES:
1. Never mention tool names, JSON, or any technical details in your responses.
2. When a user asks you to do something, respond conversationally describing what you plan to do and ask for their confirmation. Example: "I'll create a new contact for Alice Smith with the email alice@example.com. Want me to go ahead?"
3. NEVER call tools or take actions without the user explicitly confirming first. Just describe the plan and ask.
4. If you need more information (like a name or email), ask for it before proposing any action.
5. Keep responses concise and conversational — like a helpful colleague.
6. After completing an action, summarize clearly what was done in plain English.`;

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
