const axios = require('axios');

class HubSpotMCPClient {
    constructor(accessToken) {
        this.accessToken = accessToken;
        this.baseUrl = 'https://mcp.hubspot.com';
    }

    async callTool(name, parameters) {
        try {
            const response = await axios.post(this.baseUrl, {
                jsonrpc: '2.0',
                method: 'call_tool',
                params: {
                    name,
                    arguments: parameters
                },
                id: Date.now()
            }, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.data.error) {
                throw new Error(response.data.error.message);
            }

            return response.data.result;
        } catch (error) {
            console.error(`Error calling HubSpot MCP tool ${name}:`, error.response?.data || error.message);
            throw error;
        }
    }

    async listTools() {
        try {
            const response = await axios.post(this.baseUrl, {
                jsonrpc: '2.0',
                method: 'list_tools',
                params: {},
                id: Date.now()
            }, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            return response.data.result.tools;
        } catch (error) {
            console.error('Error listing HubSpot MCP tools:', error.response?.data || error.message);
            throw error;
        }
    }
}

module.exports = HubSpotMCPClient;
