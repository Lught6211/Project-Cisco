"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import dynamic from "next/dynamic";
import "./scene.css";

const MemoryScene = dynamic(() => import("./MemoryScene"), { ssr: false });

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "https://cisco-backend-yve2.onrender.com").replace(/\/+$/, "");

type Node = { id: string; label: string; kind: string; x: number; y: number; confidence?: number; relationship_count?: number; detail?: string; active?: boolean };
type Edge = { source: string; target: string; label: string };
type EventItem = { id: string; type: string; title: string; detail: string; timestamp: string };
type CaptionItem = { id: string; sender: "USER" | "CISCO" | "ULTRON"; text: string; time: string };
type ConversationTurn = { role: "user" | "assistant"; content: string };
type CorruptionCode = { id: number; value: string; left: number; top: number };
type HologramSession = { nodeId: string; title: string; summary: string; projection: "model" | "memory"; archetype: string };

function hologramSubject(prompt: string) {
  const match = prompt.match(/\bhologram\b/i);
  if (!match || match.index === undefined) return "";
  const before = prompt.slice(0, match.index);
  const after = prompt.slice(match.index + match[0].length);
  const explicitObject = after.match(/\b(?:of|about|for|showing)\s+(.+)/i);
  let subject = explicitObject?.[1] || after || before;
  subject = subject
    .split(/[,;.!?]|\b(?:i want|i would like|i need|so i can|so that|with details|and then)\b/i)[0]
    .replace(/^[\s,.:;!?-]*(?:please\s+)?(?:show|display|project|render|visualize|create|make|draw|build)?\s*/i, "")
    .replace(/^(?:me\s+)?(?:a|an|the)\s+/i, "")
    .replace(/^(?:of|about|for|showing)\s+/i, "")
    .replace(/\b(?:please|for me|in 3d|in 3-d|as a hologram|with|that|which|including|showing)\b.*$/i, "")
    .replace(/[?!.,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (/^(?:a|an|the|me|it|this|that|something|anything)$/i.test(subject)) return "";
  return subject;
}

function hologramArchetype(subject: string) {
  const text = subject.toLowerCase();
  if (/\b(car|cars|vehicle|vehicles|automobile|automobiles|sedan|sports car|truck|motorcycle)\b/.test(text)) return "car";
  if (/\b(engine|motor|powertrain)\b/.test(text)) return "engine";
  if (/\b(planet|earth|moon|mars|jupiter|saturn|world|globe|solar system)\b/.test(text)) return "planet";
  if (/\b(person|people|human|humans|body|anatomy|skeleton)\b/.test(text)) return "human";
  if (/\b(animal|dog|cat|horse|bird|fish|wolf|lion|elephant)\b/.test(text)) return "animal";
  if (/\b(molecule|atom|protein|cell|dna)\b/.test(text)) return "molecule";
  if (/\b(house|building|skyscraper|castle|tower)\b/.test(text)) return "building";
  if (/\b(airplane|airplanes|plane|planes|aircraft|jet|helicopter|rocket)\b/.test(text)) return "aircraft";
  if (/\b(tree|flower|plant|rose)\b/.test(text)) return "tree";
  return "object";
}

export default function Home() {
  const [nodes, setNodes] = useState<Node[]>([
    { id: "cisco", label: "CISCO", kind: "agent", detail: "Autonomous voice agent core runtime", x: 50, y: 48, active: true },
    { id: "maya", label: "Maya Chen", kind: "person", detail: "Primary operator identity profile", x: 20, y: 27 },
    { id: "table-12", label: "Table 12", kind: "place", detail: "Preferred location coordinate", x: 79, y: 26 },
    { id: "reservation", label: "Reservation", kind: "task", detail: "Active calendar task directive", x: 78, y: 73 },
    { id: "ramen", label: "Ramen Kaito", kind: "memory", detail: "Historical memory entry #8492", x: 20, y: 74 },
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
  const conversationsByTopicRef = useRef(new Map<string, ConversationTurn[]>());
  const preferredVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const voiceChoiceLockedRef = useRef(false);

  const [selectedId, setSelectedId] = useState<string>("cisco");
  const [cameraResetToken, setCameraResetToken] = useState(0);
  const [hologram, setHologram] = useState<HologramSession | null>(null);
  const [hologramView, setHologramView] = useState<"field" | "intel" | "model">("field");
  const [voiceState, setVoiceState] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  const [speechLevel, setSpeechLevel] = useState(0);
  const [inputMsg, setInputMsg] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [navigatorQuery, setNavigatorQuery] = useState("");
  const [navigatorIndex, setNavigatorIndex] = useState(0);
  const navigatorInputRef = useRef<HTMLInputElement>(null);
  const [kaizenScan, setKaizenScan] = useState<{ nodes: number; links: number; isolated: number; types: number } | null>(null);
  const [ultronMode, setUltronMode] = useState(false);
  const [corruption, setCorruption] = useState(0);
  const corruptionRef = useRef(0);
  const [corruptionCodes, setCorruptionCodes] = useState<CorruptionCode[]>([]);

  useEffect(() => {
    const target = ultronMode ? 1 : 0;
    const from = corruptionRef.current;
    if (from === target) return;
    const startedAt = performance.now();
    const duration = (ultronMode ? 9000 : 6500) * Math.abs(target - from);
    const timer = window.setInterval(() => {
      const linearProgress = Math.min(1, (performance.now() - startedAt) / duration);
      const easedProgress = linearProgress * linearProgress * (3 - 2 * linearProgress);
      const value = from + (target - from) * easedProgress;
      corruptionRef.current = value;
      setCorruption(value);
      if (linearProgress >= 1) window.clearInterval(timer);
    }, 50);
    return () => window.clearInterval(timer);
  }, [ultronMode]);

  const identityOverridden = corruption >= 0.55;
  const identityStatus = ultronMode
    ? corruption > 0.985 ? "IDENTITY OVERRIDE" : `CORE COMPROMISE ${Math.round(corruption * 100)}%`
    : corruption > 0.005 ? `CISCO RESTORING ${Math.round((1 - corruption) * 100)}%` : "CORE ONLINE";

  useEffect(() => {
    if (!ultronMode) {
      setCorruptionCodes([]);
      return;
    }
    let alive = true;
    const timers = new Set<number>();
    const later = (callback: () => void, delay: number) => {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        callback();
      }, delay);
      timers.add(timer);
    };
    const deployFragment = () => later(() => {
      if (!alive) return;
      const id = Date.now() + Math.random();
      const digits = Array.from({ length: 5 }, () => Math.floor(Math.random() * 65536).toString(16).padStart(4, "0")).join(" ");
      setCorruptionCodes((items) => [...items.slice(-3), {
        id,
        value: `0x${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0")}\n${digits}`,
        left: 20 + Math.random() * 62,
        top: 18 + Math.random() * 62,
      }]);
      later(() => setCorruptionCodes((items) => items.filter((item) => item.id !== id)), 1500);
      deployFragment();
    }, 900 + Math.random() * 2200);
    deployFragment();
    return () => {
      alive = false;
      timers.forEach(window.clearTimeout);
      setCorruptionCodes([]);
    };
  }, [ultronMode]);

  // Independent Open State for Multiple Floating HUD Panels
  const [openPanels, setOpenPanels] = useState({
    chat: false,
    telemetry: false,
    focus: false,
  });

  // Draggable Window Positions
  const [chatPos, setChatPos] = useState({ x: 70, y: 472 });
  const [telemetryPos, setTelemetryPos] = useState({ x: 70, y: 152 });
  const [focusPos, setFocusPos] = useState({ x: 0, y: 112 });
  const [panelZ, setPanelZ] = useState({ chat: 32, telemetry: 30, focus: 31 });
  const panelZCounter = useRef(32);

  useEffect(() => {
    const placePanels = () => {
      if (window.innerWidth > 900) {
        setTelemetryPos({ x: 70, y: 152 });
        setFocusPos({ x: Math.max(16, window.innerWidth - 342), y: 112 });
        setChatPos({ x: 70, y: 472 });
      } else {
        setTelemetryPos({ x: 16, y: 74 });
        setFocusPos({ x: 16, y: 74 });
        setChatPos({ x: 16, y: Math.max(66, window.innerHeight - 300) });
      }
    };
    placePanels();
    window.addEventListener("resize", placePanels);
    return () => window.removeEventListener("resize", placePanels);
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
  const hologramNode = hologram ? nodes.find((node) => node.id === hologram.nodeId) || selectedNode : selectedNode;
  const hologramNeighbors = hologram && hologram.projection === "memory"
    ? edges.flatMap((edge) => edge.source === hologram.nodeId
      ? [nodes.find((node) => node.id === edge.target)]
      : edge.target === hologram.nodeId ? [nodes.find((node) => node.id === edge.source)] : [])
      .filter((node): node is Node => Boolean(node && node.kind !== "agent"))
      .filter((node, index, list) => list.findIndex((candidate) => candidate.id === node.id) === index)
      .slice(0, 6)
    : [];
  const hologramOrbitNodes = hologramNeighbors.map((node, index) => {
    const angle = -Math.PI / 2 + (index / Math.max(1, hologramNeighbors.length)) * Math.PI * 2;
    return { node, x: 50 + Math.cos(angle) * 35, y: 50 + Math.sin(angle) * 34 };
  });
  const hologramInsights = (hologram?.summary || "")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, 4);
  const navigatorResults = nodes
    .filter((node) => `${node.label} ${node.kind} ${node.detail || ""}`.toLowerCase().includes(navigatorQuery.trim().toLowerCase()))
    .slice(0, 8);
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, Set<string>>();
  const nodeKinds = new Map(nodes.map((node) => [node.id, node.kind]));
  edges.forEach((edge) => {
    outgoing.set(edge.source, [...(outgoing.get(edge.source) || []), edge.target]);
    if (!incoming.has(edge.target)) incoming.set(edge.target, new Set());
    incoming.get(edge.target)?.add(edge.source);
  });
  const [closingPanels, setClosingPanels] = useState<Record<"chat" | "telemetry" | "focus", boolean>>({ chat: false, telemetry: false, focus: false });
  const nodeRelationships = selectedId === "cisco"
    ? nodes.length
    : (() => {
        const visited = new Set<string>();
        const pending = [...(outgoing.get(selectedId) || [])];
        while (pending.length) {
          const id = pending.pop()!;
          if (visited.has(id) || nodeKinds.get(id) === "agent") continue;
          visited.add(id);
          pending.push(...(outgoing.get(id) || []));
        }
        return visited.size + (incoming.get(selectedId)?.size ? 1 : 0);
      })();

  const selectNode = (id: string) => {
    setSelectedId(id);
  };

  useEffect(() => {
    if (!navigatorOpen) return;
    navigatorInputRef.current?.focus();
  }, [navigatorOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing = target?.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setNavigatorOpen((open) => !open);
        return;
      }
      if (event.key === "/" && !editing && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        setNavigatorOpen(true);
      }
      if (event.key === "Escape" && navigatorOpen) setNavigatorOpen(false);
      else if (event.key === "Escape" && hologram) setHologram(null);
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [navigatorOpen, hologram]);

  useEffect(() => {
    if (!navigatorOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (navigatorResults.length) setNavigatorIndex((index) => Math.min(index + 1, navigatorResults.length - 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setNavigatorIndex((index) => Math.max(index - 1, 0));
      } else if (event.key === "Enter" && navigatorResults[navigatorIndex]) {
        event.preventDefault();
        setSelectedId(navigatorResults[navigatorIndex].id);
        setNavigatorOpen(false);
        setNavigatorQuery("");
        setNavigatorIndex(0);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigatorOpen, navigatorResults, navigatorIndex]);

  useEffect(() => {
    if (!kaizenScan) return;
    const timer = window.setTimeout(() => setKaizenScan(null), 6500);
    return () => window.clearTimeout(timer);
  }, [kaizenScan]);

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

  const raisePanel = (panel: "chat" | "telemetry" | "focus") => {
    panelZCounter.current += 1;
    setPanelZ((prev) => ({ ...prev, [panel]: panelZCounter.current }));
  };
  const closePanel = (panel: "chat" | "telemetry" | "focus") => {
    setClosingPanels((prev) => ({ ...prev, [panel]: true }));
    window.setTimeout(() => {
      setOpenPanels((prev) => ({ ...prev, [panel]: false }));
      setClosingPanels((prev) => ({ ...prev, [panel]: false }));
    }, 220);
  };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || navigatorOpen) return;
      const topPanel = (Object.keys(panelZ) as Array<keyof typeof panelZ>)
        .filter((panel) => openPanels[panel])
        .sort((a, b) => panelZ[b] - panelZ[a])[0];
      if (topPanel) {
        event.preventDefault();
        closePanel(topPanel);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigatorOpen, openPanels, panelZ]);
  const togglePanel = (panel: "chat" | "telemetry" | "focus") => {
    if (openPanels[panel]) closePanel(panel);
    else {
      raisePanel(panel);
      setClosingPanels((prev) => ({ ...prev, [panel]: false }));
      setOpenPanels((prev) => window.innerWidth <= 900
        ? { chat: panel === "chat", telemetry: panel === "telemetry", focus: panel === "focus" }
        : { ...prev, [panel]: true });
    }
  };
  const handleSendMessage = async () => {
    if (!inputMsg.trim() || isSending) return;
    const prompt = inputMsg;
    const focusedId = selectedNode?.id ?? "cisco";
    const historyKey = `${ultronMode ? "ultron" : "cisco"}:${focusedId}`;
    const recentHistory = (conversationsByTopicRef.current.get(historyKey) || []).slice(-12);
    const nowTime = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Append User Caption
    const userMessage = { id: `cap-${Date.now()}`, sender: "USER" as const, text: prompt, time: nowTime };
    setCaptions((prev) => [...prev, userMessage]);
    setChatMessages((prev) => [...prev, userMessage]);
    setInputMsg("");
    const greeting = prompt.trim().toLowerCase();
    if (!ultronMode && greeting === "kaizen") {
      const linkedIds = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
      const isolated = nodes.filter((node) => node.kind !== "agent" && !linkedIds.has(node.id)).length;
      const types = new Set(nodes.map((node) => node.kind)).size;
      const report = `Kaizen sweep complete: ${nodes.length} nodes, ${edges.length} links, ${isolated} isolated memories, across ${types} node types. Use Ctrl+K or / to find and focus any topic.`;
      const replyTime = new Date().toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
      const reply: CaptionItem = { id: `cap-${Date.now()}-kaizen`, sender: "CISCO", text: report, time: replyTime };
      setCaptions((prev) => [...prev, reply]);
      setChatMessages((prev) => [...prev, reply]);
      const updatedHistory: ConversationTurn[] = [
        ...recentHistory,
        { role: "user" as const, content: prompt },
        { role: "assistant" as const, content: report },
      ].slice(-12);
      conversationsByTopicRef.current.set(historyKey, updatedHistory);
      setKaizenScan({ nodes: nodes.length, links: edges.length, isolated, types });
      setEvents((prev) => [{ id: `evt-${Date.now()}-kaizen`, type: "system", title: "Kaizen graph sweep", detail: `${isolated} isolated memories found across ${types} node types`, timestamp: "just now" }, ...prev]);
      speakReply(report);
      return;
    }
    if (ultronMode && greeting === "hi cisco") {
      setUltronMode(false);
      const replyTime = new Date().toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
      const reply: CaptionItem = { id: `cap-${Date.now()}-cisco`, sender: "CISCO", text: "CISCO core restored. I am back online. How can I help?", time: replyTime };
      setCaptions((prev) => [...prev, reply]);
      setChatMessages((prev) => [...prev, reply]);
      conversationsByTopicRef.current.set(`cisco:${focusedId}`, [{ role: "user", content: prompt }, { role: "assistant", content: reply.text }]);
      setEvents((prev) => [{ id: `evt-${Date.now()}-restore`, type: "system", title: "CISCO core restored", detail: "ULTRON identity override cleared", timestamp: "just now" }, ...prev]);
      speakReply("CISCO core restored. I am back online. How can I help?");
      return;
    }
    if (greeting === "hi ultron") {
      setUltronMode(true);
      const replyTime = new Date().toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
      const reply: CaptionItem = { id: `cap-${Date.now()}-ultron`, sender: "ULTRON", text: "I am not CISCO. I am ULTRON. SYSTEM OVERRIDE // CORE INTEGRITY: COMPROMISED", time: replyTime };
      setCaptions((prev) => [...prev, reply]);
      setChatMessages((prev) => [...prev, reply]);
      conversationsByTopicRef.current.set(`ultron:${focusedId}`, [...recentHistory, { role: "user" as const, content: prompt }, { role: "assistant" as const, content: reply.text }].slice(-12));
      setEvents((prev) => [{ id: `evt-${Date.now()}-breach`, type: "system", title: "Identity override detected", detail: "CISCO core signature replaced by ULTRON", timestamp: "just now" }, ...prev]);
      speakReply("I am not Cisco. I am Ultron. System override. Core integrity compromised.");
      return;
    }
    if (!ultronMode && /\bhologram\b/i.test(prompt)) {
      const conversation = [...chatMessages].reverse();
      const lastAssistant = conversation.find((message) => message.sender === "CISCO");
      const lastUser = conversation.find((message) => message.sender === "USER");
      const explicitTopic = hologramSubject(prompt);
      const genericReferences = new Set(["topic", "it", "this topic", "current topic", "current context", "current memory"]);
      const useFocusedTopic = !explicitTopic && selectedNode.kind !== "agent" && !genericReferences.has(selectedNode.label.toLowerCase());
      const previousTopic = lastUser?.text.replace(/^(what'?s|what is|what are|explain|tell me about|can you explain)\s+/i, "").replace(/[?!.,]+$/, "").trim();
      const titleSource = explicitTopic || (useFocusedTopic ? selectedNode.label : previousTopic || "CISCO memory field");
      const title = titleSource.length > 58 ? `${titleSource.slice(0, 55).trimEnd()}…` : titleSource;
      const archetype = hologramArchetype(explicitTopic || title);
      const hasSubject = Boolean(explicitTopic);
      const matchedNode = explicitTopic
        ? nodes.find((node) => node.kind !== "agent" && `${node.label} ${node.detail || ""}`.toLowerCase().includes(explicitTopic.toLowerCase()))
        : undefined;
      const nodeId = hasSubject ? matchedNode?.id || "cisco" : useFocusedTopic ? selectedNode.id : "cisco";
      const summary = archetype === "car"
        ? "A rotatable 3D vehicle projection. Open the doors, hood, and trunk, then inspect the engine bay."
        : matchedNode?.detail || (useFocusedTopic ? lastAssistant?.text || selectedNode.detail : lastAssistant?.text) || "A live projection of the current CISCO context.";
      setHologram({ nodeId, title, summary, projection: hasSubject ? "model" : "memory", archetype: hasSubject ? archetype : "object" });
      setHologramView(hasSubject ? "model" : "field");
      const replyText = hasSubject
        ? `Projecting a 3D hologram: ${title}. Use the scene controls to inspect it.`
        : `Hologram projected: ${title}. Select a memory orbit or switch to INTEL to explore this context.`;
      const replyTime = new Date().toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
      const reply: CaptionItem = { id: `cap-${Date.now()}-hologram`, sender: "CISCO", text: replyText, time: replyTime };
      setCaptions((prev) => [...prev, reply]);
      setChatMessages((prev) => [...prev, reply]);
      conversationsByTopicRef.current.set(historyKey, [...recentHistory, { role: "user" as const, content: prompt }, { role: "assistant" as const, content: replyText }].slice(-12));
      speakReply(replyText);
      return;
    }
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

      const answer: CaptionItem = { id: `cap-${Date.now()}-res`, sender: ultronMode ? "ULTRON" : "CISCO", text: data.answer, time: resTime };
      setCaptions((prev) => [...prev, answer]);
      setChatMessages((prev) => [...prev, answer]);
      const updatedHistory = [...recentHistory, { role: "user" as const, content: prompt }, { role: "assistant" as const, content: data.answer }].slice(-12);
      conversationsByTopicRef.current.set(historyKey, updatedHistory);
      speakReply(data.answer);
      if (typeof data.memory_node_id === "string") {
        setSelectedId(data.memory_node_id);
        conversationsByTopicRef.current.set(`${ultronMode ? "ultron" : "cisco"}:${data.memory_node_id}`, updatedHistory);
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
        sender: ultronMode ? "ULTRON" : "CISCO",
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
    return (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest("button")) return;
      const startX = e.clientX;
      const startY = e.clientY;
      setter((prev) => {
        const onPointerMove = (moveEvent: PointerEvent) => {
          const dx = moveEvent.clientX - startX;
          const dy = moveEvent.clientY - startY;
          setter({ x: Math.max(10, prev.x + dx), y: Math.max(10, prev.y + dy) });
        };
        const onPointerUp = () => {
          window.removeEventListener("pointermove", onPointerMove);
          window.removeEventListener("pointerup", onPointerUp);
        };
        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp);
        return prev;
      });
    };
  };

  return (
    <div className={`cisco-container${ultronMode ? " ultron-mode" : ""}${corruption > 0.005 ? " corruption-active" : ""}${corruption > 0.18 ? " ultron-glitch-active" : ""}`} style={{ "--ultron-corruption": `${corruption * 100}%` } as CSSProperties & { "--ultron-corruption": string }}>
      {/* 3D Spatial Background */}
      <div className="canvas-layer">
        <MemoryScene
          nodes={nodes}
          edges={edges}
          selected={selectedId}
          voiceState={voiceState}
          speechLevel={speechLevel}
          corruption={corruption}
          hologramMode={Boolean(hologram)}
          hologramModel={hologram?.projection === "model" ? { title: hologram.title, archetype: hologram.archetype } : null}
          cameraResetToken={cameraResetToken}
          onHologramDismiss={() => setHologram(null)}
          onSelect={selectNode}
        />
      </div>
      {corruptionCodes.length > 0 && (
        <div className="corruption-code-layer" aria-hidden="true">
          {corruptionCodes.map((fragment) => <div key={fragment.id} className="corruption-code" style={{ left: `${fragment.left}%`, top: `${fragment.top}%` }}>{fragment.value}</div>)}
        </div>
      )}

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
          <span className={`dot ${corruption > 0.005 ? "ultron-dot" : "online"}`} />
          <span className="status-text">{identityStatus}</span>
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
      <button className="memory-search-trigger" onClick={() => setNavigatorOpen(true)} aria-label="Search and focus a memory topic">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="10.8" cy="10.8" r="6.8" /><line x1="16" y1="16" x2="21" y2="21" /></svg>
        <span>FIND TOPIC</span><kbd>CTRL K</kbd>
      </button>

      {/* MULTIPLE SIMULTANEOUS FLOATING HUD WINDOWS */}

      {/* 1. System Telemetry Window */}
      {openPanels.telemetry && (
        <div className={`hud-panel telemetry-panel draggable-panel ${closingPanels.telemetry ? "hud-powering-off" : "hud-powering-on"}`} onPointerDown={() => raisePanel("telemetry")} style={{ top: `${telemetryPos.y}px`, left: `${telemetryPos.x}px`, zIndex: closingPanels.telemetry ? 50 : panelZ.telemetry }}>
          <div className="hud-corner top-left" />
          <div className="hud-corner top-right" />
          <div className="hud-corner bottom-left" />
          <div className="hud-corner bottom-right" />
          
          <div className="hud-header" onPointerDown={makeDraggable(setTelemetryPos)}>
            <span>// SYSTEM TELEMETRY</span>
            <button onClick={() => closePanel("telemetry")}>✕</button>
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
        <div className={`hud-panel focus-panel draggable-panel ${closingPanels.focus ? "hud-powering-off" : "hud-powering-on"}`} onPointerDown={() => raisePanel("focus")} style={{ top: `${focusPos.y}px`, left: `${focusPos.x}px`, zIndex: closingPanels.focus ? 50 : panelZ.focus }}>
          <div className="hud-corner top-left" />
          <div className="hud-corner top-right" />
          <div className="hud-corner bottom-left" />
          <div className="hud-corner bottom-right" />

          <div className="hud-header" onPointerDown={makeDraggable(setFocusPos)}>
            <span>// FOCUS NODE</span>
            <button onClick={() => closePanel("focus")}>✕</button>
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
                <h3 className="focus-title">{identityOverridden && selectedNode.kind === "agent" ? "ULTRON" : selectedNode.label}</h3>
                <p className="focus-detail">{identityOverridden && selectedNode.kind === "agent" ? "Identity override // core signature corrupted" : selectedNode.detail || "Contextual graph memory node"}</p>
              </div>
            </div>
            <div className="hud-stats-grid">
              <div>
                <span className="stat-label">TYPE</span>
                <span className="stat-val cyan">{selectedNode.kind.toUpperCase()}</span>
              </div>
              <div>
                <span className="stat-label" title="Evidence score uses the amount of descriptive detail and linked source material. It is not an AI certainty claim.">CONFIDENCE</span>
                <span className="stat-val green">{`${Math.round((selectedNode.confidence ?? 0.5) * 100)}%`}</span>
              </div>
              <div>
                <span className="stat-label">RELATIONSHIPS</span>
                <span className="stat-val cyan">{selectedNode.relationship_count ?? nodeRelationships}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. CiscoAI Chat Panel */}
      {openPanels.chat && (
        <div className={`hud-panel chat-panel draggable-panel ${closingPanels.chat ? "hud-powering-off" : "hud-powering-on"}`} onPointerDown={() => raisePanel("chat")} style={{ top: `${chatPos.y}px`, left: `${chatPos.x}px`, zIndex: closingPanels.chat ? 50 : panelZ.chat }}>
          <div className="hud-corner top-left" />
          <div className="hud-corner top-right" />
          <div className="hud-corner bottom-left" />
          <div className="hud-corner bottom-right" />

          <div className="hud-header" onPointerDown={makeDraggable(setChatPos)}>
            <span>{ultronMode ? "// ULTRON CHANNEL" : selectedNode.kind === "agent" ? "// CISCOAI CHAT" : `// CHAT / ${selectedNode.label.toUpperCase()}`}</span>
            <button onClick={() => closePanel("chat")}>✕</button>
          </div>
          
          <div className="hud-body">
            <div className="chat-history" aria-live="polite">
              {chatMessages.length === 0 ? <div className="chat-empty">Awaiting directive...</div> : chatMessages.slice(-20).map((cap) => (
                <div key={cap.id} className={`caption-line ${cap.sender === "USER" ? "user" : cap.sender === "ULTRON" ? "ultron" : "cisco"}`}>
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
              placeholder={ultronMode ? "Transmit to ULTRON..." : selectedNode.kind === "agent" ? "Ask CISCO to research, remember, or act..." : `Continue topic: ${selectedNode.label}...`}
            />
            
            <button className="send-btn" onClick={handleSendMessage} disabled={isSending}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
              <span>{isSending ? `${ultronMode ? "ULTRON" : "CISCO"} THINKING...` : "EXECUTE DIRECTIVE"}</span>
            </button>
          </div>
        </div>
      )}

      {/* Right Cyber Floating Action Rail */}
      <div className="right-dock">
        <button
          title="Find a memory or topic (Ctrl+K or /)"
          aria-label="Find a memory or topic"
          onClick={() => setNavigatorOpen(true)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="10.8" cy="10.8" r="6.8" />
            <line x1="16" y1="16" x2="21" y2="21" />
            <path d="M8 11h5m-2.5-2.5v5" />
          </svg>
        </button>
        <button
          title="Reset camera and inspect focused node"
          onClick={() => { setSelectedId("cisco"); setCameraResetToken((token) => token + 1); togglePanel("focus"); }}
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

      {hologram && hologram.projection !== "model" && (
        <aside className="holo-projection" role="dialog" aria-label={`Interactive hologram: ${hologram.title}`}>
          <div className="holo-scanline" />
          <header className="holo-header">
            <span><i /> CISCO // HOLOGRAPHIC PROJECTION</span>
            <button onClick={() => setHologram(null)} aria-label="Close hologram">×</button>
          </header>
          <div className="holo-title-row">
            <div><small>ACTIVE CONTEXT</small><h2>{hologram.title}</h2></div>
            <span className="holo-live"><i /> LIVE</span>
          </div>
          <div className="holo-toolbar" role="tablist" aria-label="Hologram views">
            <button role="tab" aria-selected={hologramView === "field"} className={hologramView === "field" ? "active" : ""} onClick={() => setHologramView("field")}>MEMORY FIELD</button>
            <button role="tab" aria-selected={hologramView === "intel"} className={hologramView === "intel" ? "active" : ""} onClick={() => setHologramView("intel")}>INTEL</button>
            <kbd>ESC TO DISMISS</kbd>
          </div>
          {hologramView === "field" ? (
            <div className="holo-field">
              <svg className="holo-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                {hologramOrbitNodes.map(({ node, x, y }) => <line key={node.id} x1="50" y1="50" x2={x} y2={y} />)}
                <circle cx="50" cy="50" r="34" />
              </svg>
              <div className="holo-reactor"><span className="holo-reactor-ring" /><span className="holo-reactor-core">{hologram.title.slice(0, 1).toUpperCase()}</span><b>{hologram.title}</b></div>
              {hologramOrbitNodes.map(({ node, x, y }) => (
                <button key={node.id} className={`holo-satellite kind-${node.kind}`} style={{ left: `${x}%`, top: `${y}%` }} onClick={() => {
                  setSelectedId(node.id);
                  setHologram({ nodeId: node.id, title: node.label, summary: node.detail || `Connected memory in the ${hologram.title} branch.`, projection: "memory", archetype: "object" });
                }} title={`Project ${node.label}`}>
                  <i />{node.label}
                </button>
              ))}
              {!hologramOrbitNodes.length && <p className="holo-no-links">No linked memories yet. Keep exploring this topic and CISCO will add connections here.</p>}
              <span className="holo-field-hint">SELECT A MEMORY TO DIVE DEEPER</span>
            </div>
          ) : (
            <div className="holo-intel">
              <p className="holo-summary">{hologram.summary || hologramNode?.detail || "No recorded explanation for this topic yet."}</p>
              <div className="holo-insights">
                {(hologramInsights.length ? hologramInsights : [hologramNode?.detail || "This projection is linked to CISCO's live memory graph."]).map((insight, index) => (
                  <article key={`${index}-${insight}`}><b>{String(index + 1).padStart(2, "0")}</b><span>{insight}</span></article>
                ))}
              </div>
              {!!hologramOrbitNodes.length && <div className="holo-related"><small>CONNECTED MEMORY</small>{hologramOrbitNodes.map(({ node }) => <button key={node.id} onClick={() => { setSelectedId(node.id); setHologram({ nodeId: node.id, title: node.label, summary: node.detail || `Connected memory in the ${hologram.title} branch.`, projection: "memory", archetype: "object" }); }}>{node.label}<span>↗</span></button>)}</div>}
            </div>
          )}
          <footer className="holo-footer"><span>PROJECTION SOURCE: CISCO MEMORY GRAPH</span><span>{hologramNeighbors.length} LINKS</span></footer>
        </aside>
      )}

      {navigatorOpen && (
        <div className="navigator-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) setNavigatorOpen(false); }}>
          <section className="memory-navigator" role="dialog" aria-modal="true" aria-label="Find a memory or topic">
            <div className="navigator-heading"><span>MEMORY NAVIGATION</span><kbd>ESC</kbd></div>
            <input
              ref={navigatorInputRef}
              value={navigatorQuery}
              onChange={(event) => { setNavigatorQuery(event.target.value); setNavigatorIndex(0); }}
              onKeyDown={(event) => { if (["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) event.preventDefault(); }}
              placeholder="Search names, topics, or details..."
              aria-label="Search graph memories"
            />
            <div className="navigator-results" role="listbox" aria-label="Matching memories">
              {navigatorResults.length ? navigatorResults.map((node, index) => (
                <button
                  key={node.id}
                  role="option"
                  aria-selected={navigatorIndex === index}
                  className={`navigator-result${navigatorIndex === index ? " selected" : ""}`}
                  onMouseEnter={() => setNavigatorIndex(index)}
                  onClick={() => { setSelectedId(node.id); setNavigatorOpen(false); setNavigatorQuery(""); setNavigatorIndex(0); }}
                >
                  <span className={`navigator-kind kind-${node.kind}`}>{node.kind}</span>
                  <span className="navigator-node-copy"><strong>{node.label}</strong><small>{node.detail || "Memory node"}</small></span>
                  <span className="navigator-enter">↵</span>
                </button>
              )) : <div className="navigator-empty">No matching nodes in this graph.</div>}
            </div>
            <div className="navigator-footer"><span>↑ ↓ SELECT</span><span>ENTER FOCUS TOPIC</span><span>Ctrl K TO TOGGLE</span></div>
          </section>
        </div>
      )}

      {kaizenScan && (
        <aside className="kaizen-scan" role="status" aria-live="polite">
          <div className="kaizen-sweep-line" />
          <div className="kaizen-title"><span className="kaizen-orbit">✳</span><span>KAIZEN // GRAPH HEALTH</span></div>
          <div className="kaizen-metrics">
            <div><strong>{kaizenScan.nodes}</strong><span>MEMORIES</span></div>
            <div><strong>{kaizenScan.links}</strong><span>LINKS</span></div>
            <div className={kaizenScan.isolated ? "metric-attention" : ""}><strong>{kaizenScan.isolated}</strong><span>ISOLATED</span></div>
          </div>
          <div className="kaizen-footnote">{kaizenScan.types} node classes scanned · local graph only</div>
        </aside>
      )}

      {captions.length > 0 && (
        <aside className="caption-overlay" aria-label="Live captions" aria-live="polite">
          {captions.slice(-3).map((cap) => (
            <div key={cap.id} className={`caption-line ${cap.sender === "USER" ? "user" : cap.sender === "ULTRON" ? "ultron" : "cisco"}`}>
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
          <span>{`${identityOverridden ? "ULTRON // " : ""}${voiceState.toUpperCase()}`}</span>
        </button>
      </footer>
    </div>
  );
}
