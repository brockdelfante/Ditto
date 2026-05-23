const axios = require('axios');

const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const TAVILY_MCP_URL = `https://mcp.tavily.com/mcp/?tavilyApiKey=${TAVILY_API_KEY}`;

async function callTool(name, parameters) {
    const response = await axios.post(TAVILY_MCP_URL, {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name, arguments: parameters },
        id: Date.now()
    }, {
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream'
        }
    });
    if (response.data.error) throw new Error(response.data.error.message);
    return response.data.result;
}

async function listTools() {
    const response = await axios.post(TAVILY_MCP_URL, {
        jsonrpc: '2.0',
        method: 'tools/list',
        params: {},
        id: Date.now()
    }, {
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream'
        }
    });
    const result = response.data.result;
    if (!result) return [];
    return Array.isArray(result) ? result : (result.tools || []);
}

module.exports = { callTool, listTools };
