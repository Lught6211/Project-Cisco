from datetime import datetime, timezone
from pathlib import Path
import json
import secrets
from typing import Literal

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .agent import AgentRuntime

DATA_PATH = Path(__file__).parent.parent / "data" / "memory.json"


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


state = load_state()
events = [
    Event(id="evt-1", type="call", title="Call simulation ready", detail="Outbound voice channel is standing by", timestamp="now"),
    Event(id="evt-2", type="memory", title="Memory graph hydrated", detail="5 nodes connected from local context", timestamp="2m ago"),
    Event(id="evt-3", type="system", title="CISCO online", detail="All local systems nominal", timestamp="5m ago"),
]
calls: list[CallState] = []
agent = AgentRuntime()

app = FastAPI(title="Project Cisco API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


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
        timestamp="just now",
    ))
    return call


@app.post("/api/agent/message")
def send_message(payload: AgentMessage) -> Event:
    global state
    response, provider = agent.respond(payload.message)
    event = Event(
        id=f"evt-{secrets.token_hex(4)}",
        type="memory",
        title=f"CISCO replied via {provider}",
        detail=response,
        timestamp="just now",
    )
    events.insert(0, event)
    state.updated_at = datetime.now(timezone.utc).isoformat()
    save_state(state)
    return event
