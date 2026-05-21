const axios = require('axios');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

async function getChatCompletion(messages, tools = []) {
    try {
        const payload = {
            model: 'anthropic/claude-3-sonnet',
            messages: [
                {
                    role: 'system',
                    content: 'You are a helpful staff assistant with access to HubSpot CRM. When a user asks you to perform an action in HubSpot, use the provided tools. ALWAYS explain what you are going to do before calling a tool.'
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
                'HTTP-Referer': 'https://render.com', // Replace with your actual site URL
                'X-Title': 'HubSpot Staff Assistant',
                'Content-Type': 'application/json'
            }
        });

        return response.data.choices[0].message;
    } catch (error) {
        console.error('Error calling OpenRouter:', error.response?.data || error.message);
        throw error;
    }
}

module.exports = { getChatCompletion };
