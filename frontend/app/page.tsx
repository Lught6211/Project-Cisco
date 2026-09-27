"use client";

import { useEffect, useState } from "react";
import { Activity, AudioLines, BrainCircuit, CircleDot, Command, Mic, PhoneCall, Radio, Send, ShieldCheck, Signal, Sparkles } from "lucide-react";

type Node = { id: string; label: string; kind: string; detail: string; x: number; y: number; active?: boolean };
type Edge = { source: string; target: string; label: string };
type Graph = { nodes: Node[]; edges: Edge[] };
type Event = { id: string; type: string; title: string; detail: string; timestamp: string };

const fallbackGraph: Graph = {
  nodes: [
    { id: "cisco", label: "CISCO", kind: "agent", detail: "Autonomous voice agent", x: 50, y: 48, active: true },
    { id: "maya", label: "Maya Chen", kind: "person", detail: "Primary operator", x: 20, y: 27 },
    { id: "table-12", label: "Table 12", kind: "place", detail: "Preferred dining spot", x: 79, y: 26 },
    { id: "reservation", label: "Reservation", kind: "task", detail: "Friday at 19:30", x: 78, y: 73 },
    { id: "ramen", label: "Ramen Kaito", kind: "memory", detail: "Last visited 18 days ago", x: 20, y: 74 },
  ],
  edges: [{ source: "cisco", target: "maya", label: "serves" }, { source: "cisco", target: "reservation", label: "executing" }, { source: "reservation", target: "table-12", label: "at" }, { source: "maya", target: "ramen", label: "likes" }, { source: "ramen", target: "table-12", label: "recommends" }],
};

const fallbackEvents: Event[] = [
  { id: "evt-1", type: "call", title: "Call simulation ready", detail: "Outbound voice channel is standing by", timestamp: "now" },
  { id: "evt-2", type: "memory", title: "Memory graph hydrated", detail: "5 nodes connected from local context", timestamp: "2m ago" },
  { id: "evt-3", type: "system", title: "CISCO online", detail: "All local systems nominal", timestamp: "5m ago" },
];

const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function Dashboard() {
  const [graph, setGraph] = useState<Graph>(fallbackGraph);
  const [events, setEvents] = useState<Event[]>(fallbackEvents);
  const [listening, setListening] = useState(false);
  const [callStatus, setCallStatus] = useState("ready");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState("cisco");

  useEffect(() => {
    Promise.all([fetch(`${api}/api/graph`).then((r) => r.json()), fetch(`${api}/api/events`).then((r) => r.json())])
      .then(([nextGraph, nextEvents]) => { setGraph(nextGraph); setEvents(nextEvents); })
      .catch(() => undefined);
  }, []);

  const selectedNode = graph.nodes.find((node) => node.id === selected) ?? graph.nodes[0];
  const sendMessage = async () => {
    if (!message.trim()) return;
    const optimistic: Event = { id: `local-${Date.now()}`, type: "memory", title: "Context captured", detail: message, timestamp: "just now" };
    setEvents((current) => [optimistic, ...current]);
    setMessage("");
    try { await fetch(`${api}/api/agent/message`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: optimistic.detail }) }); } catch { /* local simulation remains available */ }
  };
  const toggleListening = async () => {
    if (listening) {
      setListening(false);
      setCallStatus("ready");
      return;
    }
    setListening(true);
    setCallStatus("connecting");
    try {
      await fetch(`${api}/api/calls/simulate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipient: "Ramen Kaito", purpose: "Confirm Friday reservation" }) });
    } catch {
      setCallStatus("local simulation");
    }
  };

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><Command size={17} /></div><div><strong>CISCO</strong><span>autonomous intelligence / 01</span></div></div>
      <div className="top-status"><span className="live-dot" /> CORE ONLINE <span className="status-divider" /> <span className="mono">09:41:22 UTC</span></div>
      <button className="icon-button" title="Security status"><ShieldCheck size={18} /></button>
    </header>

    <section className="intro"><div><p className="eyebrow"><Radio size={13} /> COMMAND SURFACE</p><h1>Memory in motion.</h1><p className="lede">A live operational view of CISCO&apos;s context, calls, and next move.</p></div><div className="session"><span>SESSION</span><strong>LOCAL / SIMULATION</strong><small>Provider keys not configured</small></div></section>

    <section className="metric-row"><Metric label="AGENT STATE" value={listening ? "LISTENING" : "READY"} accent="cyan" icon={<AudioLines size={15} />} /><Metric label="MEMORY NODES" value={String(graph.nodes.length).padStart(2, "0")} accent="lime" icon={<BrainCircuit size={15} />} /><Metric label="ACTIVE THREADS" value="01" accent="amber" icon={<Activity size={15} />} /><Metric label="UPTIME" value="99.98%" accent="violet" icon={<Signal size={15} />} /></section>

    <section className="workspace-grid">
      <div className="panel graph-panel"><div className="panel-head"><div><p className="eyebrow">LIVE MEMORY GRAPH</p><h2>Context topology</h2></div><span className="live-label"><CircleDot size={12} /> STREAMING</span></div><div className="graph-canvas"><div className="crosshair horizontal" /><div className="crosshair vertical" /><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Memory graph connections">{graph.edges.map((edge) => { const from = graph.nodes.find((node) => node.id === edge.source); const to = graph.nodes.find((node) => node.id === edge.target); return from && to ? <line key={`${edge.source}-${edge.target}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="graph-edge" /> : null; })}</svg>{graph.nodes.map((node) => <button key={node.id} className={`graph-node node-${node.kind} ${selected === node.id ? "selected" : ""}`} style={{ left: `${node.x}%`, top: `${node.y}%` }} onClick={() => setSelected(node.id)}><span className="node-ring"><span /></span><span className="node-copy"><strong>{node.label}</strong><small>{node.kind}</small></span></button>)}</div><div className="graph-footer"><span><i className="legend-dot cyan" /> ACTIVE CONTEXT</span><span><i className="legend-dot muted" /> LONG-TERM MEMORY</span><span className="mono">UPDATED 00:00:04 AGO</span></div></div>

      <aside className="side-stack"><div className="panel focus-panel"><div className="panel-head"><p className="eyebrow">FOCUS NODE</p><Sparkles size={16} className="soft-icon" /></div><div className="focus-node"><div className="focus-orbit"><BrainCircuit size={23} /></div><div><h3>{selectedNode.label}</h3><p>{selectedNode.detail}</p></div></div><div className="detail-list"><div><span>TYPE</span><strong>{selectedNode.kind.toUpperCase()}</strong></div><div><span>CONFIDENCE</span><strong className="accent-text">94.2%</strong></div><div><span>RELATIONSHIPS</span><strong>{graph.edges.filter((edge) => edge.source === selectedNode.id || edge.target === selectedNode.id).length}</strong></div></div></div><div className="panel call-panel"><div className="panel-head"><p className="eyebrow">VOICE CHANNEL</p><PhoneCall size={16} className="soft-icon" /></div><div className="call-state"><div className="pulse-ring"><Mic size={20} /></div><div><strong>{listening ? "Listening now" : "Channel ready"}</strong><p>{listening ? `Outbound channel ${callStatus}` : "Tap to open a local session"}</p></div></div><button className={`primary-button ${listening ? "active" : ""}`} onClick={toggleListening}><Mic size={16} /> {listening ? "END LISTENING" : "START LISTENING"}</button></div></aside>
    </section>

    <section className="lower-grid"><div className="panel activity-panel"><div className="panel-head"><div><p className="eyebrow">SYSTEM TELEMETRY</p><h2>Recent activity</h2></div><button className="text-button">VIEW LOG <span>↗</span></button></div><div className="activity-list">{events.slice(0, 4).map((event) => <div className="activity-item" key={event.id}><div className={`activity-icon ${event.type}`}><Activity size={15} /></div><div><strong>{event.title}</strong><p>{event.detail}</p></div><time>{event.timestamp}</time></div>)}</div></div><div className="panel prompt-panel"><div className="panel-head"><div><p className="eyebrow">DIRECTIVE INPUT</p><h2>Give CISCO a thought</h2></div><Command size={16} className="soft-icon" /></div><div className="prompt-box"><textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ask CISCO to remember, investigate, or act..." /><button className="send-button" title="Send directive" onClick={sendMessage}><Send size={16} /></button></div><div className="prompt-hint"><span><kbd>⌘</kbd> + <kbd>↵</kbd> to send</span><span>LOCAL MEMORY WRITE</span></div></div></section>
    <footer><span>PROJECT CISCO / CONTROL SURFACE</span><span className="mono">BUILD 0.1.0 <i className="live-dot" /></span></footer>
  </main>;
}

function Metric({ label, value, accent, icon }: { label: string; value: string; accent: string; icon: React.ReactNode }) { return <div className="metric"><div className={`metric-icon ${accent}`}>{icon}</div><div><span>{label}</span><strong>{value}</strong></div></div>; }
