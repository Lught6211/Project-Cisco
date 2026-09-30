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

The dashboard is responsive and installable as a CiscoAI PWA on desktop and mobile browsers. On mobile it keeps the same full-screen 3D graph and HUD styling, fits the safe screen area, supports touch orbit and zoom, and opens one readable function panel at a time. HUD headers can be dragged with touch or pointer input. The memory graph is a Three.js scene with faceted holographic nodes connected by 3D relationship vectors. CISCO anchors a deterministic 3D orbital hierarchy: directly related nodes orbit the core, and descendants orbit in nearby branch regions on wider shells. Memory nodes use an atom-like design with a faceted nucleus, layered nucleons, tilted electron paths, and orbiting points. Their subtle independent drift, shell wobble, and electron speeds keep the memory field active; hovering energizes a node and clicking it frames the topic and brightens its relationships. When a new memory forms, it travels from its parent as an energy seed and emits a brief expanding discovery scan. The graph drifts slowly around CISCO while the point lattice stays fixed. Every node has a compact, camera-facing topic tag with a colored element glyph. Type `hologram` in chat to project the selected topic (or the previous exchange if CISCO is focused). CISCO moves to the side while its memory nodes fold inward; the projection's MEMORY FIELD lets you select connected topics, and INTEL displays the conversation summary and linked memories. Close the projection or press Escape to restore the full graph. Primary parent links are emphasized while cross-links remain faint. The spatial reference is a cubic point lattice with no connecting grid lines or star field; it expands to fit the graph and pulses on browser speech word-boundary events. The browser speech API does not expose audio amplitude, so this pulse follows spoken word events and fades between them rather than tracking true vocal volume. Drag to orbit around nodes, pinch or scroll to zoom, and tap a node to focus it. A native packaged mobile app can be added later with the same API, but the current PWA requires no app-store account.

The dashboard is a full-viewport 3D graph surface. Telemetry, focus, and chat panels are closed at startup; use the circular controls on the right edge to open them. The focus inspector opens in the top-right corner. HUD panels use a short GPU-friendly hologram-on animation and a matching power-off effect; they are positioned independently, so opening one does not shift another. Click a panel to bring it forward, or press Escape to close the topmost panel. Each panel can be dragged, resized, and closed. Chat shows the conversation, while live captions appear separately at the bottom-left on a transparent background. Cisco's core changes color by state: blue while idle, yellow while listening, purple while thinking, and green while speaking. Typing exactly `Hi Ultron` (capitalization does not matter) in chat activates a visual easter egg for the current page session: takeover eases in over nine seconds, gradually recoloring the core and interface while corruption spreads to nodes at different rates. The status bar reports takeover progress; occasional node, interface, and lattice glitches become more likely as corruption spreads, and transient hexadecimal code fragments appear around the graph. Say `Hi Cisco` to ease restoration over several seconds; the core label, colors, scene, and status progressively return to Cisco as the corruption clears. Node tags billboard toward the camera at every angle, while relationship depth changes node geometry, edge color, line weight, and dash pattern. The inspector's confidence percentage is a transparent evidence score derived from descriptive detail and linked source nodes; it is not a model's claim of certainty. Relationship counts represent the reachable graph branch, so CISCO reflects the whole graph and is always highest.

For large memory graphs, open the memory navigator with the labeled `FIND TOPIC` control near the orbital badge, the right-side magnifier, `Ctrl+K`, or `/`. Search by node name, type, or detail, then use the arrow keys and Enter to focus a topic; the next chat request uses that topic as context. Cisco keeps recent follow-up turns separately for each focused topic so changing branches does not carry unrelated conversation history. As a hidden local utility, type `Kaizen` in chat to run a short animated graph-health scan reporting node, link, and isolated-memory counts without calling the AI service. Navigator and scan animations respect the device's reduced-motion setting.

The production build is warning-free after declaring Autoprefixer explicitly in the frontend development dependencies.

The graph renderer starts with a capped pixel density and no multisample antialiasing, then measures frame rate and adjusts its render resolution to keep the animated scene responsive on mid-range hardware. Layout traversal avoids repeatedly scanning the full graph, and relationship counts are computed in one edge pass. The focus button opens the current-view inspector without changing the selected node.

The microphone control currently changes the listening state only; browser speech recognition is not wired into the dashboard flow. CISCO reads successful chat replies aloud through browser speech synthesis.

To install it, run the frontend, open `http://localhost:3000`, then use the browser menu: Chrome/Edge on Windows choose `Install CiscoAI`; Chrome on Android choose `Add to Home screen` or `Install app`. For local agent responses, keep the backend running. On the hosted deployment, the Render backend serves agent responses and memory updates.

### Start both services together

You do not need to start two terminals manually. From the project root, run:

```powershell
.\start-ciscoai.ps1
```

This opens separate backend and frontend terminals and keeps both services running. On your Wi-Fi network, open `http://192.168.0.7:3000` from another device. Windows Firewall may ask permission for Python and Node; allow private networks. The frontend automatically sends API requests to the same computer’s port `8000`.

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

## Next milestones

1. Add local speech recognition and text-to-speech around the Ollama agent.
2. Replace the JSON store with a graph/vector persistence layer and event streaming.
3. Add authenticated WebSocket updates for graph, agent responses, and call state.
4. Add a task planner that can turn approved directives into tool calls.

## Environment

Keep provider credentials in an ignored `.env` file. Never commit API keys or phone numbers.
