"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import "./scene.css";

const MemoryScene = dynamic(() => import("./MemoryScene"), { ssr: false });

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://cisco-backend-yve2.onrender.com";

type Node = { id: string; label: string; kind: string; x: number; y: number; detail?: string; active?: boolean };
type Edge = { source: string; target: string; label: string };

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

  const [selectedId, setSelectedId] = useState<string>("cisco");
  const [voiceState, setVoiceState] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  const [inputMsg, setInputMsg] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [activePanel, setActivePanel] = useState<"chat" | "telemetry" | "focus" | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`${API_URL}/api/graph`).then((r) => r.ok ? r.json() : null);
        if (res?.nodes) setNodes(res.nodes);
        if (res?.edges) setEdges(res.edges);
      } catch (e) {
        console.warn("Backend sync...", e);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 6000);
    return () => clearInterval(interval);
  }, []);

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
      await fetch(`${API_URL}/api/agent/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt, use_web: true }),
      });
    } catch (e) {
      console.error(e);
    } finally {
      setIsSending(false);
      setVoiceState("idle");
    }
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
          onSelect={(id) => setSelectedId(id)}
        />
      </div>

      {/* Top Header Bar */}
      <header className="top-bar">
        <div className="brand flex items-center gap-3">
          <div className="logo-box">⌘</div>
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
          <div className="icon-badge">🛡️</div>
        </div>
      </header>

      {/* Subheader Overlay */}
      <div className="subheader-overlay">
        <div className="eyebrow">LIVE MEMORY GRAPH / SPATIAL CORE</div>
        <h2 className="section-title">Context topology / 3D</h2>
      </div>

      <div className="orbital-badge">⊙ ORBITAL</div>

      {/* Floating Chat Panel */}
      {activePanel === "chat" && (
        <div className="floating-chat-panel">
          <div className="panel-header">
            <span>// CISCOAI CHAT</span>
            <button onClick={() => setActivePanel(null)}>✕</button>
          </div>
          <textarea
            value={inputMsg}
            onChange={(e) => setInputMsg(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
            placeholder="Ask CiscoAI..."
          />
          <button className="send-btn" onClick={handleSendMessage} disabled={isSending}>🚀 Send</button>
        </div>
      )}

      {/* Right Dock Rail */}
      <div className="right-dock">
        <button title="Focus Node" onClick={() => setActivePanel(activePanel === "focus" ? null : "focus")}>✨</button>
        <button title="Voice Input" onClick={toggleMic} className={voiceState === "listening" ? "active-mic" : ""}>🎙</button>
        <button title="Telemetry" onClick={() => setActivePanel(activePanel === "telemetry" ? null : "telemetry")}>〰</button>
        <button title="Chat" onClick={() => setActivePanel(activePanel === "chat" ? null : "chat")}>💬</button>
      </div>

      {/* Bottom Bar */}
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