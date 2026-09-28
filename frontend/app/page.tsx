"use client";

import { useEffect, useState, useRef } from "react";
import dynamic from "next/dynamic";
import "./scene.css";

const MemoryScene = dynamic(() => import("./MemoryScene"), { ssr: false });

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://cisco-backend-yve2.onrender.com";

type Node = { id: string; label: string; kind: string; x: number; y: number; detail?: string; active?: boolean };
type Edge = { source: string; target: string; label: string };
type EventItem = { id: string; type: string; title: string; detail: string; timestamp: string };

export default function Home() {
  const [nodes, setNodes] = useState<Node[]>([
    { id: "cisco", label: "CISCO", kind: "agent", detail: "Autonomous voice agent core", x: 50, y: 48, active: true },
    { id: "maya", label: "Maya Chen", kind: "person", detail: "Primary operator", x: 20, y: 27 },
    { id: "table-12", label: "Table 12", kind: "place", detail: "Preferred location coordinate", x: 79, y: 26 },
    { id: "reservation", label: "Reservation", kind: "task", detail: "Active task directive", x: 78, y: 73 },
    { id: "ramen", label: "Ramen Kaito", kind: "memory", detail: "Memory entry #8492", x: 20, y: 74 },
  ]);

  const [edges, setEdges] = useState<Edge[]>([
    { source: "cisco", target: "maya", label: "serves" },
    { source: "cisco", target: "reservation", label: "executing" },
    { source: "reservation", target: "table-12", label: "at" },
    { source: "maya", target: "ramen", label: "likes" },
    { source: "ramen", target: "table-12", label: "recommends" },
  ]);

  const [events, setEvents] = useState<EventItem[]>([
    { id: "evt-1", type: "call", title: "Call simulation ready", detail: "Outbound voice channel active", timestamp: "now" },
    { id: "evt-2", type: "memory", title: "Memory graph hydrated", detail: "5 nodes connected from local context", timestamp: "2m ago" },
    { id: "evt-3", type: "system", title: "CISCO online", detail: "All local systems nominal", timestamp: "5m ago" },
  ]);

  const [selectedId, setSelectedId] = useState<string>("cisco");
  const [voiceState, setVoiceState] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  const [inputMsg, setInputMsg] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [activePanel, setActivePanel] = useState<"chat" | "telemetry" | "focus" | null>(null);

  // Draggable Window Positions
  const [chatPos, setChatPos] = useState({ x: 24, y: 100 });
  const [telemetryPos, setTelemetryPos] = useState({ x: 24, y: 120 });
  const [focusPos, setFocusPos] = useState({ x: 24, y: 100 });

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
        console.warn("Backend sync...", e);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 6000);
    return () => clearInterval(interval);
  }, []);

  const selectedNode = nodes.find((n) => n.id === selectedId) || nodes[0];
  const nodeRelationships = edges.filter((e) => e.source === selectedId || e.target === selectedId).length;

  const toggleMic = () => {
    setVoiceState((prev) => (prev === "idle" ? "listening" : "idle"));
  };

  const handleSendMessage = async () => {
    if (!inputMsg.trim() || isSending) return;
    const prompt = inputMsg;
    setInputMsg("");
    setIsSending(true);
    setVoiceState("thinking");

    try {
      const res = await fetch(`${API_URL}/api/agent/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt, use_web: true }),
      });
      if (res.ok) {
        const data = await res.json();
        setEvents((prev) => [
          { id: `evt-${Date.now()}`, type: "memory", title: "Directive Processed", detail: data.answer, timestamp: "just now" },
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

  // Helper for Draggable Windows
  const makeDraggable = (setter: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>) => {
  return (e: React.MouseEvent) => {
      const startX = e.clientX;
      const startY = e.clientY;
      setter((prev) => {
        const onMouseMove = (moveEvent: MouseEvent) => {
          const dx = moveEvent.clientX - startX;
          const dy = moveEvent.clientY - startY;
          setter({ x: Math.max(10, prev.x + dx), y: Math.max(10, prev.y + dy) });
        };
        const onMouseUp = () => {
          window.removeEventListener("mousemove", onMouseMove);
          window.removeEventListener("mouseup", onMouseUp);
        };
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
        return prev;
      });
    };
  };

  return (
    <div className="cisco-container">
      {/* 3D Viewport Layer */}
      <div className="canvas-layer">
        <MemoryScene
          nodes={nodes}
          edges={edges}
          selected={selectedId}
          voiceState={voiceState}
          onSelect={(id) => {
            setSelectedId(id);
            setActivePanel("focus");
          }}
        />
      </div>

      {/* Top Header Bar */}
      <header className="top-bar">
        <div className="brand flex items-center gap-3">
          <div className="logo-box">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3zM6 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3z"/><path d="M18 8H6m12 8H6"/></svg>
          </div>
          <div>
            <div className="brand-title">CiscoAI</div>
            <div className="brand-sub">autonomous intelligence / 01</div>
          </div>
        </div>

        <div className="status-center">
          <span className="dot online" />
          <span className="status-text">CORE ONLINE</span>
          <span className="status-divider">|</span>
          <span className="status-time">09:41:22 UTC</span>
        </div>

        <div className="header-right">
          <div className="icon-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
          </div>
        </div>
      </header>

      {/* Subheader Overlay */}
      <div className="subheader-overlay">
        <div className="eyebrow">LIVE MEMORY GRAPH / SPATIAL CORE</div>
        <h2 className="section-title">Context topology / 3D</h2>
      </div>

      <div className="orbital-badge">⊙ ORBITAL</div>

      {/* DRAGGABLE & RESIZABLE FLOATING WINDOWS */}
      
      {/* 1. Focus Node Panel */}
      {activePanel === "focus" && (
        <div
          className="hud-panel draggable-panel"
          style={{ top: `${focusPos.y}px`, left: `${focusPos.x}px` }}
        >
          <div className="hud-header" onMouseDown={makeDraggable(setFocusPos)}>
            <span>// FOCUS NODE</span>
            <button onClick={() => setActivePanel(null)}>✕</button>
          </div>
          <div className="hud-body">
            <div className="flex items-center gap-3 mb-3">
              <div className="node-icon-hex">{selectedNode.kind === "agent" ? "⌘" : "◈"}</div>
              <div>
                <h3 className="text-sm font-bold text-slate-100">{selectedNode.label}</h3>
                <p className="text-[10px] text-slate-400">{selectedNode.detail || "Contextual graph memory node"}</p>
              </div>
            </div>
            <div className="hud-stats-grid">
              <div>
                <span className="stat-label">TYPE</span>
                <span className="stat-val cyan">{selectedNode.kind.toUpperCase()}</span>
              </div>
              <div>
                <span className="stat-label">CONFIDENCE</span>
                <span className="stat-val green">94.2%</span>
              </div>
              <div>
                <span className="stat-label">RELATIONSHIPS</span>
                <span className="stat-val cyan">{nodeRelationships}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Telemetry Log Panel */}
      {activePanel === "telemetry" && (
        <div
          className="hud-panel draggable-panel"
          style={{ top: `${telemetryPos.y}px`, left: `${telemetryPos.x}px` }}
        >
          <div className="hud-header" onMouseDown={makeDraggable(setTelemetryPos)}>
            <span>// SYSTEM TELEMETRY</span>
            <button onClick={() => setActivePanel(null)}>✕</button>
          </div>
          <div className="hud-body telemetry-list">
            {events.map((evt) => (
              <div key={evt.id} className="telemetry-item">
                <div className="font-bold text-slate-200 text-[11px]">{evt.title}</div>
                <p className="text-[10px] text-slate-400 mt-0.5">{evt.detail}</p>
                <span className="text-[8px] text-slate-500 block mt-1">{evt.timestamp}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Floating Chat Directive Panel */}
      {activePanel === "chat" && (
        <div
          className="hud-panel draggable-panel"
          style={{ top: `${chatPos.y}px`, left: `${chatPos.x}px` }}
        >
          <div className="hud-header" onMouseDown={makeDraggable(setChatPos)}>
            <span>// DIRECTIVE INPUT / CAPTIONS</span>
            <button onClick={() => setActivePanel(null)}>✕</button>
          </div>
          <div className="hud-body">
            <textarea
              value={inputMsg}
              onChange={(e) => setInputMsg(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
              placeholder="Ask CISCO to research, remember, or act..."
            />
            <button className="send-btn" onClick={handleSendMessage} disabled={isSending}>
              🚀 Execute Directive
            </button>
          </div>
        </div>
      )}

      {/* Right Floating Action Rail (Exact Match to bbce04 Vector SVGs) */}
      <div className="right-dock">
        <button
          title="Focus Node"
          onClick={() => setActivePanel(activePanel === "focus" ? null : "focus")}
          className={activePanel === "focus" ? "active" : ""}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3z"/></svg>
        </button>

        <button
          title="Voice Channel"
          onClick={toggleMic}
          className={voiceState === "listening" ? "active-mic" : ""}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
        </button>

        <button
          title="System Telemetry"
          onClick={() => setActivePanel(activePanel === "telemetry" ? null : "telemetry")}
          className={activePanel === "telemetry" ? "active" : ""}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
        </button>

        <button
          title="Direct Chat"
          onClick={() => setActivePanel(activePanel === "chat" ? null : "chat")}
          className={activePanel === "chat" ? "active" : ""}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </button>
      </div>

      {/* Bottom Footer Bar */}
      <footer className="bottom-bar">
        <div className="legend">
          <span className="legend-item"><span className="dot cyan" /> ACTIVE CONTEXT</span>
          <span className="legend-item"><span className="dot gray" /> LONG-TERM MEMORY</span>
        </div>
        <div className="hint">DRAG TO ORBIT ↗ SCROLL TO ZOOM</div>
        <button className="voice-pill" onClick={toggleMic}>
          🎙 {voiceState.toUpperCase()}
        </button>
      </footer>
    </div>
  );
}