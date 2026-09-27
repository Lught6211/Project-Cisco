"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import "./scene.css";

const MemoryScene = dynamic(() => import("./MemoryScene"), { ssr: false });

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://cisco-backend-yve2.onrender.com";

type Node = { id: string; label: string; kind: string; x: number; y: number; detail?: string; active?: boolean };
type Edge = { source: string; target: string; label: string };
type EventItem = { id: string; type: string; title: string; detail: string; timestamp: string };

export default function Home() {
  const [nodes, setNodes] = useState<Node[]>([
    { id: "cisco", label: "CISCO", kind: "agent", detail: "Autonomous voice agent", x: 50, y: 48, active: true },
    { id: "maya", label: "Maya Chen", kind: "person", detail: "Primary operator", x: 20, y: 27 },
    { id: "table-12", label: "Table 12", kind: "place", detail: "Preferred dining spot", x: 79, y: 26 },
    { id: "reservation", label: "Reservation", kind: "task", detail: "Friday at 19:30", x: 78, y: 73 },
    { id: "ramen", label: "Ramen Kaito", kind: "memory", detail: "Last visited 18 days ago", x: 20, y: 74 },
  ]);

  const [edges, setEdges] = useState<Edge[]>([
    { source: "cisco", target: "maya", label: "serves" },
    { source: "cisco", target: "reservation", label: "executing" },
    { source: "reservation", target: "table-12", label: "at" },
    { source: "maya", target: "ramen", label: "likes" },
    { source: "ramen", target: "table-12", label: "recommends" },
  ]);

  const [events, setEvents] = useState<EventItem[]>([
    { id: "evt-1", type: "call", title: "Call simulation ready", detail: "Outbound voice channel is standing by", timestamp: "now" },
    { id: "evt-2", type: "memory", title: "Memory graph hydrated", detail: "5 nodes connected from local context", timestamp: "2m ago" },
    { id: "evt-3", type: "system", title="CISCO online", detail="All local systems nominal", timestamp="5m ago" },
  ]);

  const [selectedId, setSelectedId] = useState<string>("cisco");
  const [voiceState, setVoiceState] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  const [inputMsg, setInputMsg] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [activePanel, setActivePanel] = useState<"chat" | "telemetry" | "focus" | null>(null);

  // Sync with Backend API
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [graphRes, eventsRes] = await Promise.all([
          fetch(`${API_URL}/api/graph`).then((r) => r.ok ? r.json() : null),
          fetch(`${API_URL}/api/events`).then((r) => r.ok ? r.json() : null),
        ]);
        if (graphRes?.nodes) setNodes(graphRes.nodes);
        if (graphRes?.edges) setEdges(graphRes.edges);
        if (Array.isArray(eventsRes)) setEvents(eventsRes);
      } catch (e) {
        console.warn("Backend offline or syncing...", e);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 6000);
    return () => clearInterval(interval);
  }, []);

  const selectedNode = nodes.find((n) => n.id === selectedId) || nodes[0];
  const nodeRelationships = edges.filter((e) => e.source === selectedId || e.target === selectedId).length;

  const handleSendMessage = async () => {
    if (!inputMsg.trim() || isSending) return;
    const userPrompt = inputMsg;
    setInputMsg("");
    setIsSending(true);
    setVoiceState("thinking");

    try {
      const res = await fetch(`${API_URL}/api/agent/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userPrompt, use_web: true }),
      });

      if (res.ok) {
        const data = await res.json();
        setEvents((prev) => [
          {
            id: `evt-${Date.now()}`,
            type: "memory",
            title: `Research stored via ${data.provider || "cisco-core"}`,
            detail: data.answer,
            timestamp: "just now",
          },
          ...prev,
        ]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSending(false);
      setVoiceState("idle");
    }
  };

  const toggleMic = () => {
    if (voiceState === "idle") {
      setVoiceState("listening");
    } else {
      setVoiceState("idle");
    }
  };

  return (
    <div className="app-shell min-h-screen bg-[#030712] text-slate-100 p-4 font-mono flex flex-col justify-between">
      {/* Top Header Bar */}
      <header className="flex items-center justify-between border-b border-cyan-500/20 pb-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded border border-cyan-400/40 bg-cyan-950/30 flex items-center justify-center text-cyan-400 font-bold">
            ⌘
          </div>
          <div>
            <h1 className="text-base font-bold tracking-wider text-slate-100">CiscoAI</h1>
            <p className="text-[10px] text-cyan-400/70 tracking-widest uppercase">autonomous intelligence / 01</p>
          </div>
        </div>

        {/* Top Status Indicators Bar */}
        <div className="flex items-center gap-6 text-xs">
          <div className="flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded border border-slate-800">
            <span className={`w-2 h-2 rounded-full ${voiceState === "idle" ? "bg-cyan-400" : voiceState === "listening" ? "bg-amber-400 animate-pulse" : "bg-purple-400 animate-ping"}`} />
            <span className="text-slate-300 uppercase">{voiceState}</span>
          </div>
          <div className="bg-slate-900/80 px-3 py-1.5 rounded border border-slate-800 text-slate-400">
            NODES: <span className="text-cyan-400 font-bold">{String(nodes.length).padStart(2, "0")}</span>
          </div>
          <div className="bg-slate-900/80 px-3 py-1.5 rounded border border-slate-800 text-slate-400">
            ACTIVE: <span className="text-emerald-400 font-bold">01</span>
          </div>
          <div className="bg-slate-900/80 px-3 py-1.5 rounded border border-slate-800 text-slate-400">
            STABILITY: <span className="text-cyan-400 font-bold">99.98%</span>
          </div>
        </div>
      </header>

      {/* Main Dashboard Grid */}
      <main className="grid grid-cols-12 gap-4 flex-1">
        {/* Left Section: 3D Memory Graph Viewport (Span 8) */}
        <div className="col-span-8 flex flex-col bg-slate-950/60 border border-cyan-500/20 rounded-lg p-3 relative overflow-hidden h-[480px]">
          <div className="flex justify-between items-center mb-2 z-10">
            <div>
              <span className="text-[10px] text-cyan-400 tracking-widest uppercase">LIVE MEMORY GRAPH / SPATIAL CORE</span>
              <h2 className="text-sm font-bold text-slate-200">Context topology / 3D</h2>
            </div>
            <span className="text-[10px] text-cyan-400/60 border border-cyan-500/30 px-2 py-0.5 rounded">⊙ ORBITAL</span>
          </div>

          <div className="flex-1 w-full h-full rounded relative">
            <MemoryScene
              nodes={nodes}
              edges={edges}
              selected={selectedId}
              voiceState={voiceState}
              onSelect={(id) => setSelectedId(id)}
            />
          </div>

          <div className="flex justify-between items-center text-[10px] text-slate-400 mt-2 z-10">
            <div className="flex gap-4">
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-cyan-400" /> ACTIVE CONTEXT</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-slate-500" /> LONG-TERM MEMORY</span>
            </div>
            <span>DRAG TO ORBIT ↗ SCROLL TO ZOOM</span>
          </div>
        </div>

        {/* Right Section: Focus Node & Voice Channel Cards (Span 4) */}
        <div className="col-span-4 flex flex-col gap-4">
          {/* Focus Node Card */}
          <div className="bg-slate-950/60 border border-cyan-500/20 rounded-lg p-4">
            <div className="flex justify-between items-center mb-3">
              <span className="text-[10px] text-cyan-400 tracking-widest uppercase">FOCUS NODE</span>
              <span className="text-cyan-400 text-xs">✨</span>
            </div>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full border border-cyan-400/40 bg-cyan-950/40 flex items-center justify-center text-cyan-400 font-bold">
                {selectedNode.kind === "agent" ? "⌘" : "◈"}
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-100">{selectedNode.label}</h3>
                <p className="text-xs text-slate-400">{selectedNode.detail || "Contextual graph memory node"}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs bg-slate-900/60 p-2 rounded border border-slate-800">
              <div>
                <span className="text-[9px] text-slate-500 block">TYPE</span>
                <span className="text-cyan-400 font-bold uppercase">{selectedNode.kind}</span>
              </div>
              <div>
                <span className="text-[9px] text-slate-500 block">CONFIDENCE</span>
                <span className="text-emerald-400 font-bold">94.2%</span>
              </div>
              <div>
                <span className="text-[9px] text-slate-500 block">RELATIONSHIPS</span>
                <span className="text-cyan-400 font-bold">{nodeRelationships}</span>
              </div>
            </div>
          </div>

          {/* Voice Channel Card */}
          <div className="bg-slate-950/60 border border-cyan-500/20 rounded-lg p-4 flex-1 flex flex-col justify-between">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[10px] text-cyan-400 tracking-widest uppercase">VOICE CHANNEL</span>
              <span className="text-cyan-400 text-xs">📞</span>
            </div>

            <div className="flex items-center gap-3 my-2">
              <div className={`w-10 h-10 rounded-full border flex items-center justify-center transition-all ${voiceState === "listening" ? "border-amber-400 bg-amber-950/40 text-amber-400 shadow-[0_0_12px_#f59e0b]" : "border-cyan-400/40 bg-cyan-950/30 text-cyan-400"}`}>
                🎙
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-200">
                  {voiceState === "listening" ? "Channel Active — Listening..." : "Channel ready"}
                </h4>
                <p className="text-[10px] text-slate-400">
                  {voiceState === "listening" ? "Speak directive into microphone" : "Tap below to open voice session"}
                </p>
              </div>
            </div>

            <button
              onClick={toggleMic}
              className={`w-full py-2 rounded text-xs font-bold border transition-all ${voiceState === "listening" ? "border-amber-400 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30" : "border-cyan-500/40 bg-cyan-950/30 text-cyan-400 hover:bg-cyan-500/20 hover:border-cyan-400"}`}
            >
              {voiceState === "listening" ? "🛑 STOP LISTENING" : "🎙 START LISTENING"}
            </button>
          </div>
        </div>

        {/* Bottom Left: System Telemetry Log (Span 7) */}
        <div className="col-span-7 bg-slate-950/60 border border-cyan-500/20 rounded-lg p-4 h-[190px] flex flex-col">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] text-cyan-400 tracking-widest uppercase">SYSTEM TELEMETRY</span>
            <span className="text-[10px] text-slate-400 cursor-pointer hover:text-cyan-400">VIEW LOG ↗</span>
          </div>
          <h3 className="text-xs font-bold text-slate-200 mb-2">Recent activity</h3>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {events.slice(0, 4).map((evt) => (
              <div key={evt.id} className="flex justify-between items-start text-xs bg-slate-900/50 p-2 rounded border border-slate-800/80">
                <div className="flex gap-2.5 items-start">
                  <span className="text-cyan-400 mt-0.5">〰</span>
                  <div>
                    <h5 className="font-bold text-slate-200 text-[11px]">{evt.title}</h5>
                    <p className="text-[10px] text-slate-400">{evt.detail}</p>
                  </div>
                </div>
                <span className="text-[9px] text-slate-500 whitespace-nowrap ml-2">{evt.timestamp}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Right: Directive Input Chat Box (Span 5) */}
        <div className="col-span-5 bg-slate-950/60 border border-cyan-500/20 rounded-lg p-4 h-[190px] flex flex-col justify-between">
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-cyan-400 tracking-widest uppercase">DIRECTIVE INPUT / CAPTIONS</span>
            <span className="text-slate-400 text-xs">⌘</span>
          </div>
          <h3 className="text-xs font-bold text-slate-200 mb-1">Ask, research, remember</h3>

          <div className="relative my-1 flex-1">
            <textarea
              value={inputMsg}
              onChange={(e) => setInputMsg(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
              placeholder="Ask CISCO to research, remember, or act..."
              className="w-full h-full bg-slate-900/80 border border-slate-800 rounded p-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 resize-none"
            />
            <button
              onClick={handleSendMessage}
              disabled={isSending || !inputMsg.trim()}
              className="absolute right-2 bottom-2 bg-cyan-500/20 border border-cyan-400/40 hover:bg-cyan-500/40 text-cyan-300 p-1.5 rounded transition-all disabled:opacity-30"
            >
              🚀
            </button>
          </div>

          <div className="flex justify-between items-center text-[9px] text-slate-500">
            <span className="flex items-center gap-1"><span className="text-cyan-400">🎙</span> VOICE INPUT</span>
            <span className="flex items-center gap-1"><span className="text-cyan-400">📶</span> LOCAL ONLY</span>
            <span className="text-slate-400">READY</span>
          </div>
        </div>
      </main>

      {/* Floating Right Action Rail */}
      <div className="fixed right-4 top-1/2 -translate-y-1/2 flex flex-col gap-3 bg-slate-900/80 border border-cyan-500/30 p-2 rounded-xl backdrop-blur-md z-20 shadow-[0_0_20px_rgba(0,240,255,0.15)]">
        <button onClick={() => setActivePanel(activePanel === "focus" ? null : "focus")} className="w-9 h-9 rounded-lg bg-slate-800/80 border border-slate-700 hover:border-cyan-400 text-cyan-400 flex items-center justify-center transition-all hover:scale-105">✨</button>
        <button onClick={toggleMic} className={`w-9 h-9 rounded-lg border flex items-center justify-center transition-all hover:scale-105 ${voiceState === "listening" ? "bg-amber-500/30 border-amber-400 text-amber-300 shadow-[0_0_12px_#f59e0b]" : "bg-slate-800/80 border-slate-700 hover:border-cyan-400 text-cyan-400"}`}>🎙</button>
        <button onClick={() => setActivePanel(activePanel === "telemetry" ? null : "telemetry")} className="w-9 h-9 rounded-lg bg-slate-800/80 border border-slate-700 hover:border-cyan-400 text-cyan-400 flex items-center justify-center transition-all hover:scale-105">〰</button>
        <button onClick={() => setActivePanel(activePanel === "chat" ? null : "chat")} className="w-9 h-9 rounded-lg bg-slate-800/80 border border-slate-700 hover:border-cyan-400 text-cyan-400 flex items-center justify-center transition-all hover:scale-105">💬</button>
      </div>

      {/* Footer Bar */}
      <footer className="flex justify-between items-center text-[10px] text-slate-500 border-t border-slate-800/80 pt-2 mt-3">
        <span>PROJECT CISCO / CONTROL SURFACE</span>
        <div className="flex items-center gap-2">
          <span>BUILD 0.1.0</span>
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-cyan-400 font-bold uppercase">{voiceState}</span>
        </div>
      </footer>
    </div>
  );
}