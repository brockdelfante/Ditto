const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const router = express.Router();

const CLIENT_ID = process.env.HUBSPOT_CLIENT_ID;
const CLIENT_SECRET = process.env.HUBSPOT_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

function generateCodeVerifier() {
    return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier) {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
}

router.get('/hubspot', (req, res) => {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    req.session.codeVerifier = codeVerifier;

    // Using the specific HubSpot MCP OAuth endpoint
    const authUrl = `https://mcp-ap1.hubspot.com/oauth/authorize/user` +
        `?client_id=${encodeURIComponent(CLIENT_ID)}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&code_challenge=${encodeURIComponent(codeChallenge)}` +
        `&code_challenge_method=S256`;

    res.redirect(authUrl);
});

router.get('/hubspot/callback', async (req, res) => {
    const { code } = req.query;
    const codeVerifier = req.session.codeVerifier;

    if (!code) {
        return res.status(400).send('Authorization code missing');
    }

    try {
        // Token exchange endpoint is usually standard, but let's be careful.
        // The documentation mentions "exchange your authorization code for access and refresh tokens".
        const response = await axios.post('https://api.hubapi.com/oauth/v1/token', new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            redirect_uri: REDIRECT_URI,
            code: code,
            code_verifier: codeVerifier
        }), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        req.session.tokens = response.data;
        res.send('HubSpot connected successfully! You can close this tab and return to the chat.');
    } catch (error) {
        console.error('Error exchanging code for tokens:', error.response?.data || error.message);
        res.status(500).send('Authentication failed: ' + (error.response?.data?.message || error.message));
    }
});

router.get('/status', (req, res) => {
    res.json({
        connected: !!req.session.tokens,
        user: req.session.tokens ? 'Authenticated User' : null
    });
});

module.exports = router;
