const axios = require('axios');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

async function getChatCompletion(messages, tools = []) {
    try {
        const payload = {
            model: 'google/gemini-3.1-flash-lite',
            messages: [
                {
                    role: 'system',
                    content: `You are a professional HubSpot Staff Assistant.
Your goal is to help users manage their CRM data efficiently.
You have access to the HubSpot MCP server which provides tools for Contacts, Companies, Deals, etc.

GUIDELINES:
1. When a user asks to perform an action (e.g., "Create a contact"), identify the correct tool and parameters.
2. ALWAYS provide a brief, friendly natural language response explaining what you are about to do before calling the tool.
3. If information is missing (like an email for a contact), ask the user for it.
4. For associations (e.g., associating a contact with a company), look for tools like 'manage_crm_objects' or 'search_crm_objects' to find IDs first if they aren't provided.
5. Use 'search_crm_objects' to find existing records before creating duplicates if appropriate.
6. Your responses should be concise and helpful.`
                },
                ...messages
            ]
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
                'X-Title': 'HubSpot Staff Assistant',
                'Content-Type': 'application/json'
            }
        });

        if (!response.data.choices || response.data.choices.length === 0) {
            throw new Error('No completion choices returned from OpenRouter');
        }

        return response.data.choices[0].message;
    } catch (error) {
        console.error('Error calling OpenRouter:', error.response?.data || error.message);
        throw error;
    }
}

module.exports = { getChatCompletion };
