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

async function exchangeToken(code, codeVerifier, session) {
    console.log('Exchanging code for tokens with verifier:', codeVerifier);
    try {
        const response = await axios.post('https://api.hubapi.com/oauth/v1/token', new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            redirect_uri: REDIRECT_URI,
            code: code,
            code_verifier: codeVerifier
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        session.tokens = {
            ...response.data,
            expiry: Date.now() + (response.data.expires_in * 1000)
        };
        console.log('Token exchange successful.');
        return true;
    } catch (error) {
        console.error('Error exchanging code for tokens:', error.response?.data || error.message);
        return false;
    }
}

router.get('/hubspot', (req, res) => {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    req.session.codeVerifier = codeVerifier;

    const authUrl = `https://mcp-ap1.hubspot.com/oauth/authorize/user` +
        `?client_id=${encodeURIComponent(CLIENT_ID)}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
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
