const axios = require('axios');

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'validect-email-verification-v1.p.rapidapi.com';

async function validateEmail(email) {
    const response = await axios.get('https://validect-email-verification-v1.p.rapidapi.com/v1/verify', {
        params: { email },
        headers: {
            'Content-Type': 'application/json',
            'x-rapidapi-host': RAPIDAPI_HOST,
            'x-rapidapi-key': RAPIDAPI_KEY
        }
    });
    return response.data;
}

module.exports = { validateEmail };
