const axios = require('axios');

const RAPIDAPI_KEY = 'bf8d2a31b2msh6f8499be824c0b8p16ccdajsn96923e55cd4c';
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
