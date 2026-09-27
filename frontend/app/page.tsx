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
type AgentStatus = "idle" | "listening" | "thinking" | "speaking";

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
  { id: "evt-1", type: "call", title: "Call simulation ready", detail: "Outbound voice channel standing by", timestamp: "now" },
  { id: "evt-2", type: "memory", title: "Memory graph hydrated", detail: "5 nodes connected from local context", timestamp: "2m ago" },
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
  const [voiceState, setVoiceState] = useState<AgentStatus>("idle");
  const [voiceError, setVoiceError] = useState("");
  const [selected, setSelected] = useState("cisco");
  
  const [focusOpen, setFocusOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  
  // Smooth Volume State (0.0 to 1.0)
  const [voiceVolume, setVoiceVolume] = useState(0);

  const getStatusColor = (state: AgentStatus) => {
    switch (state) {
      case "idle": return "#3b82f6";      // Blue
      case "listening": return "#f2b66d"; // Yellow
      case "thinking": return "#b8a3ff";  // Purple
      case "speaking": return "#c6ef78";  // Green
      default: return "#3b82f6";
    }
  };

  useEffect(() => {
    Promise.all([fetch(`${api}/api/graph`).then((r) => r.json()), fetch(`${api}/api/events`).then((r) => r.json())])
      .then(([nextGraph, nextEvents]) => { setGraph(nextGraph); setEvents(nextEvents); })
      .catch(() => undefined);
  }, []);

  // Audio analyzer loop with exponential moving average (EMA) smoothing to prevent mic icon flickering
  useEffect(() => {
    if (!listening) {
      setVoiceVolume(0);
      return;
    }
    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let animationId: number;
    let smoothedVol = 0;

    navigator.mediaDevices?.getUserMedia({ audio: true })
      .then((stream) => {
        audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 128;
        source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const update = () => {
          if (!analyser) return;
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
          const rawAvg = sum / dataArray.length;

          // Apply Noise Floor Threshold & Exponential Decay Filter
          const threshold = 18;
          const targetVol = rawAvg > threshold ? Math.min(1, (rawAvg - threshold) / 50) : 0;
          
          // EMA Smoothing: 80% previous frame + 20% target frame prevents fast flicker
          smoothedVol = smoothedVol * 0.8 + targetVol * 0.2;
          setVoiceVolume(smoothedVol);

          animationId = requestAnimationFrame(update);
        };
        update();
      })
      .catch(() => setVoiceVolume(0));

    return () => {
      if (animationId) cancelAnimationFrame(animationId);
      if (audioCtx && audioCtx.state !== "closed") audioCtx.close();
    };
  }, [listening]);

  const selectedNode = graph.nodes.find((node) => node.id === selected) ?? graph.nodes[0];
  
  const askQuestion = async (question: string) => {
    if (!question.trim()) return;
    const optimistic: Event = { id: `local-${Date.now()}`, type: "memory", title: "Context captured", detail: question, timestamp: "just now" };
    setChatMessages((current) => [...current, { role: "user", text: question }]);
    setVoiceState("thinking");
    setSpeaking(false);
    setDrawerOpen(true);
    setChatOpen(true);
    setEvents((current) => [optimistic, ...current]);
    setMessage("");
    
    try {
      const response = await fetch(`${api}/api/agent/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question, use_web: useWeb })
      });

      if (!response.ok) throw new Error("Backend response error");

      const result = await response.json();
      const replyText = result.answer || "Cisco core active.";
      
      setChatMessages((current) => [...current, { role: "cisco", text: replyText }]);
      setEvents((current) => [{ ...optimistic, detail: replyText, title: `CISCO replied via ${result.provider || "core"}` }, ...current.slice(1)]);
      
      if (voiceEnabled && "speechSynthesis" in window) {
        setSpeaking(true);
        setVoiceState("speaking");
        const utterance = new SpeechSynthesisUtterance(replyText);
        utterance.onend = () => { setSpeaking(false); setVoiceState("idle"); };
        window.speechSynthesis.speak(utterance);
      } else {
        setVoiceState("idle");
      }
    } catch (err) { 
      console.error("Ask exception:", err);
      setVoiceState("idle"); 
      setChatMessages((current) => [...current, { role: "cisco", text: "Backend service unreachable. Check API server." }]);
    }
  };

  const sendMessage = async () => askQuestion(message);

  const startVoiceInput = () => {
    setSideOpen(true);
    setDrawerOpen(true);
    const speechWindow = window as Window & { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) { setVoiceError("Speech recognition not supported."); setVoiceState("idle"); return; }
    setVoiceError("");
    setVoiceEnabled(true);
    setListening(true);
    setVoiceState("listening");
    const recognition = new Recognition();
    recognition.onstart = () => setVoiceState("listening");
    recognition.onresult = (event) => { void askQuestion(event.results[0][0].transcript); };
    (recognition as SpeechRecognitionLike & { onend?: () => void }).onend = () => { setListening(false); setVoiceState("idle"); };
    recognition.start();
  };

  const toggleListening = async () => {
    if (listening) {
      setListening(false);
      setCallStatus("ready");
      setVoiceState("idle");
      return;
    }
    setListening(true);
    setCallStatus("connecting");
    setVoiceState("listening");
  };

  return (
    <main className="app-shell relative">
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><Command size={17} /></div><div><strong>CiscoAI</strong><span>autonomous intelligence / 01</span></div></div>
        <div className="top-status"><span className="live-dot" style={{ backgroundColor: getStatusColor(voiceState), boxShadow: `0 0 12px ${getStatusColor(voiceState)}` }} /> CORE ONLINE <span className="status-divider" /> <span className="mono">09:41:22 UTC</span></div>
        <button className="icon-button" title="Security status"><ShieldCheck size={18} /></button>
      </header>

      <section className="intro"><div><p className="eyebrow"><Radio size={13} /> COMMAND SURFACE</p><h1>Memory in motion.</h1><p className="lede">A live operational view of CISCO&apos;s context, calls, and next move.</p></div><div className="session"><span>SESSION</span><strong>LOCAL / SIMULATION</strong><small>Provider keys active</small></div></section>

      <section className="metric-row"><Metric label="AGENT STATE" value={voiceState.toUpperCase()} accent="cyan" icon={<AudioLines size={15} />} /><Metric label="MEMORY NODES" value={String(graph.nodes.length).padStart(2, "0")} accent="lime" icon={<BrainCircuit size={15} />} /><Metric label="ACTIVE THREADS" value="01" accent="amber" icon={<Activity size={15} />} /><Metric label="UPTIME" value="99.98%" accent="violet" icon={<Signal size={15} />} /></section>

      <section className="workspace-grid">
        <div className="panel graph-panel">
          <div className="panel-head"><div><p className="eyebrow">LIVE MEMORY GRAPH / SPATIAL CORE</p><h2>Context topology / 3D</h2></div><span className="live-label"><CircleDot size={12} /> ORBITAL</span></div>
          <div className="graph-canvas graph-3d-canvas">
            <MemoryScene nodes={graph.nodes} edges={graph.edges} selected={selected} voiceState={voiceState} onSelect={setSelected} />
          </div>
          <div className="graph-footer"><span><i className="legend-dot cyan" /> ACTIVE CONTEXT</span><span><i className="legend-dot muted" /> LONG-TERM MEMORY</span><span className="mono">DRAG TO ORBIT / SCROLL TO ZOOM</span></div>
        </div>

        <aside className={`side-stack ${sideOpen ? "side-open" : ""}`}>
          <div className="panel focus-panel">
            <div className="panel-head"><p className="eyebrow">FOCUS NODE</p><Sparkles size={16} className="soft-icon" /></div>
            <div className="focus-node"><div className="focus-orbit"><BrainCircuit size={23} /></div><div><h3>{selectedNode.label}</h3><p>{selectedNode.detail}</p></div></div>
            <div className="detail-list"><div><span>TYPE</span><strong>{selectedNode.kind.toUpperCase()}</strong></div><div><span>CONFIDENCE</span><strong className="accent-text">94.2%</strong></div><div><span>RELATIONSHIPS</span><strong>{graph.edges.filter((e) => e.source === selectedNode.id || e.target === selectedNode.id).length}</strong></div></div>
          </div>
          <div className="panel call-panel">
            <div className="panel-head"><p className="eyebrow">VOICE CHANNEL</p><PhoneCall size={16} className="soft-icon" /></div>
            <div className="call-state">
              <div 
                className="pulse-ring" 
                style={{ 
                  transform: `scale(${1 + voiceVolume * 0.4})`, 
                  borderColor: getStatusColor(voiceState),
                  transition: "transform 0.08s ease-out"
                }}
              >
                <Mic size={20} style={{ color: getStatusColor(voiceState) }} />
              </div>
              <div>
                <strong>{listening ? (voiceVolume > 0.05 ? "Voice Detected" : "Listening...") : "Channel ready"}</strong>
                <p>{listening ? `Volume: ${(voiceVolume * 100).toFixed(0)}%` : "Tap to open session"}</p>
              </div>
            </div>
            <button className={`primary-button ${listening ? "active" : ""}`} onClick={toggleListening} style={{ backgroundColor: listening ? getStatusColor(voiceState) : undefined }}>
              {listening ? <AudioLines size={16} /> : <Mic size={16} />} {listening ? "END LISTENING" : "START LISTENING"}
            </button>
          </div>
        </aside>
      </section>

      {/* Function Rail Sidebar */}
      <FunctionRail 
        voiceState={voiceState} 
        voiceVolume={voiceVolume} 
        onFocus={() => setFocusOpen((v) => !v)} 
        onVoice={startVoiceInput} 
        onActivity={() => setActivityOpen((v) => !v)} 
        onChat={() => setChatOpen((v) => !v)} 
      />
      
      {/* Readable Status Footer Badge with Crisp Text & Glassmorphism Backdrop */}
      <div 
        style={{ 
          position: "fixed", 
          bottom: "20px", 
          right: "20px", 
          zIndex: 1000, 
          display: "flex", 
          alignItems: "center", 
          gap: "8px", 
          backgroundColor: "rgba(10, 23, 24, 0.9)", 
          border: `1px solid ${getStatusColor(voiceState)}`, 
          padding: "6px 14px", 
          borderRadius: "6px", 
          color: "#ffffff", 
          fontSize: "12px", 
          fontFamily: "monospace", 
          letterSpacing: "1px",
          boxShadow: `0 0 12px ${getStatusColor(voiceState)}33`
        }}
      >
        <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: getStatusColor(voiceState), boxShadow: `0 0 8px ${getStatusColor(voiceState)}` }} />
        <span>{voiceState.toUpperCase()}</span>
      </div>

      <section className={`lower-grid ${drawerOpen ? "drawer-open" : ""}`}>
        <div className="panel activity-panel">
          <div className="panel-head"><div><p className="eyebrow">SYSTEM TELEMETRY</p><h2>Recent activity</h2></div><button className="text-button">VIEW LOG <span>↗</span></button></div>
          <div className="activity-list">{events.slice(0, 4).map((event) => <div className="activity-item" key={event.id}><div className={`activity-icon ${event.type}`}><Activity size={15} /></div><div><strong>{event.title}</strong><p>{event.detail}</p></div><time>{event.timestamp}</time></div>)}</div>
        </div>
        <div className="panel prompt-panel">
          <div className="panel-head"><div><p className="eyebrow">DIRECTIVE INPUT / CAPTIONS</p><h2>Ask, research, remember</h2></div><Command size={16} className="soft-icon" /></div>
          <div className="chat-captions">{chatMessages.slice(-3).map((chatMessage, index) => <p className={chatMessage.role} key={`${chatMessage.role}-${index}`}><b>{chatMessage.role === "cisco" ? "CISCO" : "YOU"}</b>{chatMessage.text}</p>)}</div>
          <div className="prompt-box"><textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ask CISCO to research, remember, or act..." /><button className="send-button" title="Send directive" onClick={sendMessage}><Send size={16} /></button></div>
          <div className="prompt-hint"><button className="text-button" onClick={startVoiceInput}><Mic size={12} /> VOICE INPUT</button><button className={`text-button ${useWeb ? "selected-toggle" : ""}`} onClick={() => setUseWeb((v) => !v)}><Radio size={12} /> {useWeb ? "WEB ON" : "LOCAL ONLY"}</button><span>{voiceEnabled ? "SPEAKING ON" : "READY"}</span></div>
        </div>
      </section>

      <footer><span>PROJECT CISCO / CONTROL SURFACE</span><span className="mono">BUILD 0.1.0 <i className="live-dot" style={{ backgroundColor: getStatusColor(voiceState) }} /></span></footer>

      {/* Floating Panels */}
      {focusOpen && (
        <FloatingPanel title="FOCUS NODE" onClose={() => setFocusOpen(false)} defaultPos={{ x: 80, y: 120, width: 340, height: 260 }}>
          <div className="focus-node"><div className="focus-orbit"><BrainCircuit size={23} /></div><div><h3>{selectedNode.label}</h3><p>{selectedNode.detail}</p></div></div>
          <div className="detail-list"><div><span>TYPE</span><strong>{selectedNode.kind.toUpperCase()}</strong></div><div><span>CONFIDENCE</span><strong className="accent-text">94.2%</strong></div><div><span>RELATIONSHIPS</span><strong>{graph.edges.filter((e) => e.source === selectedNode.id || e.target === selectedNode.id).length}</strong></div></div>
        </FloatingPanel>
      )}

      {activityOpen && (
        <FloatingPanel title="SYSTEM TELEMETRY" onClose={() => setActivityOpen(false)} defaultPos={{ x: 120, y: 160, width: 360, height: 300 }}>
          <div className="activity-list">{events.slice(0, 6).map((event) => <div className="activity-item" key={event.id}><div className={`activity-icon ${event.type}`}><Activity size={15} /></div><div><strong>{event.title}</strong><p>{event.detail}</p></div><time>{event.timestamp}</time></div>)}</div>
        </FloatingPanel>
      )}

      {chatOpen && (
        <FloatingPanel title="CISCOAI CHAT" onClose={() => setChatOpen(false)} defaultPos={{ x: 160, y: 200, width: 380, height: 300 }}>
          <div className="chat-panel-body">
            <div className="chat-history">{chatMessages.map((msg, i) => <p className={msg.role} key={`${msg.role}-${i}`}><b>{msg.role === "cisco" ? "CISCOAI" : "YOU"}</b>{msg.text}</p>)}</div>
            <div className="prompt-box"><textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Ask CiscoAI..." /><button className="send-button" title="Send message" onClick={sendMessage}><Send size={16} /></button></div>
          </div>
        </FloatingPanel>
      )}
    </main>
  );
}

function Metric({ label, value, accent, icon }: { label: string; value: string; accent: string; icon: React.ReactNode }) { return <div className="metric"><div className={`metric-icon ${accent}`}>{icon}</div><div><span>{label}</span><strong>{value}</strong></div></div>; }

function FunctionRail({ onFocus, onVoice, onActivity, onChat, voiceState, voiceVolume }: { onFocus: () => void; onVoice: () => void; onActivity: () => void; onChat: () => void; voiceState: string; voiceVolume: number }) {
  return (
    <nav className="function-rail" aria-label="CiscoAI functions" style={{ position: "fixed", right: "24px", top: "50%", transform: "translateY(-50%)", zIndex: 1000, pointerEvents: "auto" }}>
      <button type="button" title="Focus current node" onClick={onFocus}><Sparkles size={17} /></button>
      <button 
        type="button"
        className={`voice-${voiceState}`} 
        title={`Voice: ${voiceState}`} 
        onClick={onVoice}
        style={{ 
          transform: `scale(${1 + voiceVolume * 0.4})`, 
          transition: "transform 0.08s ease-out" 
        }}
      >
        <Mic size={17} />
      </button>
      <button type="button" title="Open activity" onClick={onActivity}><Activity size={17} /></button>
      <button type="button" title="Open CiscoAI Chat" onClick={onChat}><MessageCircle size={17} /></button>
    </nav>
  );
}

function FloatingPanel({ title, defaultPos, onClose, children }: { title: string; defaultPos: { x: number; y: number; width: number; height: number }; onClose: () => void; children: React.ReactNode }) {
  const [frame, setFrame] = useState(defaultPos);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (drag.current) {
        setFrame((val) => ({
          ...val,
          x: Math.max(0, drag.current!.left + event.clientX - drag.current!.x),
          y: Math.max(0, drag.current!.top + event.clientY - drag.current!.y),
        }));
      }
    };
    const end = () => { drag.current = null; };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
  }, []);

  return (
    <section className="hologram-panel" style={{ position: "fixed", left: frame.x, top: frame.y, width: frame.width, height: frame.height, zIndex: 2000, pointerEvents: "auto" }}>
      <header onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, left: frame.x, top: frame.y }; }}>
        <span>{title}</span>
        <button type="button" title="Close panel" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onClose(); }}>
          <X size={14} />
        </button>
      </header>
      <div className="hologram-content">{children}</div>
    </section>
  );
}

type SpeechRecognitionLike = { start: () => void; onstart?: () => void; onresult: (event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void };