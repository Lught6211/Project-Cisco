"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import "./scene.css";

const MemoryScene = dynamic(() => import("./MemoryScene"), { ssr: false });

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "https://cisco-backend-yve2.onrender.com").replace(/\/+$/, "");

type Node = { id: string; label: string; kind: string; x: number; y: number; confidence?: string; detail?: string; active?: boolean };
type Edge = { source: string; target: string; label: string };
type EventItem = { id: string; type: string; title: string; detail: string; timestamp: string };
type CaptionItem = { id: string; sender: "USER" | "CISCO"; text: string; time: string };
type ConversationTurn = { role: "user" | "assistant"; content: string };

export default function Home() {
  const [nodes, setNodes] = useState<Node[]>([
    { id: "cisco", label: "CISCO", kind: "agent", confidence: "99.8%", detail: "Autonomous voice agent core runtime", x: 50, y: 48, active: true },
    { id: "maya", label: "Maya Chen", kind: "person", confidence: "96.5%", detail: "Primary operator identity profile", x: 20, y: 27 },
    { id: "table-12", label: "Table 12", kind: "place", confidence: "88.4%", detail: "Preferred location coordinate", x: 79, y: 26 },
    { id: "reservation", label: "Reservation", kind: "task", confidence: "94.2%", detail: "Active calendar task directive", x: 78, y: 73 },
    { id: "ramen", label: "Ramen Kaito", kind: "memory", confidence: "91.0%", detail: "Historical memory entry #8492", x: 20, y: 74 },
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

  const [captions, setCaptions] = useState<CaptionItem[]>([]);
  const [chatMessages, setChatMessages] = useState<CaptionItem[]>([]);
  const conversationRef = useRef<ConversationTurn[]>([]);
  const preferredVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const voiceChoiceLockedRef = useRef(false);

  const [selectedId, setSelectedId] = useState<string>("cisco");
  const [voiceState, setVoiceState] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  const [speechLevel, setSpeechLevel] = useState(0);
  const [inputMsg, setInputMsg] = useState("");
  const [isSending, setIsSending] = useState(false);

  // Independent Open State for Multiple Floating HUD Panels
  const [openPanels, setOpenPanels] = useState({
    chat: false,
    telemetry: false,
    focus: false,
  });

  // Draggable Window Positions
  const [chatPos, setChatPos] = useState({ x: 70, y: 472 });
  const [telemetryPos, setTelemetryPos] = useState({ x: 70, y: 152 });
  const [focusPos, setFocusPos] = useState({ x: 860, y: 120 });

  useEffect(() => {
    if (window.innerWidth <= 900) {
      setTelemetryPos({ x: 16, y: 98 });
      setFocusPos({ x: 16, y: 340 });
      setChatPos({ x: 16, y: 570 });
    }
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [graphRes, eventsRes] = await Promise.all([
          fetch(`${API_URL}/api/graph`).then((r) => (r.ok ? r.json() : null)),
          fetch(`${API_URL}/api/events`).then((r) => (r.ok ? r.json() : null)),
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

  const selectNode = (id: string) => {
    setSelectedId(id);
    setOpenPanels((prev) => ({ ...prev, focus: true }));
  };

  const toggleMic = () => {
    setVoiceState((prev) => (prev === "idle" ? "listening" : "idle"));
  };

  const speakReply = (text: string) => {
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      setVoiceState("idle");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = navigator.language || "en-US";
    const femaleVoiceNames = ["samantha", "zira", "aria", "jenny", "michelle", "susan", "karen", "victoria", "hazel", "sonia", "libby", "natasha", "ava", "allison", "joanna", "kendra", "kimberly", "salli", "ivy", "google uk english female", "google us english"];
    const chooseVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      if (!voices.length) return;
      const language = utterance.lang.toLowerCase();
      const sameLanguage = voices.filter((voice) => voice.lang.toLowerCase() === language);
      const englishVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith("en"));
      const candidates = sameLanguage.length ? sameLanguage : englishVoices;
      if (!voiceChoiceLockedRef.current) {
        for (const knownName of femaleVoiceNames) {
          const match = candidates.find((voice) => voice.name.toLowerCase().includes(knownName));
          if (match) {
            preferredVoiceRef.current = match;
            break;
          }
        }
        preferredVoiceRef.current ??= candidates[0] ?? voices[0];
        voiceChoiceLockedRef.current = true;
      }
      if (preferredVoiceRef.current) utterance.voice = preferredVoiceRef.current;
    };
    let level = 0;
    let levelTimer: number | undefined;
    const finishSpeaking = () => {
      if (levelTimer !== undefined) window.clearInterval(levelTimer);
      setSpeechLevel(0);
      setVoiceState("idle");
    };
    utterance.volume = 1;
    utterance.onstart = () => setVoiceState("speaking");
    utterance.onboundary = (event) => {
      if (event.name !== "word") return;
      const wordLength = Math.max(1, event.charLength || 1);
      level = Math.min(1, 0.38 + wordLength * 0.055);
      setSpeechLevel(level);
    };
    utterance.onend = finishSpeaking;
    utterance.onerror = finishSpeaking;
    setSpeechLevel(0);
    setVoiceState("thinking");
    let speechQueued = false;
    let voiceWaitTimer: number | undefined;
    const queueSpeech = () => {
      if (speechQueued) return;
      speechQueued = true;
      window.speechSynthesis.removeEventListener("voiceschanged", queueSpeech);
      if (voiceWaitTimer !== undefined) window.clearTimeout(voiceWaitTimer);
      chooseVoice();
      // Keep one chosen voice for the whole page session. If the browser never
      // supplies its voice list, consistently use its built-in default.
      if (!window.speechSynthesis.getVoices().length) voiceChoiceLockedRef.current = true;
      levelTimer = window.setInterval(() => {
        level *= 0.82;
        if (level < 0.025) level = 0;
        setSpeechLevel(level);
      }, 45);
      setVoiceState("speaking");
      window.speechSynthesis.speak(utterance);
    };
    if (window.speechSynthesis.getVoices().length) queueSpeech();
    else {
      window.speechSynthesis.addEventListener("voiceschanged", queueSpeech);
      voiceWaitTimer = window.setTimeout(queueSpeech, 900);
    }
  };

  const togglePanel = (panel: "chat" | "telemetry" | "focus") => {
    setOpenPanels((prev) => ({ ...prev, [panel]: !prev[panel] }));
  };

  const handleSendMessage = async () => {
    if (!inputMsg.trim() || isSending) return;
    const prompt = inputMsg;
    const focusedId = selectedNode?.id ?? "cisco";
    const recentHistory = conversationRef.current.slice(-12);
    const nowTime = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Append User Caption
    const userMessage = { id: `cap-${Date.now()}`, sender: "USER" as const, text: prompt, time: nowTime };
    setCaptions((prev) => [...prev, userMessage]);
    setChatMessages((prev) => [...prev, userMessage]);
    setInputMsg("");
    setIsSending(true);
    setVoiceState("thinking");

    try {
      const res = await fetch(`${API_URL}/api/agent/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt, use_web: true, history: recentHistory, focus_node_id: focusedId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.detail || `Backend returned HTTP ${res.status}`);
      if (typeof data?.answer !== "string" || !data.answer.trim()) throw new Error("Backend returned an empty answer.");
      const resTime = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

      const answer = { id: `cap-${Date.now()}-res`, sender: "CISCO" as const, text: data.answer, time: resTime };
      setCaptions((prev) => [...prev, answer]);
      setChatMessages((prev) => [...prev, answer]);
      conversationRef.current = [...recentHistory, { role: "user" as const, content: prompt }, { role: "assistant" as const, content: data.answer }].slice(-12);
      speakReply(data.answer);
      if (typeof data.memory_node_id === "string") {
        setSelectedId(data.memory_node_id);
        setOpenPanels((prev) => ({ ...prev, focus: true }));
        void fetch(`${API_URL}/api/graph`).then(async (graphRes) => {
          if (!graphRes.ok) return;
          const graph = await graphRes.json();
          if (graph?.nodes) setNodes(graph.nodes);
          if (graph?.edges) setEdges(graph.edges);
        }).catch((error) => console.warn("Graph refresh after memory creation failed", error));
      }
      setEvents((prev) => [
        { id: `evt-${Date.now()}`, type: "memory", title: "Directive Executed", detail: data.answer, timestamp: "just now" },
        ...prev,
      ]);
    } catch (e) {
      const resTime = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const detail = e instanceof Error ? e.message : "Unknown connection error";
      const errorMessage = {
        id: `cap-${Date.now()}-error`,
        sender: "CISCO",
        text: `Could not get an AI response: ${detail}. Check the backend service and its AI provider settings.`,
        time: resTime,
      } as const;
      setCaptions((prev) => [...prev, errorMessage]);
      setChatMessages((prev) => [...prev, errorMessage]);
      setVoiceState("idle");
    } finally {
      setIsSending(false);
    }
  };

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
      {/* 3D Spatial Background */}
      <div className="canvas-layer">
        <MemoryScene
          nodes={nodes}
          edges={edges}
          selected={selectedId}
          voiceState={voiceState}
          speechLevel={speechLevel}
          onSelect={selectNode}
        />
      </div>

      {/* Top Header Bar */}
      <header className="top-bar">
        <div className="brand flex items-center gap-3">
          <div className="logo-box">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
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
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <polyline points="9 12 11 14 15 10" />
            </svg>
          </div>
        </div>
      </header>

      {/* Subheader Overlay */}
      <div className="subheader-overlay">
        <div className="eyebrow">// LIVE MEMORY GRAPH / SPATIAL CORE</div>
        <h2 className="section-title">Context topology / 3D</h2>
      </div>

      <div className="orbital-badge">⊙ ORBITAL</div>

      {/* MULTIPLE SIMULTANEOUS FLOATING HUD WINDOWS */}

      {/* 1. System Telemetry Window */}
      {openPanels.telemetry && (
        <div className="hud-panel telemetry-panel draggable-panel" style={{ top: `${telemetryPos.y}px`, left: `${telemetryPos.x}px` }}>
          <div className="hud-corner top-left" />
          <div className="hud-corner top-right" />
          <div className="hud-corner bottom-left" />
          <div className="hud-corner bottom-right" />
          
          <div className="hud-header" onMouseDown={makeDraggable(setTelemetryPos)}>
            <span>// SYSTEM TELEMETRY</span>
            <button onClick={() => togglePanel("telemetry")}>✕</button>
          </div>
          <div className="hud-body telemetry-list">
            {events.map((evt) => (
              <div key={evt.id} className="telemetry-item">
                <span className={`telemetry-icon type-${evt.type}`} aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                </span>
                <div className="telemetry-copy">
                  <div className="event-title">{evt.title}</div>
                  <p className="event-detail">{evt.detail}</p>
                </div>
                <span className="event-time">{evt.timestamp}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. Focus Node Inspection Window */}
      {openPanels.focus && (
        <div className="hud-panel focus-panel draggable-panel" style={{ top: `${focusPos.y}px`, left: `${focusPos.x}px` }}>
          <div className="hud-corner top-left" />
          <div className="hud-corner top-right" />
          <div className="hud-corner bottom-left" />
          <div className="hud-corner bottom-right" />

          <div className="hud-header" onMouseDown={makeDraggable(setFocusPos)}>
            <span>// FOCUS NODE</span>
            <button onClick={() => togglePanel("focus")}>✕</button>
          </div>
          <div className="hud-body">
            <div className="focus-summary">
              <div className={`node-icon-hex state-${voiceState}`} aria-label={`CISCO ${voiceState}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M9 4.5A3.5 3.5 0 0 0 5.8 10a3 3 0 0 0 .7 5.8A3.5 3.5 0 0 0 12 18.5V6a3.5 3.5 0 0 0-3-1.5Z" />
                  <path d="M15 4.5A3.5 3.5 0 0 1 18.2 10a3 3 0 0 1-.7 5.8 3.5 3.5 0 0 1-5.5 2.7V6a3.5 3.5 0 0 1 3-1.5Z" />
                  <path d="M8 9h2m4 0h2m-8 5h2m4 0h2m-4-2h.01" />
                </svg>
              </div>
              <div>
                <h3 className="focus-title">{selectedNode.label}</h3>
                <p className="focus-detail">{selectedNode.detail || "Contextual graph memory node"}</p>
              </div>
            </div>
            <div className="hud-stats-grid">
              <div>
                <span className="stat-label">TYPE</span>
                <span className="stat-val cyan">{selectedNode.kind.toUpperCase()}</span>
              </div>
              <div>
                <span className="stat-label">CONFIDENCE</span>
                <span className="stat-val green">{selectedNode.confidence || "94.2%"}</span>
              </div>
              <div>
                <span className="stat-label">RELATIONSHIPS</span>
                <span className="stat-val cyan">{nodeRelationships}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. CiscoAI Chat Panel */}
      {openPanels.chat && (
        <div className="hud-panel chat-panel draggable-panel" style={{ top: `${chatPos.y}px`, left: `${chatPos.x}px` }}>
          <div className="hud-corner top-left" />
          <div className="hud-corner top-right" />
          <div className="hud-corner bottom-left" />
          <div className="hud-corner bottom-right" />

          <div className="hud-header" onMouseDown={makeDraggable(setChatPos)}>
            <span>// CISCOAI CHAT</span>
            <button onClick={() => togglePanel("chat")}>✕</button>
          </div>
          
          <div className="hud-body">
            <div className="chat-history" aria-live="polite">
              {chatMessages.length === 0 ? <div className="chat-empty">Awaiting directive...</div> : chatMessages.slice(-20).map((cap) => (
                <div key={cap.id} className={`caption-line ${cap.sender === "USER" ? "user" : "cisco"}`}>
                  <span className="sender">{cap.sender}:</span>
                  <span className="text">{cap.text}</span>
                  <span className="time">{cap.time}</span>
                </div>
              ))}
            </div>

            {/* Input Directives Box */}
            <textarea
              value={inputMsg}
              onChange={(e) => setInputMsg(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
              placeholder="Ask CISCO to research, remember, or act..."
            />
            
            <button className="send-btn" onClick={handleSendMessage} disabled={isSending}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
              <span>{isSending ? "CISCO THINKING..." : "EXECUTE DIRECTIVE"}</span>
            </button>
          </div>
        </div>
      )}

      {/* Right Cyber Floating Action Rail */}
      <div className="right-dock">
        <button
          title="Focus Node"
          onClick={() => togglePanel("focus")}
          className={openPanels.focus ? "active" : ""}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="22" y1="12" x2="18" y2="12" />
            <line x1="6" y1="12" x2="2" y2="12" />
            <line x1="12" y1="6" x2="12" y2="2" />
            <line x1="12" y1="22" x2="12" y2="18" />
          </svg>
        </button>

        <button
          title="Voice Channel"
          onClick={toggleMic}
          className={voiceState === "listening" ? "active-mic" : ""}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="22" />
          </svg>
        </button>

        <button
          title="System Telemetry"
          onClick={() => togglePanel("telemetry")}
          className={openPanels.telemetry ? "active" : ""}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
        </button>

        <button
          title="Direct Chat & Captions"
          onClick={() => togglePanel("chat")}
          className={openPanels.chat ? "active" : ""}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      </div>

      {captions.length > 0 && (
        <aside className="caption-overlay" aria-label="Live captions" aria-live="polite">
          {captions.slice(-3).map((cap) => (
            <div key={cap.id} className={`caption-line ${cap.sender === "USER" ? "user" : "cisco"}`}>
              <span className="sender">{cap.sender}:</span>
              <span className="text">{cap.text}</span>
              <span className="time">{cap.time}</span>
            </div>
          ))}
        </aside>
      )}

      {/* Bottom Footer Bar */}
      <footer className="bottom-bar">
        <div className="legend">
          <span className="legend-item"><span className="dot cyan" /> ACTIVE CONTEXT</span>
          <span className="legend-item"><span className="dot gray" /> LONG-TERM MEMORY</span>
        </div>
        <div className="hint">DRAG TO ORBIT ↗ SCROLL TO ZOOM</div>
        <button className={`voice-pill voice-${voiceState}`} onClick={toggleMic}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
          </svg>
          <span>{voiceState.toUpperCase()}</span>
        </button>
      </footer>
    </div>
  );
}
