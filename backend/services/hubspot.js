const axios = require('axios');

const CLIENT_ID = process.env.HUBSPOT_CLIENT_ID;
const CLIENT_SECRET = process.env.HUBSPOT_CLIENT_SECRET;
const MCP_SERVER_URL = 'https://mcp.hubspot.com';

let oauthMeta = null;
async function getOAuthMeta() {
    if (oauthMeta) return oauthMeta;
    const res = await axios.get(`${MCP_SERVER_URL}/.well-known/oauth-authorization-server`);
    oauthMeta = res.data;
    return oauthMeta;
}

class HubSpotMCPClient {
    constructor(session) {
        this.session = session;
        this.baseUrl = MCP_SERVER_URL;
    }

    async getValidToken() {
        let tokens = this.session.tokens;
        if (!tokens) throw new Error('No tokens found in session');

        const now = Date.now();
        const buffer = 5 * 60 * 1000;

        if (tokens.expiry && now > (tokens.expiry - buffer)) {
            console.log('Refreshing HubSpot token...');
            try {
                const meta = await getOAuthMeta();
                const response = await axios.post(meta.token_endpoint, new URLSearchParams({
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
            if (!result) {
                throw new Error(`HubSpot MCP returned no result. Full response: ${JSON.stringify(response.data)}`);
            }
            return Array.isArray(result) ? result : result.tools;
        } catch (error) {
            console.error('Error listing HubSpot MCP tools:', error.response?.data || error.message);
            throw error;
        }
    }
}

module.exports = HubSpotMCPClient;
