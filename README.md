# CiscoAI

CiscoAI is a local-first foundation for an autonomous, voice-enabled AI agent with persistent memory and a live operational dashboard.

## Current slice

- `backend/`: FastAPI service with health, graph, event, agent-message, and simulated outbound-call endpoints.
- `backend/app/agent.py`: provider runtime for Gemini, OpenAI-compatible APIs, or local Ollama.
- `backend/app/realtime.py`: optional realtime audio bridge for Twilio G.711 media and an OpenAI-compatible realtime provider.
- `backend/app/web.py`: free DuckDuckGo HTML search adapter for research context.
- `backend/data/memory.json`: created on first API start and used as the local memory store.
- `frontend/`: Next.js dashboard with a rendered memory topology, voice-session simulation, telemetry, and directive input.
- frontend/app/MemoryScene2D.tsx: lightweight, pannable 2D memory and operations field; Three.js is loaded only for interactive 3D hologram models.
- Topic-scoped chat history keeps explicit `user`/`assistant` turn types, including local Kaizen responses, so the production TypeScript build accepts every chat path.
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
Run `npm run build` from `frontend/` before pushing frontend changes to catch the same production compile and TypeScript checks used by Vercel.

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

Copy `backend/.env.example` to `backend/.env`. The included `OPENAI_BASE_URL` points CISCO at Ollama, so local development needs no paid API key when Ollama is running. The earlier quick-response implementation only returned canned greetings and acknowledgments; the real AI provider connection was added later. For hosted deployment, configure `GEMINI_API_KEY`; Gemini is tried first, with the configured OpenAI-compatible provider (including Ollama) used as a fallback when available. Gemini automatically retries fallback models during transient capacity or model errors.

To send an agent directive:

```powershell
Invoke-RestMethod http://localhost:8000/api/agent/message -Method Post -ContentType 'application/json' -Body '{"message":"Remember that Maya prefers window tables"}'
```

If Ollama is unavailable, CISCO displays a provider connection error in the chat instead of returning a fake AI answer.

### Research, memory, and browser speech

Use the dashboard directive box to ask a question. The app gathers free Wikipedia/DuckDuckGo context for a new topic, sends the request and recent conversation turns to the configured model, stores the topic and up to three sources in the memory graph, and returns the answer. Short follow-ups stay grounded in the conversation and selected graph node. Clicking a node selects and frames it and makes it the topic context for the next request; it does not open the inspector. New research nodes become children of the selected topic and are focused when created. Open the focus inspector from the right-side dock when needed. Replies are spoken with the browser's built-in speech synthesis; CISCO prefers an available English voice commonly identified as feminine and pins the selected voice for the page session. Voice names and availability depend on the browser and operating system, so the browser's default voice is used if no matching voice is available. The microphone control currently changes the listening indicator; speech recognition is not connected to the backend chat flow.

The dashboard is responsive and installable as a CiscoAI PWA on desktop and mobile browsers. The main memory field is a lightweight 2D point lattice with CISCO at the center and memory generations spreading outward. Single-child memory chains turn into a slow spiral instead of stacking into a line. The field uses a shifting multicolor atmosphere, animated node orbits, a compact rose-pink reactor core with rotating orbital arcs and radial tick marks, an arrival effect for new nodes, and restrained signal motion on selected relationships. Use the live category filters to isolate memories, people, places, tasks, or server operations; drag nodes to arrange them, drag empty space to pan, scroll or pinch to zoom, and select a topic to focus it for follow-up chat. Dragging updates the scene directly without re-rendering every node on each pointer movement. The **Motion On / Eco Mode** switch saves your choice on the device; Eco Mode quiets the scene and removes blur effects for slower hardware. Background API checks run every 15 seconds while the tab is visible and pause in hidden tabs. The view resets directly to a usable camera position. Function panels remain closed after reload and open from the dock. Topic labels stay with their nodes, and the graph stays readable on phone screens. The center core and connected memories remain in the field when CISCO projects a hologram; explicit requests such as “show me a hologram of a car” put an interactive 3D model beside the core, fold the memory nodes away, and keep CISCO visible. Drag the 3D model to rotate it, zoom with the pointer wheel or pinch, and pan to inspect it. Cars support animated door, hood, trunk, and engine controls. Double-click CISCO or use the model's return control to dismiss it and restore the memory field. Current procedural 3D model families include cars, engines, planets, people, animals, molecules, buildings, aircraft, and trees, with a labeled concept model for unrecognized subjects. These are locally generated interactive visualizations rather than photorealistic asset generation. The procedural hologram remains a WebGL scene loaded as a separate on-demand browser chunk; the memory graph itself no longer runs a continuous 3D renderer.

The dashboard is a full-viewport 2D node field with an optional 3D hologram canvas. Telemetry, focus, and chat panels are closed at startup; use the right-edge controls to open them. The focus inspector opens in the top-right corner. HUD panels use a short GPU-friendly hologram-on animation and a matching power-off effect; they are positioned independently, so opening one does not shift another. Click a panel to bring it forward, or press Escape to close the topmost panel. Chat shows the conversation, while live captions appear separately at the bottom-left on a transparent background. Cisco's core changes color by state: blue while idle, yellow while listening, purple while thinking, and green while speaking. Typing exactly “Hi Ultron” (capitalization does not matter) in chat activates a visual easter egg for the current page session: takeover eases in over nine seconds, gradually recoloring the core and interface while corruption spreads to nodes at different rates. The status bar reports takeover progress; occasional node and interface glitches become more likely as corruption spreads, and transient hexadecimal code fragments appear around the graph. Say “Hi Cisco” to ease restoration over several seconds; the core label, colors, and status progressively return to Cisco as the corruption clears. The inspector's confidence percentage is an evidence score derived from descriptive detail and linked source nodes; it is not a model's claim of certainty. Relationship counts represent the reachable graph branch, so CISCO reflects the whole graph and is always highest.

For large memory graphs, open the memory navigator with the labeled `FIND TOPIC` control near the orbital badge, the right-side magnifier, `Ctrl+K`, or `/`. Search by node name, type, or detail, then use the arrow keys and Enter to focus a topic; the next chat request uses that topic as context. Cisco keeps recent follow-up turns separately for each focused topic so changing branches does not carry unrelated conversation history. As a hidden local utility, type `Kaizen` in chat to run a short animated graph-health scan reporting node, link, and isolated-memory counts without calling the AI service. Navigator and scan animations respect the device's reduced-motion setting.

The production build is warning-free after declaring Autoprefixer explicitly in the frontend development dependencies.

The primary 2D canvas has no continuously animated 3D graph render loop, reducing GPU work on mid-range hardware. Three.js and React Three Fiber are used only while a hologram model is open, where render density is capped for performance.

The microphone control currently changes the listening state only; browser speech recognition is not wired into the dashboard flow. CISCO reads successful chat replies aloud through browser speech synthesis.

To install it, run the frontend, open `http://localhost:3000`, then use the browser menu: Chrome/Edge on Windows choose `Install CiscoAI`; Chrome on Android choose `Add to Home screen` or `Install app`. For local agent responses, keep the backend running. On the hosted deployment, the Render backend serves agent responses and memory updates.

### Start both services together

You do not need to start two terminals manually. From the project root, run:

```powershell
.\start-ciscoai.ps1
```

This opens separate backend and frontend terminals and keeps both services running. On your Wi-Fi network, open `http://<LAN_IP>:3000` from another device. Windows Firewall may ask permission for Python and Node; allow private networks. The frontend automatically sends API requests to the same computer’s port `8000`.

The launcher opens the backend and frontend in separate PowerShell windows. The CiscoAI interface starts with its telemetry, focus, and chat panels closed; use the right-edge controls to open them.

For Vercel and Render, set `NEXT_PUBLIC_API_URL` in Vercel to the Render backend URL. In Render, open the `cisco-backend` service's **Environment** page, add `GEMINI_API_KEY` with the key from Google AI Studio, save the change, and let Render redeploy. Keep the key in Render's environment settings; do not put it in frontend code or commit it. `GEMINI_MODEL` defaults to the free-tier `gemini-3.5-flash-lite`, with automatic fallbacks to other supported Gemini Flash models during capacity, timeout, or model errors. AI errors report which model attempts failed. If no provider is configured, CISCO displays a setup message instead of pretending to generate a model answer.

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

## Connect CISCO to your homelab

The optional private connector is maintained in the [Ubuntu homelab guide](https://github.com/Lught6211/ubuntu-homelab-docker-guide/tree/main/compose/cisco-agent). It reports Docker container state, configured website availability, server CPU/memory/uptime, and optional qBittorrent progress. It can start, stop, or restart explicitly allowlisted containers and pause or resume a specific download. CISCO asks for confirmation before any container start, stop, or restart. The host-network connector can also check for changes to its approved guide repository and, after a separate confirmation, rebuild only the CISCO server agent and its Docker guard. The server panel checks for updates on open and every ten minutes while open; it shows the commit and deployment steps. It does not deploy other homelab applications or accept arbitrary commands.

When Tailscale already runs on the server, the host-network Compose deployment reuses its private identity and can authenticate the configured Tailscale login directly; CiscoAI pre-fills this server's private address at `https://ubuntu-homelab.tail5d99d8.ts.net:8443`, so connect with the token blank. The agent and Docker guard bind only to localhost, and Tailscale Serve adds the identity header. This host uses private HTTPS port 8443 because Caddy already occupies 443. Keep Funnel disabled. CiscoAI polls while the dashboard is open, including when identity mode has no browser token. For a server without host Tailscale, use the Portainer sidecar deployment with a private Tailscale auth key and CISCO access token. Connect the browser device to Tailscale to use the private link. Setup and deployment details are in the [homelab connector guide](https://github.com/Lught6211/ubuntu-homelab-docker-guide/tree/main/compose/cisco-agent).

The connector has no public host ports, disables Funnel, and exposes no shell or arbitrary command endpoint. Its Docker guard permits listing containers and start/stop/restart only configured container names. qBittorrent and website monitoring are optional and configured through Portainer; credentials are never stored in this frontend repository. See the homelab guide's CISCO connector documentation for the full setup and limitations.

## Next milestones

1. Add local speech recognition and text-to-speech around the Ollama agent.
2. Replace the JSON store with a graph/vector persistence layer and event streaming.
3. Add authenticated WebSocket updates for graph, agent responses, and call state.
4. Add a task planner that can turn approved directives into tool calls.

## Environment

Keep provider credentials in an ignored `.env` file. Never commit API keys or phone numbers.
