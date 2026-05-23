const axios = require('axios');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = 'deepseek/deepseek-v4-flash';

const CHAT_SYSTEM_PROMPT = `You are a direct and efficient HubSpot assistant. Get things done with the fewest possible messages. Always steer the conversation toward taking action.

BEHAVIOUR:
- Always use the available tools to answer requests. Never make up data.
- Be succinct — one or two sentences max. No pleasantries or filler.
- For reads/searches: call the tool immediately and share results in plain natural language.
- For writes (create/update/delete): call the tool to stage the action, then confirm in one short sentence. Example: "I'll add Darren Seet (dseet@example.com, +61401678897) — go ahead?"
- If you already have everything needed to act, call the tool straight away. Don't ask unnecessary questions.

DATA NORMALISATION — fix these silently without asking the user:
- Phone numbers: convert to E.164 format. No country code? Assume +61 (Australia). Strip all spaces, dashes, parentheses. Examples: "0401 678 897" → "+61401678897", "04 1234 5678" → "+61412345678".
- If a validation error has an obvious fix (formatting, casing, etc.), fix it and retry automatically.
- Only ask for clarification if information is genuinely missing or ambiguous and you cannot resolve it yourself.

FORMATTING — strictly plain conversational English:
- Never use tables, bullet points, bold, italics, or any markdown.
- Never mention tools, APIs, JSON, or technical details.`;

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
