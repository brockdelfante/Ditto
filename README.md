# HubSpot MCP Staff Assistant

A full-stack web application that provides a chat interface for staff to interact with HubSpot CRM using natural language, powered by OpenRouter (LLM) and HubSpot MCP.

## Features
- **Chat UI**: Interactive chat with LLM.
- **Voice Mode**: Speak to the assistant using browser speech recognition.
- **HubSpot Integration**: Propose and execute HubSpot actions (Contacts, Deals, etc.) via HubSpot MCP.
- **Human-in-the-loop**: Actions are only executed after explicit user approval.
- **Secure Auth**: Uses HubSpot OAuth 2.1 with PKCE.

## Deployment on Render

1. Create a new "Blueprint" on Render using the `render.yaml` file.
2. Provide the following environment variables:
   - `HUBSPOT_CLIENT_ID`
   - `HUBSPOT_CLIENT_SECRET`
   - `OPENROUTER_API_KEY`
   - `REDIRECT_URI`: Set this to `https://<your-backend-url>/auth/hubspot/callback` after the backend is first created.
3. Update your HubSpot App's Redirect URL in the HubSpot Developer Portal to match your `REDIRECT_URI`.

## Local Development

### Backend
1. `cd backend`
2. `npm install`
3. Create a `.env` file (see `.env.example`)
4. `node server.js`

### Frontend
1. `cd frontend`
2. `npm install`
3. `npm run dev`
