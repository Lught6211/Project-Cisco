# Project Cisco

Project Cisco is a local-first foundation for an autonomous, voice-enabled AI agent with persistent memory and a live operational dashboard.

## Current slice

- `backend/`: FastAPI service with health, graph, event, agent-message, and simulated outbound-call endpoints.
- `backend/app/agent.py`: provider-neutral agent runtime with a deterministic local fallback and optional OpenAI-compatible chat completion support.
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

### Send an agent directive

Without an API key, CISCO responds using the local simulation runtime. To use an OpenAI-compatible provider, set `OPENAI_API_KEY`, and optionally `OPENAI_MODEL` or `OPENAI_BASE_URL`, before starting the backend:

```powershell
$env:OPENAI_API_KEY = "your-key"
Invoke-RestMethod http://localhost:8000/api/agent/message -Method Post -ContentType 'application/json' -Body '{"message":"Remember that Maya prefers window tables"}'
```

### Connect Twilio webhooks

Set `TWILIO_AUTH_TOKEN` in the backend environment, then configure the Twilio phone number Voice webhook to point to:

```text
https://your-public-host.example.com/api/telephony/voice
```

The voice route starts a speech gather, and `/api/telephony/speech` sends the recognized text through CISCO and returns escaped TwiML. When `TWILIO_AUTH_TOKEN` is set, requests without a valid `X-Twilio-Signature` are rejected with `403`. For local development without credentials, the route accepts unsigned requests so the XML contract can be tested safely.

## Next milestones

1. Add Twilio media-stream streaming for low-latency bidirectional audio.
2. Replace the JSON store with a graph/vector persistence layer and event streaming.
3. Add authenticated WebSocket updates for graph, agent responses, and call state.
4. Add a task planner that can turn approved directives into tool calls.

## Environment

Keep provider credentials in an ignored `.env` file. Never commit API keys or phone numbers.
