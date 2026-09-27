# Project Cisco

Project Cisco is a local-first foundation for an autonomous, voice-enabled AI agent with persistent memory and a live operational dashboard.

## Current slice

- `backend/`: FastAPI service with health, graph, event, agent-message, and simulated outbound-call endpoints.
- `backend/data/memory.json`: created on first API start and used as the local memory store.
- `frontend/`: Next.js dashboard with a rendered memory topology, voice-session simulation, telemetry, and directive input.
- Provider integrations are intentionally isolated for the next milestone. No API keys are required for the local simulation.

## Run locally

### Backend

Use Python 3.10 or newer:

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend

In another terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`. The dashboard will use seeded local data if the backend is not running.

### Simulate an outbound call

With the backend running, the dashboard voice control creates a local call record. The API can also be called directly:

```powershell
Invoke-RestMethod http://localhost:8000/api/calls/simulate -Method Post -ContentType 'application/json' -Body '{"recipient":"Ramen Kaito","purpose":"Confirm Friday reservation"}'
```

## Next milestones

1. Add an LLM adapter behind the agent message endpoint.
2. Replace the simulation provider with Twilio webhook and media-stream adapters with signed request validation.
3. Replace the JSON store with a graph/vector persistence layer and event streaming.
4. Add authenticated WebSocket updates for graph and call state.

## Environment

Keep provider credentials in an ignored `.env` file. Never commit API keys or phone numbers.
