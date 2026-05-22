const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const { router: authRoutes, exchangeToken } = require('./routes/auth');
const chatRoutes = require('./routes/chat');

const app = express();
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === 'production';

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: { secure: isProd }
}));

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many requests, please slow down.' }
});

app.use('/auth', authRoutes);
app.use('/api/chat', chatLimiter);
app.use('/api', chatRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Serve static frontend files in production
const frontendDist = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendDist));

// Root route handles both SPA and OAuth callback
app.get('/', async (req, res, next) => {
  const { code } = req.query;
  const codeVerifier = req.session.codeVerifier;

  if (code && codeVerifier) {
    console.log('Detected OAuth callback code at root...');
    const success = await exchangeToken(code, codeVerifier, req.session);
    if (success) {
      // Clean up session and redirect to clear query params
      delete req.session.codeVerifier;
      return res.redirect('/');
    }
  }

  res.sendFile(path.join(frontendDist, 'index.html'));
});

// Catch-all for other SPA routes
app.get(/^(?!\/(api|auth|health)).*$/, (req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
