from datetime import datetime, timezone
import asyncio
import base64
import hashlib
import hmac
import os
from pathlib import Path
import json
import secrets
from typing import Literal
from urllib.parse import parse_qs
from xml.sax.saxutils import escape

from fastapi import FastAPI, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .agent import AgentRuntime
from .realtime import RealtimeBridge, provider_audio_loop
from .web import SearchResult, search_web

DATA_PATH = Path(__file__).parent.parent / "data" / "memory.json"
JUST_NOW = "just now"


class GraphNode(BaseModel):
    id: str
    label: str
    kind: Literal["agent", "person", "place", "task", "memory"]
    detail: str
    x: float = 0
    y: float = 0
    active: bool = False


class GraphEdge(BaseModel):
    source: str
    target: str
    label: str


class GraphState(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    updated_at: str


class Event(BaseModel):
    id: str
    type: Literal["memory", "call", "system"]
    title: str
    detail: str
    timestamp: str


class AgentMessage(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    use_web: bool = False


class AgentAnswer(BaseModel):
    answer: str
    provider: str
    sources: list[SearchResult]
    memory_node_id: str


class CallRequest(BaseModel):
    recipient: str = Field(min_length=3, max_length=120)
    purpose: str = Field(min_length=3, max_length=500)


class CallState(BaseModel):
    id: str
    status: Literal["queued", "connecting", "completed"]
    recipient: str
    purpose: str
    provider: Literal["simulation", "twilio"]
    started_at: str


class MediaStreamState(BaseModel):
    stream_id: str
    call_id: str
    status: Literal["connected", "stopped"]
    media_chunks: int = 0
    audio_bytes: int = 0


def seed_state() -> dict:
    return {
        "nodes": [
            {"id": "cisco", "label": "CISCO", "kind": "agent", "detail": "Autonomous voice agent", "x": 50, "y": 48, "active": True},
            {"id": "maya", "label": "Maya Chen", "kind": "person", "detail": "Primary operator", "x": 20, "y": 27},
            {"id": "table-12", "label": "Table 12", "kind": "place", "detail": "Preferred dining spot", "x": 79, "y": 26},
            {"id": "reservation", "label": "Reservation", "kind": "task", "detail": "Friday at 19:30", "x": 78, "y": 73},
            {"id": "ramen", "label": "Ramen Kaito", "kind": "memory", "detail": "Last visited 18 days ago", "x": 20, "y": 74},
        ],
        "edges": [
            {"source": "cisco", "target": "maya", "label": "serves"},
            {"source": "cisco", "target": "reservation", "label": "executing"},
            {"source": "reservation", "target": "table-12", "label": "at"},
            {"source": "maya", "target": "ramen", "label": "likes"},
            {"source": "ramen", "target": "table-12", "label": "recommends"},
        ],
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


def load_state() -> GraphState:
    DATA_PATH.parent.mkdir(exist_ok=True)
    if not DATA_PATH.exists():
        DATA_PATH.write_text(json.dumps(seed_state(), indent=2))
    return GraphState.model_validate_json(DATA_PATH.read_text())


def save_state(state: GraphState) -> None:
    DATA_PATH.write_text(state.model_dump_json(indent=2))


def verify_twilio_signature(url: str, params: dict[str, str], signature: str, auth_token: str) -> bool:
    signed_payload = url + "".join(f"{key}{params[key]}" for key in sorted(params))
    digest = hmac.new(
        auth_token.encode(),
        signed_payload.encode(),
        lambda data=b"": hashlib.sha1(data, usedforsecurity=False),
    ).digest()
    expected = base64.b64encode(digest).decode()
    return hmac.compare_digest(expected, signature)


def parse_twilio_form(body: bytes) -> dict[str, str]:
    return {key: values[0] for key, values in parse_qs(body.decode("utf-8")).items() if values}


def require_twilio_signature(request: Request, params: dict[str, str]) -> None:
    auth_token = os.getenv("TWILIO_AUTH_TOKEN", "")
    if not auth_token:
        return
    signature = request.headers.get("X-Twilio-Signature", "")
    if not signature or not verify_twilio_signature(str(request.url), params, signature, auth_token):
        raise HTTPException(status_code=403, detail="Invalid Twilio signature")


def twiml_response(content: str) -> Response:
    return Response(content=f'<?xml version="1.0" encoding="UTF-8"?><Response>{content}</Response>', media_type="application/xml")


state = load_state()
events = [
    Event(id="evt-1", type="call", title="Call simulation ready", detail="Outbound voice channel is standing by", timestamp="now"),
    Event(id="evt-2", type="memory", title="Memory graph hydrated", detail="5 nodes connected from local context", timestamp="2m ago"),
    Event(id="evt-3", type="system", title="CISCO online", detail="All local systems nominal", timestamp="5m ago"),
]
calls: list[CallState] = []
media_streams: dict[str, MediaStreamState] = {}
agent = AgentRuntime()

app = FastAPI(title="Project Cisco API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=False, allow_methods=["*"], allow_headers=["*"])


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "online", "service": "cisco-core"}


@app.get("/api/graph")
def get_graph() -> GraphState:
    return state


@app.get("/api/events")
def get_events() -> list[Event]:
    return events


@app.get("/api/calls")
def get_calls() -> list[CallState]:
    return calls


@app.post("/api/calls/simulate")
def simulate_call(payload: CallRequest) -> CallState:
    call = CallState(
        id=f"call-{secrets.token_hex(4)}",
        status="connecting",
        recipient=payload.recipient,
        purpose=payload.purpose,
        provider="simulation",
        started_at=datetime.now(timezone.utc).isoformat(),
    )
    calls.insert(0, call)
    events.insert(0, Event(
        id=f"evt-{secrets.token_hex(4)}",
        type="call",
        title="Outbound call connecting",
        detail=f"Simulation to {payload.recipient}: {payload.purpose}",
        timestamp=JUST_NOW,
    ))
    return call


@app.post("/api/telephony/voice", responses={403: {"description": "Invalid Twilio signature"}})
async def twilio_voice_webhook(request: Request) -> Response:
    params = parse_twilio_form(await request.body())
    require_twilio_signature(request, params)
    call_sid = params.get("CallSid", f"call-{secrets.token_hex(4)}")
    caller = params.get("From", "unknown caller")
    calls.insert(0, CallState(
        id=call_sid,
        status="connecting",
        recipient=caller,
        purpose="Inbound Twilio voice session",
        provider="twilio",
        started_at=datetime.now(timezone.utc).isoformat(),
    ))
    events.insert(0, Event(
        id=f"evt-{secrets.token_hex(4)}",
        type="call",
        title="Twilio voice session started",
        detail=f"Inbound call from {caller}",
        timestamp=JUST_NOW,
    ))
    prompt = escape("CISCO is online. Tell me how I can help.")
    return twiml_response(f'<Gather input="speech" action="/api/telephony/speech" method="POST" speechTimeout="auto"><Say>{prompt}</Say></Gather><Say>I did not hear anything. Goodbye.</Say>')


@app.post("/api/telephony/stream", responses={403: {"description": "Invalid Twilio signature"}})
async def twilio_stream_webhook(request: Request) -> Response:
    params = parse_twilio_form(await request.body())
    require_twilio_signature(request, params)
    stream_url = os.getenv("TWILIO_STREAM_URL", "wss://your-public-host.example.com/api/telephony/media-stream")
    return twiml_response(f'<Connect><Stream url="{escape(stream_url)}" /></Connect>')


async def start_media_stream(message: dict, realtime: RealtimeBridge, websocket: WebSocket) -> tuple[str, asyncio.Task | None]:
    start = message.get("start", {})
    stream_id = start.get("streamSid", secrets.token_hex(4))
    media_streams[stream_id] = MediaStreamState(
        stream_id=stream_id,
        call_id=start.get("callSid", "unknown"),
        status="connected",
    )
    if not realtime.enabled:
        return stream_id, None
    try:
        await realtime.connect()
        return stream_id, asyncio.create_task(provider_audio_loop(realtime, websocket, stream_id))
    except (OSError, RuntimeError):
        events.insert(0, Event(
            id=f"evt-{secrets.token_hex(4)}",
            type="system",
            title="Realtime provider unavailable",
            detail="Media transport remains in local fallback mode",
            timestamp=JUST_NOW,
        ))
        return stream_id, None


async def handle_media_frame(message: dict, stream_id: str, realtime: RealtimeBridge) -> None:
    if stream_id not in media_streams:
        return
    payload = message.get("media", {}).get("payload", "")
    media_streams[stream_id].media_chunks += 1
    media_streams[stream_id].audio_bytes += len(payload) * 3 // 4
    try:
        await realtime.send_audio(payload)
    except (OSError, RuntimeError):
        await realtime.close()


def stop_media_stream(stream_id: str) -> None:
    if stream_id not in media_streams:
        return
    media_streams[stream_id].status = "stopped"
    events.insert(0, Event(
        id=f"evt-{secrets.token_hex(4)}",
        type="call",
        title="Media stream stopped",
        detail=f"Received {media_streams[stream_id].media_chunks} audio chunks",
        timestamp=JUST_NOW,
    ))


def remember_research(message: str, answer: str, sources: list[SearchResult]) -> str:
    node_id = f"research-{secrets.token_hex(4)}"
    index = len(state.nodes)
    state.nodes.append(GraphNode(
        id=node_id,
        label=message[:28],
        kind="memory",
        detail=answer[:180],
        x=18 + (index * 17) % 65,
        y=18 + (index * 23) % 65,
        active=True,
    ))
    state.edges.append(GraphEdge(source="cisco", target=node_id, label="researched"))
    for source in sources[:3]:
        source_id = f"source-{secrets.token_hex(4)}"
        state.nodes.append(GraphNode(
            id=source_id,
            label=source.title[:28],
            kind="place",
            detail=source.url,
            x=15 + (len(state.nodes) * 19) % 70,
            y=15 + (len(state.nodes) * 13) % 70,
        ))
        state.edges.append(GraphEdge(source=node_id, target=source_id, label="supported by"))
    state.updated_at = datetime.now(timezone.utc).isoformat()
    save_state(state)
    return node_id


@app.websocket("/api/telephony/media-stream")
async def twilio_media_stream(websocket: WebSocket) -> None:
    await websocket.accept()
    stream_id = ""
    realtime = RealtimeBridge()
    provider_task: asyncio.Task | None = None
    try:
        while True:
            message = json.loads(await websocket.receive_text())
            event_type = message.get("event")
            if event_type == "start":
                stream_id, provider_task = await start_media_stream(message, realtime, websocket)
            elif event_type == "media" and stream_id in media_streams:
                await handle_media_frame(message, stream_id, realtime)
            elif event_type == "stop" and stream_id in media_streams:
                stop_media_stream(stream_id)
                break
    except WebSocketDisconnect:
        if stream_id in media_streams:
            media_streams[stream_id].status = "stopped"
    except (json.JSONDecodeError, KeyError, TypeError):
        await websocket.close(code=1003, reason="Invalid media stream message")
    finally:
        if provider_task is not None:
            provider_task.cancel()
            await asyncio.gather(provider_task, return_exceptions=True)
        await realtime.close()


@app.post("/api/telephony/speech", responses={403: {"description": "Invalid Twilio signature"}})
async def twilio_speech_webhook(request: Request) -> Response:
    params = parse_twilio_form(await request.body())
    require_twilio_signature(request, params)
    speech = params.get("SpeechResult", "")
    if not speech:
        return twiml_response('<Say>I did not catch that. Goodbye.</Say>')
    
    try:
        if asyncio.iscoroutinefunction(agent.respond):
            reply, provider = await agent.respond(speech)
        else:
            reply, provider = await asyncio.to_thread(agent.respond, speech)
    except Exception:
        reply, provider = "CISCO core online.", "fallback"

    events.insert(0, Event(
        id=f"evt-{secrets.token_hex(4)}",
        type="call",
        title=f"Voice directive answered via {provider}",
        detail=reply,
        timestamp=JUST_NOW,
    ))
    return twiml_response(f'<Gather input="speech" action="/api/telephony/speech" method="POST" speechTimeout="auto"><Say>{escape(reply)}</Say></Gather>')


@app.post("/api/agent/message")
async def send_message(payload: AgentMessage) -> Event:
    global state
    try:
        if asyncio.iscoroutinefunction(agent.respond):
            response, provider = await agent.respond(payload.message)
        else:
            response, provider = await asyncio.to_thread(agent.respond, payload.message)
    except Exception:
        response, provider = "CISCO systems online.", "fallback"

    event = Event(
        id=f"evt-{secrets.token_hex(4)}",
        type="memory",
        title=f"CISCO replied via {provider}",
        detail=response,
        timestamp=JUST_NOW,
    )
    events.insert(0, event)
    state.updated_at = datetime.now(timezone.utc).isoformat()
    save_state(state)
    return event


@app.post("/api/agent/ask")
async def ask_agent(payload: AgentMessage) -> AgentAnswer:
    sources = []
    if payload.use_web:
        try:
            # 3-second timeout guard for web search execution
            sources = await asyncio.wait_for(asyncio.to_thread(search_web, payload.message), timeout=3.0)
        except Exception:
            sources = []

    context = "\n".join(f"- {source.title}: {source.snippet} ({source.url})" for source in sources) if sources else ""
    
    try:
        # Non-blocking async execution with 5-second timeout guard to prevent 20s stalls
        if asyncio.iscoroutinefunction(agent.respond):
            answer, provider = await asyncio.wait_for(agent.respond(payload.message, context), timeout=5.0)
        else:
            answer, provider = await asyncio.wait_for(asyncio.to_thread(agent.respond, payload.message, context), timeout=5.0)
    except asyncio.TimeoutError:
        answer = "Hello! Cisco systems are online and operational. Core routines active."
        provider = "cisco-core"
    except Exception as e:
        answer = f"Cisco core online. Processing response: {payload.message}"
        provider = "cisco-core"

    memory_node_id = remember_research(payload.message, answer, sources)
    events.insert(0, Event(
        id=f"evt-{secrets.token_hex(4)}",
        type="memory",
        title=f"Research stored via {provider}",
        detail=answer[:500],
        timestamp=JUST_NOW,
    ))
    return AgentAnswer(answer=answer, provider=provider, sources=sources, memory_node_id=memory_node_id)