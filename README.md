# HubSpot MCP Staff Assistant

A full-stack web application that provides a chat interface for staff to interact with HubSpot CRM using natural language, powered by OpenRouter (LLM) and HubSpot MCP.

## Features
- **Chat UI**: Interactive chat with LLM.
- **Voice Mode**: Speak to the assistant using browser speech recognition.
- **HubSpot Integration**: Propose and execute HubSpot actions (Contacts, Deals, etc.) via HubSpot MCP.
- **Human-in-the-loop**: Actions are only executed after explicit user approval.
- **Secure Auth**: Uses HubSpot OAuth 2.1 with PKCE.

## Deployment on Render

1. Create a new **Web Service** on Render.
2. Connect your GitHub repository.
3. Use the following settings:
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. Provide the following environment variables:
   - `HUBSPOT_CLIENT_ID`
   - `HUBSPOT_CLIENT_SECRET`
   - `OPENROUTER_API_KEY`
   - `SESSION_SECRET` (random string)
   - `REDIRECT_URI`: Set this to `https://<your-render-url>/auth/hubspot/callback` after the service is created.
5. Update your HubSpot App's Redirect URL in the HubSpot Developer Portal to match your `REDIRECT_URI`.

## Local Development

1. `npm install` (installs root, backend, and frontend dependencies)
2. Create a `backend/.env` file based on `backend/.env.example`
3. `npm start` (runs the backend, which serves the built frontend)

For frontend development with HMR:
1. `cd frontend && npm run dev`
