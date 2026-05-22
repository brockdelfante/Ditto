const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const router = express.Router();

const CLIENT_ID = process.env.HUBSPOT_CLIENT_ID;
const CLIENT_SECRET = process.env.HUBSPOT_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

const AUTHORIZATION_ENDPOINT = 'https://app.hubspot.com/oauth/authorize';
const TOKEN_ENDPOINT = 'https://api.hubapi.com/oauth/v3/token';
const MCP_SERVER_URL = 'https://mcp.hubspot.com';

function generateCodeVerifier() {
    return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier) {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
}

async function exchangeToken(code, codeVerifier, session, res) {
    console.log('Exchanging code for tokens...');
    try {
        const response = await axios.post(TOKEN_ENDPOINT, new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            redirect_uri: REDIRECT_URI,
            code: code,
            code_verifier: codeVerifier
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        console.log('Token response received:', {
            access_token_length: response.data.access_token?.length || 0,
            token_type: response.data.token_type,
            expires_in: response.data.expires_in,
            has_refresh_token: !!response.data.refresh_token
        });

        const tokens = {
            ...response.data,
            expiry: Date.now() + (response.data.expires_in * 1000)
        };

        session.tokens = tokens;

        if (res) {
            res.cookie('hubspot_tokens', JSON.stringify(tokens), {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                maxAge: 7 * 24 * 60 * 60 * 1000,
                sameSite: 'lax'
            });
        }

        console.log('Token exchange successful.');
        return true;
    } catch (error) {
        console.error('Error exchanging code for tokens:', error.response?.status, error.response?.data || error.message);
        return false;
    }
}

router.get('/hubspot', (req, res) => {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    req.session.codeVerifier = codeVerifier;

    const authUrl = `${AUTHORIZATION_ENDPOINT}` +
        `?client_id=${encodeURIComponent(CLIENT_ID)}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&response_type=code` +
        `&code_challenge=${encodeURIComponent(codeChallenge)}` +
        `&code_challenge_method=S256`;

    console.log('Redirecting to HubSpot Auth URL...');
    res.redirect(authUrl);
});

router.get('/status', (req, res) => {
    res.json({
        connected: !!req.session.tokens,
        user: req.session.tokens ? 'Authenticated User' : null
    });
});

module.exports = { router, exchangeToken };
