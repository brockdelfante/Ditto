const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));
app.use(session({
  secret: process.env.SESSION_SECRET || 'hubspot-mcp-secret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

app.use('/auth', authRoutes);
app.use('/api', chatRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Serve static frontend files in production
const frontendDist = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendDist));

// In Express 5, the simplest catch-all that seems to avoid path-to-regexp issues is using a regex
app.get(/^(?!\/(api|auth|health)).*$/, (req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
