const axios = require('axios');

const CLIENT_ID = process.env.HUBSPOT_CLIENT_ID;
const CLIENT_SECRET = process.env.HUBSPOT_CLIENT_SECRET;

class HubSpotMCPClient {
    constructor(session) {
        this.session = session;
        this.baseUrl = 'https://mcp.hubspot.com';
    }

    async getValidToken() {
        let tokens = this.session.tokens;
        if (!tokens) throw new Error('No tokens found in session');

        // HubSpot tokens usually last 30 minutes. Let's refresh if they are close to expiring.
        // We calculate expiration based on when we received them.
        // In this prototype, we'll just check if we have a refresh token.
        const now = Date.now();
        const buffer = 5 * 60 * 1000; // 5 minutes

        if (tokens.expiry && now > (tokens.expiry - buffer)) {
            console.log('Refreshing HubSpot token...');
            try {
                const response = await axios.post('https://api.hubapi.com/oauth/v1/token', new URLSearchParams({
                    grant_type: 'refresh_token',
                    client_id: CLIENT_ID,
                    client_secret: CLIENT_SECRET,
                    refresh_token: tokens.refresh_token
                }), {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                });

                tokens = {
                    ...response.data,
                    expiry: Date.now() + (response.data.expires_in * 1000)
                };
                this.session.tokens = tokens;
            } catch (error) {
                console.error('Failed to refresh token:', error.response?.data || error.message);
                throw new Error('HubSpot connection expired. Please reconnect.');
            }
        }

        return tokens.access_token;
    }

    async callTool(name, parameters) {
        const accessToken = await this.getValidToken();
        try {
            const response = await axios.post(this.baseUrl, {
                jsonrpc: '2.0',
                method: 'tools/call',
                params: {
                    name,
                    arguments: parameters
                },
                id: Date.now()
            }, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
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
        const accessToken = await this.getValidToken();
        try {
            const response = await axios.post(this.baseUrl, {
                jsonrpc: '2.0',
                method: 'tools/list',
                params: {},
                id: Date.now()
            }, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            const result = response.data.result;
            console.log('HubSpot listTools raw response:', JSON.stringify(response.data));
            if (!result) {
                throw new Error(`HubSpot MCP returned no result. Full response: ${JSON.stringify(response.data)}`);
            }
            // Handle both {tools: [...]} and plain array formats
            return Array.isArray(result) ? result : result.tools;
        } catch (error) {
            console.error('Error listing HubSpot MCP tools:', error.response?.data || error.message);
            throw error;
        }
    }
}

module.exports = HubSpotMCPClient;
