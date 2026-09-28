# CiscoAI

CiscoAI is a local-first foundation for an autonomous, voice-enabled AI agent with persistent memory and a live operational dashboard.

## Current slice

- `backend/`: FastAPI service with health, graph, event, agent-message, and simulated outbound-call endpoints.
- `backend/app/agent.py`: provider runtime for Gemini, OpenAI-compatible APIs, or local Ollama.
- `backend/app/realtime.py`: optional realtime audio bridge for Twilio G.711 media and an OpenAI-compatible realtime provider.
- `backend/app/web.py`: free DuckDuckGo HTML search adapter for research context.
- `backend/data/memory.json`: created on first API start and used as the local memory store.
- `frontend/`: Next.js dashboard with a rendered memory topology, voice-session simulation, telemetry, and directive input.
- `frontend/app/MemoryScene.tsx`: orbitable Three.js memory graph with depth, lighting, touch gestures, and selectable nodes.
- Gemini is the default hosted provider when `GEMINI_API_KEY` is configured. Local Ollama remains available without a paid API key.

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

Copy `backend/.env.example` to `backend/.env`. The included `OPENAI_BASE_URL` points CISCO at Ollama, so no paid API key is needed. Start Ollama before the backend. To use hosted Gemini instead, add a Gemini API key and set `GEMINI_API_KEY`; Gemini takes priority over the Ollama settings.

To send an agent directive:

```powershell
Invoke-RestMethod http://localhost:8000/api/agent/message -Method Post -ContentType 'application/json' -Body '{"message":"Remember that Maya prefers window tables"}'
```

If Ollama is unavailable, CISCO displays a provider connection error in the chat instead of returning a fake AI answer.

### Research, memory, and browser speech

Use the dashboard directive box to ask a question. The app gathers free Wikipedia/DuckDuckGo context for the request, sends it to the configured model, stores the topic and up to three sources in the memory graph, and returns the answer. Replies are spoken with the browser's built-in speech synthesis and CISCO's core turns green while speaking. The microphone control currently changes the listening indicator; speech recognition is not connected to the backend chat flow.

The dashboard is responsive and installable as a CiscoAI PWA on desktop and mobile browsers. The memory graph is a Three.js scene with JARVIS-style spatial nodes connected by 3D relationship vectors. Its spatial reference grid is formed from three intersecting vector planes, expands to fit the graph, and has no star field. Drag to orbit around nodes, pinch or scroll to zoom, and tap a node to focus it. A native packaged mobile app can be added later with the same API, but the current PWA requires no app-store account.

The desktop dashboard is a full-viewport 3D graph surface. Telemetry, focus, and chat panels are closed at startup; use the circular controls on the right edge to open them. Each panel can be dragged, resized, and closed. Chat shows the conversation, while live captions appear separately at the bottom-left on a transparent background. Cisco's core changes color by state: blue while idle, yellow while listening, purple while thinking, and green while speaking. Node names billboard toward the camera at every angle, while relationship depth changes node geometry, edge color, line weight, and dash pattern.

The production build is warning-free after declaring Autoprefixer explicitly in the frontend development dependencies.

The graph renderer uses adaptive pixel density, high-performance WebGL, and reduced antialiasing to keep the animated scene responsive on mobile and lower-end machines. The focus button opens the current-view inspector without changing the selected node.

The microphone control currently changes the listening state only; browser speech recognition is not wired into the dashboard flow. CISCO reads successful chat replies aloud through browser speech synthesis.

To install it, run the frontend, open `http://localhost:3000`, then use the browser menu: Chrome/Edge on Windows choose `Install CiscoAI`; Chrome on Android choose `Add to Home screen` or `Install app`. For local agent responses, keep the backend running. On the hosted deployment, the Render backend serves agent responses and memory updates.

### Start both services together

You do not need to start two terminals manually. From the project root, run:

```powershell
.\start-ciscoai.ps1
```

This opens separate backend and frontend terminals and keeps both services running. On your Wi-Fi network, open `http://192.168.0.7:3000` from another device. Windows Firewall may ask permission for Python and Node; allow private networks. The frontend automatically sends API requests to the same computer’s port `8000`.

The launcher opens the backend and frontend in separate PowerShell windows. The CiscoAI interface starts with its telemetry, focus, and chat panels closed; use the right-edge controls to open them.

For Vercel and Render, set `NEXT_PUBLIC_API_URL` in Vercel to the Render backend URL. In Render, open the `cisco-backend` service's **Environment** page, add `GEMINI_API_KEY` with the key from Google AI Studio, save the change, and let Render redeploy. Keep the key in Render's environment settings; do not put it in frontend code or commit it. `GEMINI_MODEL` defaults to `gemini-2.5-flash`. AI errors now include the provider's HTTP status and a targeted hint for invalid credentials, missing models, and quota limits. If no provider is configured, CISCO displays a setup message instead of pretending to generate a model answer.

The development CORS policy allows local-network browser access without credentials. Do not expose this development server directly to the public internet; production deployment should use HTTPS, authentication, and a restricted origin list.

`localhost` is only the development address for the local server. After choosing `Install CiscoAI` in a supported browser, it opens as an application window. The hosted Vercel deployment calls the Render backend URL configured in `NEXT_PUBLIC_API_URL`.

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
