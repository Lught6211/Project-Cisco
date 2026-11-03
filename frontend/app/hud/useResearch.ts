"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toBlockContent } from "./types";
import type { BlockContent, ResearchCardState, ResearchJobPayload } from "./types";
import { demoReport } from "./demo";

const POLL_MS = 700;
const MAX_WAIT_MS = 150000;

type Handlers = {
  apiUrl: string;
  /** Called once for each new block as it arrives, so the wall fills in one tile at a time. */
  onBlocks: (blocks: BlockContent[]) => void;
  onDone: (result: { title: string; summary: string; blocks: BlockContent[]; sources: number; memoryNodeId: string }) => void;
  onFail: (message: string) => void;
};

/** Starts a research job on the backend (or the built-in demo) and reports progress for the research card. */
export function useResearch({ apiUrl, onBlocks, onDone, onFail }: Handlers) {
  const [card, setCard] = useState<ResearchCardState | null>(null);
  const timerRef = useRef<number | null>(null);
  const runRef = useRef(0);
  const handlersRef = useRef({ onBlocks, onDone, onFail });
  const seenRef = useRef(new Set<string>());
  const collectedRef = useRef<BlockContent[]>([]);

  useEffect(() => { handlersRef.current = { onBlocks, onDone, onFail }; }, [onBlocks, onDone, onFail]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const cancel = useCallback(() => {
    runRef.current += 1;
    clearTimer();
    setCard(null);
  }, [clearTimer]);

  const finishCard = useCallback((run: number, patch: Partial<ResearchCardState>, hideAfter: number) => {
    setCard((current) => (current ? { ...current, ...patch } : current));
    timerRef.current = window.setTimeout(() => { if (runRef.current === run) setCard(null); }, hideAfter);
  }, []);

  const start = useCallback(async (topicRaw: string): Promise<boolean> => {
    runRef.current += 1;
    const run = runRef.current;
    clearTimer();
    seenRef.current = new Set();
    collectedRef.current = [];
    const startedAt = Date.now();
    const provisional = topicRaw.replace(/^(?:the|a|an)\s+/i, "").trim().toUpperCase().slice(0, 44) || "RESEARCH";
    setCard({ title: provisional, stage: "STARTING RESEARCH AGENT", progress: 0, blocks: 0, sources: 0, startedAt, status: "running" });

    let id = "";
    let title = provisional;
    try {
      const response = await fetch(`${apiUrl}/api/research`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic: topicRaw }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.detail || `Backend returned HTTP ${response.status}`);
      id = String(data.id);
      title = String(data.title || provisional);
      setCard((current) => (current ? { ...current, title } : current));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The research service is unreachable.";
      finishCard(run, { status: "error", stage: "RESEARCH FAILED", error: message }, 6000);
      handlersRef.current.onFail(message);
      return false;
    }

    const poll = async () => {
      if (runRef.current !== run) return;
      try {
        const response = await fetch(`${apiUrl}/api/research/${id}`);
        if (!response.ok) throw new Error(`Research status returned HTTP ${response.status}`);
        const job = (await response.json()) as ResearchJobPayload;
        if (runRef.current !== run) return;
        const fresh = job.blocks.filter((block) => !seenRef.current.has(block.id)).map(toBlockContent);
        fresh.forEach((block) => seenRef.current.add(block.id));
        if (fresh.length) {
          collectedRef.current = [...collectedRef.current, ...fresh];
          handlersRef.current.onBlocks(fresh);
        }
        setCard((current) => (current ? { ...current, stage: job.stage, progress: job.progress, blocks: job.blocks.length, sources: job.sources.length } : current));
        if (job.status === "done") {
          finishCard(run, { status: "done", stage: "RESEARCH COMPLETE", progress: 1 }, 3200);
          handlersRef.current.onDone({ title: job.title || title, summary: job.summary, blocks: collectedRef.current, sources: job.sources.length, memoryNodeId: job.memory_node_id });
          return;
        }
        if (job.status === "error") {
          finishCard(run, { status: "error", stage: "RESEARCH FAILED", error: job.error }, 6000);
          handlersRef.current.onFail(job.error || "Research failed.");
          return;
        }
        if (Date.now() - startedAt > MAX_WAIT_MS) throw new Error("Research took too long.");
        timerRef.current = window.setTimeout(poll, POLL_MS);
      } catch (cause) {
        if (runRef.current !== run) return;
        const message = cause instanceof Error ? cause.message : "Lost contact with the research service.";
        finishCard(run, { status: "error", stage: "RESEARCH FAILED", error: message }, 6000);
        handlersRef.current.onFail(message);
      }
    };
    timerRef.current = window.setTimeout(poll, POLL_MS);
    return true;
  }, [apiUrl, clearTimer, finishCard]);

  /** Scripted run that needs no backend, so the dashboard can be previewed offline. */
  const startDemo = useCallback(() => {
    runRef.current += 1;
    const run = runRef.current;
    clearTimer();
    const report = demoReport();
    const startedAt = Date.now();
    collectedRef.current = [];
    setCard({ title: report.title, stage: "STARTING RESEARCH AGENT", progress: 0, blocks: 0, sources: 0, startedAt, status: "running" });
    const stages: Array<[string, number]> = [["SEARCHING THE WEB", 0.12], ["READING SOURCES", 0.3], ["FINDING IMAGES", 0.5], ["WRITING BLOCKS", 0.7]];
    let step = 0;
    const tick = () => {
      if (runRef.current !== run) return;
      if (step < stages.length) {
        const [stage, progress] = stages[step];
        setCard((current) => (current ? { ...current, stage, progress, sources: Math.min(report.sources, step * 2) } : current));
        step += 1;
        timerRef.current = window.setTimeout(tick, 1500);
        return;
      }
      const index = step - stages.length;
      if (index < report.blocks.length) {
        const block = report.blocks[index];
        collectedRef.current = [...collectedRef.current, block];
        handlersRef.current.onBlocks([block]);
        setCard((current) => (current ? { ...current, stage: "LAYING OUT BLOCKS", progress: 0.75 + 0.24 * ((index + 1) / report.blocks.length), blocks: index + 1, sources: report.sources } : current));
        step += 1;
        timerRef.current = window.setTimeout(tick, 650);
        return;
      }
      finishCard(run, { status: "done", stage: "RESEARCH COMPLETE", progress: 1 }, 3200);
      handlersRef.current.onDone({ title: report.title, summary: report.summary, blocks: collectedRef.current, sources: report.sources, memoryNodeId: "" });
    };
    timerRef.current = window.setTimeout(tick, 1200);
  }, [clearTimer, finishCard]);

  useEffect(() => cancel, [cancel]);

  return { card, start, startDemo, cancel };
}
