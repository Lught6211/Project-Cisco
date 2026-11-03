"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import dynamic from "next/dynamic";
import "./scene.css";
import "./hud.css";
import { HomelabConsole, useHomelab } from "./homelab";
import Reactor from "./hud/Reactor";
import TopBar from "./hud/TopBar";
import VoiceStrip from "./hud/VoiceStrip";
import ResearchCard from "./hud/ResearchCard";
import BlockStage from "./hud/BlockStage";
import HistoryPanel from "./hud/HistoryPanel";
import { HudContext } from "./hud/context";
import { useVoiceInput } from "./hud/useVoiceInput";
import { useMedia } from "./hud/useMedia";
import { useResearch } from "./hud/useResearch";
import { addHistory, loadHistory, storeHistory } from "./hud/history";
import { dockRect, fitRows, placeBlock, ROWS, tidyBlocks } from "./hud/grid";
import { isDemoIntent, isResearchIntent, topicFromPrompt, uiCommand } from "./hud/intents";
import type { UiCommand } from "./hud/intents";
import type { BlockContent, HistoryEntry, HudBlock, VoiceState } from "./hud/types";

const MemoryScene = dynamic(() => import("./MemoryScene2D"), { ssr: false });

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "https://cisco-backend-yve2.onrender.com").replace(/\/+$/, "");

type Node = { id: string; label: string; kind: string; x: number; y: number; confidence?: number; relationship_count?: number; detail?: string; active?: boolean };
type Edge = { source: string; target: string; label: string };
type EventItem = { id: string; type: string; title: string; detail: string; timestamp: string };
type CaptionItem = { id: string; sender: "USER" | "CISCO" | "ULTRON"; text: string; time: string };
type ConversationTurn = { role: "user" | "assistant"; content: string };
type CorruptionCode = { id: number; value: string; left: number; top: number };
type HologramSession = { nodeId: string; title: string; summary: string; projection: "model" | "memory"; archetype: string };
type NodeFilter = "all" | "memory" | "people" | "places" | "tasks" | "operations";

const NODE_FILTERS: Array<{ id: NodeFilter; label: string; kinds: string[] }> = [
  { id: "all", label: "ALL SIGNALS", kinds: [] },
  { id: "memory", label: "MEMORY", kinds: ["memory"] },
  { id: "people", label: "PEOPLE", kinds: ["person"] },
  { id: "places", label: "PLACES", kinds: ["place"] },
  { id: "tasks", label: "TASKS", kinds: ["task"] },
  { id: "operations", label: "OPERATIONS", kinds: ["server", "service", "site", "download"] },
];

function UtcClock() {
  const [time, setTime] = useState("--:--:--");
  useEffect(() => {
    const update = () => setTime(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "UTC" }).format(new Date()));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <span className="status-time">{time} UTC</span>;
}

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
  const homelab = useHomelab();
  const [serverPanelOpen, setServerPanelOpen] = useState(false);
  const [backendStatus, setBackendStatus] = useState<"checking" | "online" | "offline">("checking");
  const [nodeFilter, setNodeFilter] = useState<NodeFilter>("all");
  const [performanceMode, setPerformanceMode] = useState(false);
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

  // ---- HUD "briefing wall" state
  const [memoryMode, setMemoryMode] = useState(false);
  const [booted, setBooted] = useState(false);
  const [chipsOn, setChipsOn] = useState(false);
  const [stripOn, setStripOn] = useState(false);
  const [hudBlocks, setHudBlocks] = useState<HudBlock[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [heard, setHeard] = useState("");
  const [replyLine, setReplyLine] = useState("");
  const colsRef = useRef(12);
  const cardActiveRef = useRef(false);
  const sendRef = useRef<(text: string) => void>(() => undefined);
  const handleMetrics = useCallback((cols: number) => { colsRef.current = cols; }, []);

  const mic = useVoiceInput({
    onUtterance: (text) => { setHeard(text); sendRef.current(text); },
    paused: voiceState === "thinking" || voiceState === "speaking" || isSending,
  });
  const media = useMedia();
  const displayVoice: VoiceState = voiceState !== "idle" ? voiceState : mic.enabled ? "listening" : "idle";

  const reservedRects = () => [...dockRect(colsRef.current), ...(cardActiveRef.current && colsRef.current >= 8 ? [{ x: 0, y: Math.max(0, Math.floor(ROWS / 2) - 1), w: 3, h: 2 }] : [])];
  const keepLive = (list: HudBlock[]) => list.filter((block) => block.kind === "camera" || block.kind === "screen");
  const syncLive = (previous: HudBlock[], kind: "camera" | "screen", on: boolean): HudBlock[] => {
    const id = `live-${kind}`;
    const exists = previous.some((block) => block.id === id);
    if (!on) return exists ? previous.filter((block) => block.id !== id) : previous;
    if (exists) return previous;
    return [...previous, placeBlock(previous, { id, kind, kicker: kind === "camera" ? "LIVE // CAMERA" : "LIVE // SCREEN", title: kind === "camera" ? "CAMERA FEED" : "SCREEN SHARE" }, colsRef.current, reservedRects())];
  };
  useEffect(() => { setHudBlocks((previous) => syncLive(previous, "camera", Boolean(media.camera))); }, [media.camera]);
  useEffect(() => { setHudBlocks((previous) => syncLive(previous, "screen", Boolean(media.screen))); }, [media.screen]);
  const ensureServerBlock = () => setHudBlocks((previous) => previous.some((block) => block.id === "live-server") ? previous : [...previous, placeBlock(previous, { id: "live-server", kind: "server", kicker: "SERVER // HOMELAB", title: homelab.snapshot?.server.label ?? "HOMELAB SERVER" }, colsRef.current, reservedRects())]);

  const postReply = (text: string, sender: "CISCO" | "ULTRON" = "CISCO") => {
    const time = new Date().toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const reply: CaptionItem = { id: `cap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, sender, text, time };
    setCaptions((previous) => [...previous, reply]);
    setChatMessages((previous) => [...previous, reply]);
  };
  const refreshGraph = () => {
    void fetch(`${API_URL}/api/graph`).then(async (graphRes) => {
      if (!graphRes.ok) return;
      const graph = await graphRes.json();
      if (graph?.nodes) setNodes(graph.nodes);
      if (graph?.edges) setEdges(graph.edges);
    }).catch((error) => console.warn("Graph refresh failed", error));
  };

  const research = useResearch({
    apiUrl: API_URL,
    onBlocks: (fresh: BlockContent[]) => setHudBlocks((previous) => fresh.reduce((list, content) => [...list, placeBlock(list, content, colsRef.current, reservedRects())], previous)),
    onDone: (result) => {
      // Settle the wall once the research card is gone: re-pack so the space it held is used.
      setHudBlocks((previous) => fitRows(tidyBlocks(previous, colsRef.current, dockRect(colsRef.current)), colsRef.current, dockRect(colsRef.current)));
      setHistory((previous) => { const next = addHistory(previous, result.title, result.blocks, result.sources); storeHistory(next); return next; });
      const text = result.summary || `Research on ${result.title.toLowerCase()} is complete.`;
      postReply(text);
      setEvents((previous) => [{ id: `evt-${Date.now()}-research`, type: "memory", title: `Research report: ${result.title}`, detail: `${result.blocks.length} blocks from ${result.sources} sources`, timestamp: "just now" }, ...previous]);
      setIsSending(false);
      speakReply(text);
      if (result.memoryNodeId) { setSelectedId(result.memoryNodeId); refreshGraph(); }
    },
    onFail: (message) => {
      postReply(`I couldn't finish that research: ${message}`);
      setIsSending(false);
      setVoiceState("idle");
    },
  });
  cardActiveRef.current = research.card?.status === "running";

  const clearView = () => {
    if (research.card?.status === "running") { setIsSending(false); setVoiceState("idle"); }
    research.cancel();
    setHudBlocks([]);
    media.stopCamera();
    media.stopScreen();
  };
  const tidyView = () => setHudBlocks((previous) => fitRows(tidyBlocks(previous, colsRef.current, dockRect(colsRef.current)), colsRef.current, dockRect(colsRef.current)));
  const toggleCamera = (want?: boolean) => { if (want === undefined ? media.camera : !want) media.stopCamera(); else void media.startCamera(); };
  const toggleScreen = (want?: boolean) => { if (want === undefined ? media.screen : !want) media.stopScreen(); else void media.startScreen(); };
  const closeBlock = (id: string) => {
    if (id === "live-camera") media.stopCamera();
    else if (id === "live-screen") media.stopScreen();
    else setHudBlocks((previous) => previous.filter((block) => block.id !== id));
  };
  const openHistoryEntry = (entry: HistoryEntry) => {
    research.cancel();
    setHudBlocks((previous) => fitRows(entry.blocks.reduce((list, content) => [...list, placeBlock(list, content, colsRef.current, dockRect(colsRef.current))], keepLive(previous)), colsRef.current, dockRect(colsRef.current)));
    setHistoryOpen(false);
  };
  const runUiCommand = (command: UiCommand): string => {
    switch (command) {
      case "clear": clearView(); return "Screen cleared.";
      case "tidy": tidyView(); return "Tiles rearranged.";
      case "camera-on": toggleCamera(true); return "Opening the camera.";
      case "camera-off": toggleCamera(false); return "Camera closed.";
      case "screen-on": toggleScreen(true); return "Choose a screen to share.";
      case "screen-off": toggleScreen(false); return "Screen sharing stopped.";
      case "memory": setMemoryMode(true); return "Opening the memory field.";
      case "history": setHistoryOpen(true); return "Here is your research history.";
      case "log": togglePanel("chat"); return "Opening the conversation log.";
    }
  };
  const submitDraft = () => { const text = draft; setDraft(""); setTyping(false); void handleSendMessage(text); };

  // Boot: gyroscope spins, chips and strip fade in mid-way, then the rings snap flat into the reactor logo.
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const timers = [
      window.setTimeout(() => setChipsOn(true), reduce ? 150 : 1500),
      window.setTimeout(() => setStripOn(true), reduce ? 250 : 2300),
      window.setTimeout(() => setBooted(true), reduce ? 400 : 3500),
    ];
    setHistory(loadHistory());
    return () => timers.forEach(window.clearTimeout);
  }, []);
  useEffect(() => {
    if (booted && new URLSearchParams(window.location.search).has("demo")) research.startDemo();
  }, [booted]);
  useEffect(() => {
    const last = chatMessages[chatMessages.length - 1];
    if (last && last.sender !== "USER") setReplyLine(last.text);
  }, [chatMessages]);
  useEffect(() => {
    if (!heard) return;
    const timer = window.setTimeout(() => setHeard(""), 9000);
    return () => window.clearTimeout(timer);
  }, [heard]);

  useEffect(() => {
    try { setPerformanceMode(localStorage.getItem("cisco.performance-mode") === "eco"); } catch { setPerformanceMode(false); }
  }, []);

  const togglePerformanceMode = () => {
    const next = !performanceMode;
    setPerformanceMode(next);
    try { localStorage.setItem("cisco.performance-mode", next ? "eco" : "cinematic"); } catch { /* Keep the current page setting if storage is unavailable. */ }
  };

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
    let disposed = false;
    let pending = false;
    let activeController: AbortController | null = null;
    const fetchData = async () => {
      if (disposed || pending || document.visibilityState === "hidden") return;
      pending = true;
      const controller = new AbortController();
      activeController = controller;
      const timeout = window.setTimeout(() => controller.abort(), 12000);
      try {
        const [healthRes, graphRes, eventsRes] = await Promise.all([
          fetch(`${API_URL}/health`, { signal: controller.signal }),
          fetch(`${API_URL}/api/graph`, { signal: controller.signal }).then((r) => (r.ok ? r.json() : null)),
          fetch(`${API_URL}/api/events`, { signal: controller.signal }).then((r) => (r.ok ? r.json() : null)),
        ]);
        if (disposed) return;
        setBackendStatus(healthRes.ok ? "online" : "offline");
        if (graphRes?.nodes) setNodes(graphRes.nodes);
        if (graphRes?.edges) setEdges(graphRes.edges);
        if (Array.isArray(eventsRes)) setEvents(eventsRes);
      } catch (error) {
        if (!disposed && !controller.signal.aborted) console.warn("Backend sync...", error);
        if (!disposed) setBackendStatus("offline");
      } finally {
        window.clearTimeout(timeout);
        pending = false;
        if (activeController === controller) activeController = null;
      }
    };
    const refreshOnReturn = () => { if (document.visibilityState === "visible") void fetchData(); };
    void fetchData();
    const interval = window.setInterval(() => { void fetchData(); }, 15000);
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => {
      disposed = true;
      activeController?.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshOnReturn);
    };
  }, []);

  const operationalNodes = useMemo<Node[]>(() => {
    if (homelab.linkState === "unconfigured" || homelab.linkState === "loading") return [];
    const snapshot = homelab.snapshot;
    const linkNode: Node = {
      id: "cisco-homelab-server",
      x: 0,
      y: 0,
      label: snapshot?.server.label ?? "Homelab server",
      kind: "server",
      detail: homelab.linkState === "online" ? "Private server link is online" : "Server or private Tailscale link is offline",
      active: homelab.linkState === "online",
    };
    const serviceNodes = (snapshot?.services ?? []).map((service): Node => ({
      id: `cisco-service-${service.id}`,
      x: 0,
      y: 0,
      label: service.label,
      kind: "service",
      detail: `${service.state.toUpperCase()} · ${service.status}${service.controls_allowed ? " · controls enabled" : " · monitoring only"}`,
      active: service.state === "running",
    }));
    const siteNodes = (snapshot?.sites ?? []).map((site): Node => ({
      id: `cisco-site-${site.id}`,
      x: 0,
      y: 0,
      label: site.name,
      kind: "site",
      detail: `${site.status.toUpperCase()} · ${site.http_status ? `HTTP ${site.http_status}` : "no response"}`,
      active: site.status === "online",
    }));
    const downloadNodes = (snapshot?.downloads.items ?? []).slice(0, 12).map((download): Node => ({
      id: `cisco-download-${download.hash}`,
      x: 0,
      y: 0,
      label: download.name,
      kind: "download",
      detail: `${download.progress}% · ${download.state}`,
      active: !download.paused,
    }));
    return [linkNode, ...serviceNodes, ...siteNodes, ...downloadNodes];
  }, [homelab.linkState, homelab.snapshot]);
  const operationalEdges = useMemo<Edge[]>(() => operationalNodes.map((node) => ({
    source: node.kind === "server" ? "cisco" : "cisco-homelab-server",
    target: node.id,
    label: node.kind,
  })), [operationalNodes]);
  const sceneNodes = useMemo(() => [...nodes, ...operationalNodes], [nodes, operationalNodes]);
  const sceneEdges = useMemo(() => [...edges, ...operationalEdges], [edges, operationalEdges]);
  const activeFilter = NODE_FILTERS.find((filter) => filter.id === nodeFilter) ?? NODE_FILTERS[0];
  const displayedNodes = useMemo(() => sceneNodes.filter((node) => node.kind === "agent" || nodeFilter === "all" || activeFilter.kinds.includes(node.kind)), [sceneNodes, nodeFilter, activeFilter]);
  const displayedNodeIds = useMemo(() => new Set(displayedNodes.map((node) => node.id)), [displayedNodes]);
  const displayedEdges = useMemo(() => sceneEdges.filter((edge) => displayedNodeIds.has(edge.source) && displayedNodeIds.has(edge.target)), [sceneEdges, displayedNodeIds]);
  const filterCounts = useMemo(() => {
    const counts: Record<NodeFilter, number> = { all: 0, memory: 0, people: 0, places: 0, tasks: 0, operations: 0 };
    for (const node of sceneNodes) {
      if (node.kind === "agent") continue;
      counts.all += 1;
      if (node.kind === "memory") counts.memory += 1;
      else if (node.kind === "person") counts.people += 1;
      else if (node.kind === "place") counts.places += 1;
      else if (node.kind === "task") counts.tasks += 1;
      else if (["server", "service", "site", "download"].includes(node.kind)) counts.operations += 1;
    }
    return counts;
  }, [sceneNodes]);
  const selectedNode = sceneNodes.find((n) => n.id === selectedId) || sceneNodes[0];
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
  const nodeKinds = new Map(sceneNodes.map((node) => [node.id, node.kind]));
  sceneEdges.forEach((edge) => {
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
        if (memoryMode) setNavigatorOpen(true); else setTyping(true);
      }
      if (event.key === "Escape" && navigatorOpen) setNavigatorOpen(false);
      else if (event.key === "Escape" && hologram) setHologram(null);
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [navigatorOpen, hologram, memoryMode]);

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
        setMemoryMode(true);
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

  const toggleMic = () => { mic.toggle(); };

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
    const finishSpeaking = () => {
      setVoiceState("idle");
    };
    utterance.volume = 1;
    utterance.onstart = () => setVoiceState("speaking");
    utterance.onend = finishSpeaking;
    utterance.onerror = finishSpeaking;
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
  const handleSendMessage = async (override?: string) => {
    const source = typeof override === "string" ? override : inputMsg;
    if (!source.trim() || isSending) return;
    const prompt = source;
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
    const command = uiCommand(prompt);
    if (command) {
      const text = runUiCommand(command);
      postReply(text, ultronMode ? "ULTRON" : "CISCO");
      return;
    }
    if (isDemoIntent(prompt)) {
      setIsSending(true);
      setVoiceState("thinking");
      setHudBlocks(keepLive);
      research.startDemo();
      return;
    }
    if (!ultronMode && isResearchIntent(prompt)) {
      setIsSending(true);
      setVoiceState("thinking");
      setMemoryMode(false);
      setHudBlocks(keepLive);
      conversationsByTopicRef.current.set(historyKey, [...recentHistory, { role: "user" as const, content: prompt }].slice(-12));
      void research.start(topicFromPrompt(prompt));
      return;
    }
    if (!ultronMode && /\bhologram\b/i.test(prompt)) {
      setMemoryMode(true);
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
    const agentUpdateIntent = !ultronMode
      && (/\b(cisco|agent|homelab|server)\b/i.test(prompt) && /\b(update|updates|deploy|deployment|upgrade|release|version|latest)\b/i.test(prompt)
        || /\b(check|look for|find)\b.*\bupdates?\b/i.test(prompt));
    const homelabIntent = agentUpdateIntent || (!ultronMode
      && /\b(server|homelab|jellyfin|caddy|qbittorrent|qbit|downloads?|downloading|websites?|sites?|containers?)\b/i.test(prompt)
      && /\b(check|status|health|online|offline|down|up|restart|reboot|start|stop|pause|resume|progress|speed|cpu|memory|disk|download|website|site|service|container|what|how|is|are|running|reachable|working|show|list)\b/i.test(prompt));
    if (homelabIntent) {
      setIsSending(true);
      setVoiceState("thinking");
      try {
        let report = "";
        const requestedServiceAction = prompt.match(/\b(start|stop|restart|reboot)\b/i)?.[1]?.toLowerCase();
        const serviceAction = requestedServiceAction === "reboot" ? "restart" : requestedServiceAction as "start" | "stop" | "restart" | undefined;
        const downloadAction = prompt.match(/\b(pause|resume)\b/i)?.[1]?.toLowerCase() as "pause" | "resume" | undefined;

        if (agentUpdateIntent) {
          const update = await homelab.checkDeploy(true);
          const isChecking = /\b(check|status|available|any|whether|is there|are there|latest version)\b/i.test(prompt);
          const wantsDeploy = /\b(deploy|install|apply)\b/i.test(prompt) || (!isChecking && /\b(update|upgrade)\b/i.test(prompt));
          if (!wantsDeploy) {
            report = update.update_available
              ? `A CISCO server agent update is available (${update.current_sha.slice(0, 7)} → ${update.latest_sha.slice(0, 7)}). Say “deploy the CISCO agent update” and I will ask before starting it.`
              : `The CISCO server agent is current at ${update.current_sha.slice(0, 7)}.`;
            if (update.blocked_reason) report += ` Deployment is blocked: ${update.blocked_reason}`;
          } else if (!update.update_available) {
            report = "The CISCO server agent is already on the latest approved main commit.";
          } else if (!update.deploy_allowed) {
            report = "I found an update, but deployment is blocked: " + (update.blocked_reason || "the server checkout is not safe to update.");
          } else if (window.confirm(`Deploy CISCO server agent update ${update.latest_sha.slice(0, 7)}? Monitoring may briefly reconnect. This updates only the CISCO agent and Docker guard.`)) {
            await homelab.deployAgent();
            report = `Deployment of CISCO server agent update ${update.latest_sha.slice(0, 7)} has started. The server panel will show progress and reconnect when the agent restarts.`;
          } else {
            report = "Deployment cancelled. The server was left unchanged.";
          }
        } else if (serviceAction) {
          const snapshot = await homelab.refresh();
          const service = snapshot?.services.find((item) =>
            item.controls_allowed && prompt.toLowerCase().includes(item.label.toLowerCase())
          );
          if (!service?.managed_id) {
            const allowed = snapshot?.services.filter((item) => item.controls_allowed).map((item) => item.label).join(", ");
            report = allowed
              ? "I can start, stop, or restart these configured containers: " + allowed + ". Say which one you want. I won't reboot the whole host from chat."
              : "No container controls are configured on this server yet.";
          } else if (window.confirm((serviceAction === "restart" ? "Restart " : serviceAction === "stop" ? "Stop " : "Start ") + service.label + "?")) {
            await homelab.controlService(service.managed_id, serviceAction);
            report = service.label + " has been " + (serviceAction === "restart" ? "restarted" : serviceAction === "stop" ? "stopped" : "started") + " through the approved server control. The host itself was not rebooted.";
          } else {
            report = serviceAction[0].toUpperCase() + serviceAction.slice(1) + " cancelled. " + service.label + " was left unchanged.";
          }
        } else if (downloadAction) {
          const snapshot = await homelab.refresh();
          const downloads = snapshot?.downloads.items ?? [];
          const named = downloads.filter((item) => prompt.toLowerCase().includes(item.name.toLowerCase()));
          const candidates = named.length ? named : downloads.filter((item) => downloadAction === "pause" ? !item.paused : item.paused);
          if (candidates.length !== 1 || !candidates[0]) {
            report = candidates.length
              ? "I found " + candidates.length + " matching downloads. Open the Homelab panel and choose the exact item there."
              : "I couldn't find a matching download in qBittorrent. Check the Homelab panel to see whether it is connected.";
          } else {
            await homelab.controlDownload(candidates[0].hash, downloadAction);
            report = (downloadAction === "pause" ? "Paused " : "Resumed ") + candidates[0].name + ".";
          }
        } else {
          const snapshot = await homelab.refresh();
          if (!snapshot) throw new Error("No server status was returned.");
          ensureServerBlock();
          const running = snapshot.services.filter((item) => item.state === "running").length;
          const siteSummary = snapshot.sites.length
            ? snapshot.sites.map((site) => site.name + ": " + site.status).join("; ")
            : "No websites configured for monitoring";
          const activeDownloads = snapshot.downloads.items.filter((item) => !item.paused).length;
          report = snapshot.server.label + " is reachable. CPU " + snapshot.server.cpu_percent + "%, memory " + snapshot.server.memory.percent + "%, filesystem " + snapshot.server.filesystem.percent + "%, uptime " + Math.floor(snapshot.server.uptime_seconds / 3600) + " hours. " + running + " of " + snapshot.services.length + " containers are running. " + siteSummary + ". " + (snapshot.downloads.configured ? activeDownloads + " active downloads." : "qBittorrent is not connected.");
        }

        const replyTime = new Date().toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
        const reply: CaptionItem = { id: "cap-" + Date.now() + "-server", sender: "CISCO", text: report, time: replyTime };
        setCaptions((previous) => [...previous, reply]);
        setChatMessages((previous) => [...previous, reply]);
        conversationsByTopicRef.current.set(historyKey, [...recentHistory, { role: "user" as const, content: prompt }, { role: "assistant" as const, content: report }].slice(-12));
        setEvents((previous) => [{ id: "evt-" + Date.now() + "-server", type: "system", title: agentUpdateIntent ? "CISCO agent update checked" : serviceAction ? "Approved container " + serviceAction : downloadAction ? "Download " + downloadAction : "Homelab status refreshed", detail: report, timestamp: "just now" }, ...previous]);
        speakReply(report);
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : "Private server link is not available.";
        const replyTime = new Date().toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
        const reply: CaptionItem = { id: "cap-" + Date.now() + "-server-error", sender: "CISCO", text: "I couldn't reach the homelab: " + detail + " Open the Homelab panel to connect over Tailscale.", time: replyTime };
        setCaptions((previous) => [...previous, reply]);
        setChatMessages((previous) => [...previous, reply]);
        setVoiceState("idle");
      } finally {
        setIsSending(false);
      }
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

  sendRef.current = (text: string) => { void handleSendMessage(text); };

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

  const hint = mic.error
    || (!mic.enabled ? "Click MIC to talk, or press / to type"
      : !mic.recognitionSupported ? "Voice commands need Chrome or Edge. Press / to type"
        : mic.awake ? "Listening..." : "Say \"Hey Cisco...\"");
  const hudContext = useMemo(() => ({
    streams: { camera: media.camera, screen: media.screen },
    homelab: homelab.snapshot,
    homelabState: homelab.linkState,
  }), [media.camera, media.screen, homelab.snapshot, homelab.linkState]);

  return (
    <div className={`cisco-container${memoryMode ? "" : " hud-mode"}${ultronMode ? " ultron-mode" : ""}${corruption > 0.005 ? " corruption-active" : ""}${corruption > 0.18 ? " ultron-glitch-active" : ""}${performanceMode ? " performance-mode" : ""}`} style={{ "--ultron-corruption": `${corruption * 100}%` } as CSSProperties & { "--ultron-corruption": string }}>
      {/* Interactive 2D memory field (MEMORY mode), with a 3D Canvas reserved for holograms. */}
      {memoryMode ? (
        <div className="canvas-layer">
          <MemoryScene
            nodes={displayedNodes}
            edges={displayedEdges}
            selected={selectedId}
            coreName={identityOverridden ? "ULTRON" : "CISCO"}
            hologramModel={hologram?.projection === "model" ? { title: hologram.title, archetype: hologram.archetype } : null}
            cameraResetToken={cameraResetToken}
            performanceMode={performanceMode}
            onHologramDismiss={() => setHologram(null)}
            onSelect={selectNode}
          />
        </div>
      ) : <div className="hx-backdrop" aria-hidden="true" />}
      {corruptionCodes.length > 0 && (
        <div className="corruption-code-layer" aria-hidden="true">
          {corruptionCodes.map((fragment) => <div key={fragment.id} className="corruption-code" style={{ left: `${fragment.left}%`, top: `${fragment.top}%` }}>{fragment.value}</div>)}
        </div>
      )}

      {memoryMode && (<>
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
          <span className={`dot ${corruption > 0.005 ? "ultron-dot" : backendStatus === "online" ? "online" : backendStatus === "offline" ? "offline" : "cyan"}`} />
          <span className="status-text">{corruption > 0.005 ? identityStatus : backendStatus === "online" ? "CORE ONLINE" : backendStatus === "offline" ? "AI LINK OFFLINE" : "SYNCING CORE"}</span>
          <span className="status-divider">|</span>
          <UtcClock />
        </div>

        <div className="header-right">
          <div className="icon-badge">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <polyline points="9 12 11 14 15 10" />
            </svg>
          </div>
          <button className={`motion-switch${performanceMode ? " eco" : ""}`} onClick={togglePerformanceMode} aria-pressed={performanceMode} title={performanceMode ? "Turn on cinematic motion" : "Reduce motion for better performance"}>
            <span className="motion-switch-light" />{performanceMode ? "ECO MODE" : "MOTION ON"}
          </button>
        </div>
      </header>

      {/* Subheader Overlay */}
      <div className="subheader-overlay">
        <div className="eyebrow"><span className="eyebrow-spark">✳</span> CISCO OPERATIONS FIELD</div>
        <h2 className="section-title">Memory field <span>/ 2D</span></h2>
        <div className="field-readouts">
          <span><i className={`field-status-dot ${backendStatus}`} />{backendStatus === "online" ? "AI LINK LIVE" : backendStatus === "offline" ? "AI LINK OFFLINE" : "SYNCING"}</span>
          <b>{Math.max(0, sceneNodes.length - 1)}<small> NODES</small></b>
          <b>{sceneEdges.length}<small> LINKS</small></b>
        </div>
      </div>

      <div className="orbital-badge"><i /> POINT LATTICE <span>LIVE</span></div>
      <button className="memory-search-trigger" onClick={() => setNavigatorOpen(true)} aria-label="Search and focus a memory topic">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="10.8" cy="10.8" r="6.8" /><line x1="16" y1="16" x2="21" y2="21" /></svg>
        <span>FIND TOPIC</span><kbd>CTRL K</kbd>
      </button>
      <div className="graph-filter-strip" role="toolbar" aria-label="Filter memory field">
        <span className="graph-filter-caption">FIELD FILTER</span>
        <div className="graph-filter-list">
          {NODE_FILTERS.map((filter) => (
            <button key={filter.id} className={`graph-filter-chip filter-${filter.id}${nodeFilter === filter.id ? " selected" : ""}`} onClick={() => setNodeFilter(filter.id)} aria-pressed={nodeFilter === filter.id}>
              <i />{filter.label}<b>{filterCounts[filter.id]}</b>
            </button>
          ))}
        </div>
      </div>
      </>)}

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
            
            <button className="send-btn" onClick={() => void handleSendMessage()} disabled={isSending}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
              <span>{isSending ? `${ultronMode ? "ULTRON" : "CISCO"} THINKING...` : "EXECUTE DIRECTIVE"}</span>
            </button>
          </div>
        </div>
      )}

      {memoryMode && (<>
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
          title={homelab.linkState === "online" ? "Homelab server connected" : homelab.linkState === "offline" ? "Homelab server offline" : "Connect CISCO to your homelab"}
          aria-label="Open homelab server controls"
          onClick={() => setServerPanelOpen((open) => !open)}
          className={"server-dock-button" + (homelab.linkState === "online" ? " linked" : homelab.linkState === "offline" ? " disconnected" : "") + (serverPanelOpen ? " active" : "")}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="3" y="4" width="18" height="6" rx="1.5" />
            <rect x="3" y="14" width="18" height="6" rx="1.5" />
            <path d="M7 7h.01M7 17h.01M11 7h6M11 17h6" />
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
      </>)}

      <HomelabConsole open={serverPanelOpen} onClose={() => setServerPanelOpen(false)} controller={homelab} />

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
                  onClick={() => { setSelectedId(node.id); setMemoryMode(true); setNavigatorOpen(false); setNavigatorQuery(""); setNavigatorIndex(0); }}
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

      {memoryMode ? (<>
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
        <div className="hint">DRAG TO PAN ↗ SCROLL TO ZOOM · DRAG NODES TO ARRANGE</div>
        <button className={`voice-pill voice-${displayVoice}`} onClick={toggleMic}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
          </svg>
          <span className="voice-spectrum" aria-hidden="true"><i /><i /><i /><i /><i /></span>
          <span>{`${identityOverridden ? "ULTRON // " : ""}${displayVoice.toUpperCase()}`}</span>
        </button>
      </footer>
        <button className="hx-chip hx-back" onClick={() => setMemoryMode(false)}>◂ BACK TO HUD</button>
      </>) : (
        <HudContext.Provider value={hudContext}>
          <BlockStage blocks={hudBlocks} onChange={setHudBlocks} onClose={closeBlock} onMetrics={handleMetrics} />
          <Reactor
            phase={!booted || (displayVoice === "thinking" && hudBlocks.length === 0) ? "gyro" : "logo"}
            voice={displayVoice}
            docked={booted && hudBlocks.length > 0}
            name={identityOverridden ? "ULTRON" : "CISCO"}
            ultron={identityOverridden}
            onActivate={toggleMic}
          />
          {research.card && <ResearchCard card={research.card} />}
          <TopBar
            visible={chipsOn}
            cameraOn={Boolean(media.camera)}
            screenOn={Boolean(media.screen)}
            historyOpen={historyOpen}
            logOpen={openPanels.chat}
            serverState={homelab.linkState}
            devices={media.devices}
            deviceId={media.deviceId}
            onHistory={() => setHistoryOpen((open) => !open)}
            onTidy={tidyView}
            onClear={clearView}
            onCamera={() => toggleCamera()}
            onDevice={media.chooseDevice}
            onScreen={() => toggleScreen()}
            onMemory={() => setMemoryMode(true)}
            onServer={() => { setServerPanelOpen((open) => !open); if (homelab.linkState === "online") ensureServerBlock(); }}
            onLog={() => togglePanel("chat")}
          />
          {historyOpen && <HistoryPanel entries={history} onOpen={openHistoryEntry} onClose={() => setHistoryOpen(false)} onDelete={(id) => setHistory((previous) => { const next = previous.filter((entry) => entry.id !== id); storeHistory(next); return next; })} />}
          <VoiceStrip
            visible={stripOn}
            micOn={mic.enabled}
            awake={mic.awake}
            meter={mic.meter}
            transcript={mic.interim || heard}
            reply={replyLine}
            hint={hint}
            typing={typing}
            draft={draft}
            busy={isSending}
            onToggleMic={toggleMic}
            onStartTyping={() => setTyping(true)}
            onStopTyping={() => { setTyping(false); setDraft(""); }}
            onDraft={setDraft}
            onSubmit={submitDraft}
          />
        </HudContext.Provider>
      )}
    </div>
  );
}
