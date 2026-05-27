const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const { router: authRoutes, exchangeToken } = require('./routes/auth');
const chatRoutes = require('./routes/chat');

const app = express();
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);

app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(morgan('dev'));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProd,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,
    sameSite: 'lax'
  }
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

// Restore tokens from cookie if session is empty
app.use((req, res, next) => {
  if (!req.session.tokens && req.cookies.hubspot_tokens) {
    try {
      req.session.tokens = JSON.parse(req.cookies.hubspot_tokens);
    } catch (e) {
      console.error('Failed to restore tokens from cookie:', e.message);
    }
  }
  next();
});

// OAuth callback — handles both /auth/hubspot/callback and /
async function handleOAuthCallback(req, res) {
  const { code } = req.query;
  const codeVerifier = req.session.codeVerifier;

  if (code && codeVerifier) {
    console.log('Detected OAuth callback code...');
    const success = await exchangeToken(code, codeVerifier, req.session, res);
    if (success) {
      delete req.session.codeVerifier;
      // Serve a closer page so the popup can notify its opener and self-close.
      // Falls back to a full redirect if opened outside a popup context.
      return res.send(`<!DOCTYPE html>
<html><head><title>Connected</title></head>
<body>
<script>
  if (window.opener && !window.opener.closed) {
    window.opener.postMessage('hubspot-auth-success', '*');
    window.close();
  } else {
    window.location.href = '/';
  }
</script>
</body></html>`);
    }
  }

  res.sendFile(path.join(frontendDist, 'index.html'));
}

app.get('/auth/hubspot/callback', handleOAuthCallback);
app.get('/', handleOAuthCallback);

// Catch-all for other SPA routes
app.get(/^(?!\/(api|auth|health)).*$/, (req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
