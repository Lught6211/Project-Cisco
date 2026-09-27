"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Activity, AudioLines, BrainCircuit, CircleDot, Command, MessageCircle, Mic, PhoneCall, Radio, Send, ShieldCheck, Signal, Sparkles, X } from "lucide-react";
import "./scene.css";

const MemoryScene = dynamic(() => import("./MemoryScene"), { ssr: false, loading: () => <div className="scene-loading">INITIALIZING 3D MEMORY...</div> });

type Node = { id: string; label: string; kind: string; detail: string; x: number; y: number; active?: boolean };
type Edge = { source: string; target: string; label: string };
type Graph = { nodes: Node[]; edges: Edge[] };
type Event = { id: string; type: string; title: string; detail: string; timestamp: string };
type ChatMessage = { role: "user" | "cisco"; text: string };

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

const api = process.env.NEXT_PUBLIC_API_URL ?? (typeof window === "undefined" ? "http://localhost:8000" : `${window.location.protocol}//${window.location.hostname}:8000`);

export default function Dashboard() {
  const [graph, setGraph] = useState<Graph>(fallbackGraph);
  const [events, setEvents] = useState<Event[]>(fallbackEvents);
  const [listening, setListening] = useState(false);
  const [callStatus, setCallStatus] = useState("ready");
  const [message, setMessage] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [useWeb, setUseWeb] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sideOpen, setSideOpen] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [selected, setSelected] = useState("cisco");
  const [focusOpen, setFocusOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    Promise.all([fetch(`${api}/api/graph`).then((r) => r.json()), fetch(`${api}/api/events`).then((r) => r.json())])
      .then(([nextGraph, nextEvents]) => { setGraph(nextGraph); setEvents(nextEvents); })
      .catch(() => undefined);
  }, []);

  const selectedNode = graph.nodes.find((node) => node.id === selected) ?? graph.nodes[0];
  const askQuestion = async (question: string) => {
    if (!question.trim()) return;
    const optimistic: Event = { id: `local-${Date.now()}`, type: "memory", title: "Context captured", detail: question, timestamp: "just now" };
    setChatMessages((current) => [...current, { role: "user", text: question }]);
    setDrawerOpen(true);
    setChatOpen(true);
    setEvents((current) => [optimistic, ...current]);
    setMessage("");
    try {
      const response = await fetch(`${api}/api/agent/ask`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: question, use_web: useWeb }) });
      const result = await response.json();
      setChatMessages((current) => [...current, { role: "cisco", text: result.answer }]);
      setEvents((current) => [{ ...optimistic, detail: result.answer, title: `CISCO replied via ${result.provider}` }, ...current.slice(1)]);
      if (voiceEnabled && "speechSynthesis" in window) {
        setSpeaking(true);
        const utterance = new SpeechSynthesisUtterance(result.answer);
        utterance.onend = () => setSpeaking(false);
        window.speechSynthesis.speak(utterance);
      }
      const nextGraph = await fetch(`${api}/api/graph`).then((graphResponse) => graphResponse.json());
      setGraph(nextGraph);
    } catch { /* local simulation remains available */ }
  };
  const sendMessage = async () => askQuestion(message);
  const startVoiceInput = () => {
    setSideOpen(true);
    setDrawerOpen(true);
    const speechWindow = window as Window & { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) return;
    setVoiceEnabled(true);
    setListening(true);
    const recognition = new Recognition();
    recognition.onresult = (event) => { void askQuestion(event.results[0][0].transcript); };
    (recognition as SpeechRecognitionLike & { onend?: () => void }).onend = () => setListening(false);
    recognition.start();
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
      <div className="brand"><div className="brand-mark"><Command size={17} /></div><div><strong>CiscoAI</strong><span>autonomous intelligence / 01</span></div></div>
      <div className="top-status"><span className="live-dot" /> CORE ONLINE <span className="status-divider" /> <span className="mono">09:41:22 UTC</span></div>
      <button className="icon-button" title="Security status"><ShieldCheck size={18} /></button>
    </header>

    <section className="intro"><div><p className="eyebrow"><Radio size={13} /> COMMAND SURFACE</p><h1>Memory in motion.</h1><p className="lede">A live operational view of CISCO&apos;s context, calls, and next move.</p></div><div className="session"><span>SESSION</span><strong>LOCAL / SIMULATION</strong><small>Provider keys not configured</small></div></section>

    <section className="metric-row"><Metric label="AGENT STATE" value={listening ? "LISTENING" : "READY"} accent="cyan" icon={<AudioLines size={15} />} /><Metric label="MEMORY NODES" value={String(graph.nodes.length).padStart(2, "0")} accent="lime" icon={<BrainCircuit size={15} />} /><Metric label="ACTIVE THREADS" value="01" accent="amber" icon={<Activity size={15} />} /><Metric label="UPTIME" value="99.98%" accent="violet" icon={<Signal size={15} />} /></section>

    <section className="workspace-grid">
      <div className="panel graph-panel"><div className="panel-head"><div><p className="eyebrow">LIVE MEMORY GRAPH / SPATIAL CORE</p><h2>Context topology / 3D</h2></div><span className="live-label"><CircleDot size={12} /> ORBITAL</span></div><div className="graph-canvas graph-3d-canvas"><MemoryScene nodes={graph.nodes} edges={graph.edges} selected={selected} speaking={speaking} onSelect={setSelected} /></div><div className="graph-footer"><span><i className="legend-dot cyan" /> ACTIVE CONTEXT</span><span><i className="legend-dot muted" /> LONG-TERM MEMORY</span><span className="mono">DRAG TO ORBIT / SCROLL TO ZOOM</span></div></div>

      <aside className={`side-stack ${sideOpen ? "side-open" : ""}`}><div className="panel focus-panel"><div className="panel-head"><p className="eyebrow">FOCUS NODE</p><Sparkles size={16} className="soft-icon" /></div><div className="focus-node"><div className="focus-orbit"><BrainCircuit size={23} /></div><div><h3>{selectedNode.label}</h3><p>{selectedNode.detail}</p></div></div><div className="detail-list"><div><span>TYPE</span><strong>{selectedNode.kind.toUpperCase()}</strong></div><div><span>CONFIDENCE</span><strong className="accent-text">94.2%</strong></div><div><span>RELATIONSHIPS</span><strong>{graph.edges.filter((edge) => edge.source === selectedNode.id || edge.target === selectedNode.id).length}</strong></div></div></div><div className="panel call-panel"><div className="panel-head"><p className="eyebrow">VOICE CHANNEL</p><PhoneCall size={16} className="soft-icon" /></div><div className="call-state"><div className="pulse-ring"><Mic size={20} /></div><div><strong>{listening ? "Listening now" : "Channel ready"}</strong><p>{listening ? `Outbound channel ${callStatus}` : "Tap to open a local session"}</p></div></div><button className={`primary-button ${listening ? "active" : ""}`} onClick={toggleListening}><Mic size={16} /> {listening ? "END LISTENING" : "START LISTENING"}</button></div></aside>
    </section>

    <FunctionRail voiceActive={listening || speaking} onFocus={() => { setSelected("cisco"); setFocusOpen((value) => !value); }} onVoice={startVoiceInput} onActivity={() => setActivityOpen((value) => !value)} onChat={() => setChatOpen((value) => !value)} />
    <section className={`lower-grid ${drawerOpen ? "drawer-open" : ""}`}><div className="panel activity-panel"><div className="panel-head"><div><p className="eyebrow">SYSTEM TELEMETRY</p><h2>Recent activity</h2></div><button className="text-button">VIEW LOG <span>↗</span></button></div><div className="activity-list">{events.slice(0, 4).map((event) => <div className="activity-item" key={event.id}><div className={`activity-icon ${event.type}`}><Activity size={15} /></div><div><strong>{event.title}</strong><p>{event.detail}</p></div><time>{event.timestamp}</time></div>)}</div></div><div className="panel prompt-panel"><div className="panel-head"><div><p className="eyebrow">DIRECTIVE INPUT / CAPTIONS</p><h2>Ask, research, remember</h2></div><Command size={16} className="soft-icon" /></div><div className="chat-captions">{chatMessages.slice(-3).map((chatMessage, index) => <p className={chatMessage.role} key={`${chatMessage.role}-${index}`}><b>{chatMessage.role === "cisco" ? "CISCO" : "YOU"}</b>{chatMessage.text}</p>)}</div><div className="prompt-box"><textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ask CISCO to research, remember, or act..." /><button className="send-button" title="Send directive" onClick={sendMessage}><Send size={16} /></button></div><div className="prompt-hint"><button className="text-button" onClick={startVoiceInput}><Mic size={12} /> VOICE INPUT</button><button className={`text-button ${useWeb ? "selected-toggle" : ""}`} onClick={() => setUseWeb((value) => !value)}><Radio size={12} /> {useWeb ? "WEB RESEARCH ON" : "LOCAL ONLY"}</button><span>{voiceEnabled ? "SPEAKING ENABLED" : "WEB SPEECH READY"}</span></div></div></section>
    <footer><span>PROJECT CISCO / CONTROL SURFACE</span><span className="mono">BUILD 0.1.0 <i className="live-dot" /></span></footer>
    {focusOpen && <FloatingPanel title="FOCUS NODE" onClose={() => setFocusOpen(false)} initial={{ x: 860, y: 118, width: 310, height: 230 }}><div className="focus-node"><div className="focus-orbit"><BrainCircuit size={23} /></div><div><h3>{selectedNode.label}</h3><p>{selectedNode.detail}</p></div></div><div className="detail-list"><div><span>TYPE</span><strong>{selectedNode.kind.toUpperCase()}</strong></div><div><span>CONFIDENCE</span><strong className="accent-text">94.2%</strong></div><div><span>RELATIONSHIPS</span><strong>{graph.edges.filter((edge) => edge.source === selectedNode.id || edge.target === selectedNode.id).length}</strong></div></div></FloatingPanel>}
    {activityOpen && <FloatingPanel title="SYSTEM TELEMETRY" onClose={() => setActivityOpen(false)} initial={{ x: 70, y: 150, width: 390, height: 280 }}><div className="activity-list">{events.slice(0, 6).map((event) => <div className="activity-item" key={event.id}><div className={`activity-icon ${event.type}`}><Activity size={15} /></div><div><strong>{event.title}</strong><p>{event.detail}</p></div><time>{event.timestamp}</time></div>)}</div></FloatingPanel>}
    {chatOpen && <FloatingPanel title="CISCO CAPTIONS" onClose={() => setChatOpen(false)} initial={{ x: 70, y: 470, width: 440, height: 280 }}><div className="chat-history">{chatMessages.map((chatMessage, index) => <p className={chatMessage.role} key={`${chatMessage.role}-${index}`}><b>{chatMessage.role === "cisco" ? "CISCO" : "YOU"}</b>{chatMessage.text}</p>)}</div><div className="prompt-box"><textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ask CiscoAI..." /><button className="send-button" title="Send message" onClick={sendMessage}><Send size={16} /></button></div></FloatingPanel>}
    {chatMessages.some((chatMessage) => chatMessage.role === "cisco") && <div className="caption-box"><span className="eyebrow"><AudioLines size={12} /> CISCO LIVE CAPTIONS</span><div>{chatMessages.filter((chatMessage) => chatMessage.role === "cisco").slice(-3).map((chatMessage, index) => <p key={`${chatMessage.text}-${index}`}>{chatMessage.text}</p>)}</div></div>}
  </main>;
}

function Metric({ label, value, accent, icon }: { label: string; value: string; accent: string; icon: React.ReactNode }) { return <div className="metric"><div className={`metric-icon ${accent}`}>{icon}</div><div><span>{label}</span><strong>{value}</strong></div></div>; }

function FunctionRail({ onFocus, onVoice, onActivity, onChat, voiceActive }: { onFocus: () => void; onVoice: () => void; onActivity: () => void; onChat: () => void; voiceActive: boolean }) {
  return <nav className="function-rail" aria-label="CiscoAI functions"><button title="Focus CiscoAI node" onClick={onFocus}><Sparkles size={17} /></button><button className={voiceActive ? "voice-active" : ""} title="Speak to CiscoAI" onClick={onVoice}><Mic size={17} /></button><button title="Open activity" onClick={onActivity}><Activity size={17} /></button><button title="Open chat captions" onClick={onChat}><MessageCircle size={17} /></button></nav>;
}

function FloatingPanel({ title, initial, onClose, children }: { title: string; initial: { x: number; y: number; width: number; height: number }; onClose: () => void; children: React.ReactNode }) {
  const [frame, setFrame] = useState(initial);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const resize = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const move = (event: React.PointerEvent) => {
    if (drag.current) setFrame((value) => ({ ...value, x: drag.current!.left + event.clientX - drag.current!.x, y: drag.current!.top + event.clientY - drag.current!.y }));
    if (resize.current) setFrame((value) => ({ ...value, width: Math.max(260, resize.current!.width + event.clientX - resize.current!.x), height: Math.max(160, resize.current!.height + event.clientY - resize.current!.y) }));
  };
  const end = () => { drag.current = null; resize.current = null; };
  return <section className="hologram-panel" style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height }} onPointerMove={move} onPointerUp={end} onPointerCancel={end}><header onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, y: event.clientY, left: frame.x, top: frame.y }; }}><span>{title}</span><button title="Close panel" onClick={onClose}><X size={14} /></button></header><div className="hologram-content">{children}</div><span className="resize-grip" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); resize.current = { x: event.clientX, y: event.clientY, width: frame.width, height: frame.height }; }} /></section>;
}

type SpeechRecognitionLike = { start: () => void; onresult: (event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void };
