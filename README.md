# Project Cisco

Project Cisco is a local-first foundation for an autonomous, voice-enabled AI agent with persistent memory and a live operational dashboard.

## Current slice

- `backend/`: FastAPI service with health, graph, event, agent-message, and simulated outbound-call endpoints.
- `backend/app/agent.py`: provider-neutral agent runtime with a deterministic local fallback and optional OpenAI-compatible chat completion support.
- `backend/app/realtime.py`: optional realtime audio bridge for Twilio G.711 media and an OpenAI-compatible realtime provider.
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

### Use the free local Ollama agent

Install Ollama from https://ollama.com, then download the recommended local model:

```powershell
ollama pull llama3.2
```

Copy `backend/.env.example` to `backend/.env`. The included values point CISCO at Ollama, so no paid API key is needed. Start Ollama before the backend.

To send an agent directive:

```powershell
Invoke-RestMethod http://localhost:8000/api/agent/message -Method Post -ContentType 'application/json' -Body '{"message":"Remember that Maya prefers window tables"}'
```

If Ollama is unavailable, CISCO automatically uses the deterministic local simulation response.

### Connect Twilio webhooks

Set `TWILIO_AUTH_TOKEN` in the backend environment, then configure the Twilio phone number Voice webhook to point to:

```text
https://your-public-host.example.com/api/telephony/voice
```

The voice route starts a speech gather, and `/api/telephony/speech` sends the recognized text through CISCO and returns escaped TwiML. When `TWILIO_AUTH_TOKEN` is set, requests without a valid `X-Twilio-Signature` are rejected with `403`. For local development without credentials, the route accepts unsigned requests so the XML contract can be tested safely.

For realtime audio, set `TWILIO_STREAM_URL` to your public WebSocket URL and configure Twilio to use `/api/telephony/stream`. The WebSocket endpoint `/api/telephony/media-stream` tracks `start`, `media`, and `stop` events and counts received audio frames. When `OPENAI_API_KEY` is set, it also bridges Twilio G.711 audio to the OpenAI-compatible realtime provider and sends generated G.711 audio back to Twilio. Without a key, or if the provider disconnects, it remains a local transport simulation and records the fallback in telemetry.

## Next milestones

1. Add local speech recognition and text-to-speech around the Ollama agent.
2. Replace the JSON store with a graph/vector persistence layer and event streaming.
3. Add authenticated WebSocket updates for graph, agent responses, and call state.
4. Add a task planner that can turn approved directives into tool calls.

## Environment

Keep provider credentials in an ignored `.env` file. Never commit API keys or phone numbers.
