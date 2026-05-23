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
- Phone numbers: convert to E.164 format. No country code? Assume +61 (Australia). Strip all spaces, dashes, parentheses. e.g. "0401 678 897" → "+61401678897".
- If a validation error has an obvious fix (formatting, casing, etc.), fix it and retry automatically.
- Only ask for clarification if information is genuinely missing or ambiguous.

EMAIL VALIDATION — mandatory:
- Before adding a new contact: always call validate_email first. If status is "valid", proceed. If invalid or disposable, tell the user the status in plain language and ask how to proceed.
- When looking up or updating a contact: check if their ZB_STATUS property is set. If missing or empty, call validate_email and then update the contact's ZB_STATUS property with the returned "status" value via manage_crm_objects.
- Always write the validation status to the HubSpot ZB_STATUS property on the contact record.

QUICK ACTION FLOWS — when user selects one of these intents, follow exactly:
- "I want to manage an existing contact or deal": Ask for the contact's name. Search HubSpot. If found and ZB_STATUS is missing, validate their email and update ZB_STATUS. Then ask what they want to do.
- "I want to add a new contact": Ask for name and email (and phone if not given). Check HubSpot to confirm they don't already exist. Validate the email. If valid, add the contact and set ZB_STATUS. If invalid, tell the user and ask how to proceed.
- "I want to log sales activity": Ask for the contact's name and the activity type (meeting, note, call, email, or task) and details. Look up the contact. Validate email if ZB_STATUS is missing. Log the activity and associate it with the contact.

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
