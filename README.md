# CiscoAI

CiscoAI is a local-first foundation for an autonomous, voice-enabled AI agent with persistent memory and a live operational dashboard.

## Current slice

- `backend/`: FastAPI service with health, graph, event, agent-message, and simulated outbound-call endpoints.
- `backend/app/agent.py`: provider-neutral agent runtime with a deterministic local fallback and optional OpenAI-compatible chat completion support.
- `backend/app/realtime.py`: optional realtime audio bridge for Twilio G.711 media and an OpenAI-compatible realtime provider.
- `backend/app/web.py`: free DuckDuckGo HTML search adapter for research context.
- `backend/data/memory.json`: created on first API start and used as the local memory store.
- `frontend/`: Next.js dashboard with a rendered memory topology, voice-session simulation, telemetry, and directive input.
- `frontend/app/MemoryScene.tsx`: orbitable Three.js memory graph with depth, lighting, touch gestures, and selectable nodes.
- Provider integrations are intentionally isolated for the next milestone. No API keys are required for the local simulation.

## Run locally

### Backend

Use Python 3.10 or newer:

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --reload --port 8000
```

### Frontend

In another terminal:

```powershell
cd frontend
npm ci
npm run dev
```

If PowerShell says `npm` is not recognized after installing Node.js, close the old VS Code terminal with the trash icon and open a new terminal. The workspace adds `C:\Program Files\nodejs` to new Windows terminal sessions automatically.

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

Copy `backend/.env.example` to `backend/.env`. The included values point CISCO at Ollama, so no paid API key is needed. The workspace is configured to load this file into Python terminals automatically. Start Ollama before the backend.

To send an agent directive:

```powershell
Invoke-RestMethod http://localhost:8000/api/agent/message -Method Post -ContentType 'application/json' -Body '{"message":"Remember that Maya prefers window tables"}'
```

If Ollama is unavailable, CISCO automatically uses the deterministic local simulation response.

### Research, memory, and browser speech

Use the dashboard directive box to ask a question. CISCO runs local-only by default; toggle `WEB RESEARCH ON` when you want free Wikipedia/DuckDuckGo context. It sends selected research to Ollama, stores the topic and up to three sources in the memory graph, and returns the answer. The `VOICE INPUT` control uses the browser Web Speech API, and answers can be spoken through the browser when voice mode is enabled. Browser speech support varies by browser and may require microphone permission.

The dashboard is responsive and installable as a CiscoAI PWA on desktop and mobile browsers. The memory graph is a Three.js scene with JARVIS-style spatial dots: drag to orbit around nodes, pinch or scroll to zoom, and tap a node to focus it. A native packaged mobile app can be added later with the same API, but the current PWA requires no paid hosting or app-store account.

The desktop dashboard is a full-viewport 3D graph surface. Circular controls on the right edge open focus, activity, and chat holograms only when needed; each hologram can be dragged, resized, and closed. Voice stays button-only: the mic glows amber while listening, CiscoAI changes to amber, and its core returns to a cyan speaking waveform while answering. CiscoAI captions appear in a scrollable transparent box at bottom-left. Node names billboard toward the camera at every angle, while relationship depth changes node geometry, edge color, line weight, and dash pattern. Mobile keeps responsive scrolling where the smaller screen requires it.

The production build is warning-free after declaring Autoprefixer explicitly in the frontend development dependencies.

The graph renderer uses adaptive pixel density, high-performance WebGL, and reduced antialiasing to keep the animated scene responsive on mobile and lower-end machines. The focus button opens the current-view inspector without changing the selected node.

Voice status is visible beside the function rail: `IDLE` is cyan, `LISTENING` is amber, `THINKING` is violet, and `SPEAKING` is lime. To test it, open CiscoAI in Chrome or Edge, allow microphone access, click the circular microphone button, wait for the amber `LISTENING` state, and speak. Your transcript should open CiscoAI Chat; the node then changes to violet while Ollama is thinking and lime while the browser reads the response aloud. Unsupported browsers and microphone permission failures are shown beside the rail.

To install it, run the frontend, open `http://localhost:3000`, then use the browser menu: Chrome/Edge on Windows choose `Install CiscoAI`; Chrome on Android choose `Add to Home screen` or `Install app`. The backend must remain running locally for agent responses and memory updates.

### Start both services together

You do not need to start two terminals manually. From the project root, run:

```powershell
.\start-ciscoai.ps1
```

This opens separate backend and frontend terminals and keeps both services running. On your Wi-Fi network, open `http://192.168.0.7:3000` from another device. Windows Firewall may ask permission for Python and Node; allow private networks. The frontend automatically sends API requests to the same computer’s port `8000`.

The launcher opens the backend and frontend in separate PowerShell windows. The CiscoAI interface keeps only circular focus, microphone, and activity controls visible at the right edge; microphone input opens the caption drawer and submits the transcript automatically.

The development CORS policy allows local-network browser access without credentials. Do not expose this development server directly to the public internet; production deployment should use HTTPS, authentication, and a restricted origin list.

`localhost` is only the development address for the local server. After choosing `Install CiscoAI` in a supported browser, it opens as an application window. A public hosted deployment would use a domain instead of `localhost`; the free local-first setup intentionally keeps the backend on the same device.

### PC and Android packaging

The current free distribution is a PWA: use the browser menu and choose `Install CISCO` on Windows, Android, or ChromeOS. A Windows `.exe` installer can wrap the dashboard, but Windows `.exe` files cannot run on Android; Android requires the PWA install flow or a separate Capacitor/Android package. Ollama and the local model remain separate device prerequisites because the model is large and should not be silently bundled into an installer.

Three.js is loaded only in the browser, so the server-rendered dashboard remains stable while the 3D scene initializes on the client.

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
