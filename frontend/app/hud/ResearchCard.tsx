"use client";

import { useEffect, useState } from "react";
import type { ResearchCardState } from "./types";

const SEGMENTS = 24;

function clock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** The blue "RESEARCH // ACTIVE" card: title, stage, segmented progress, block and source counters. */
export default function ResearchCard({ card, style }: { card: ResearchCardState; style?: React.CSSProperties }) {
  const [now, setNow] = useState(() => Date.now());
  const [frozen, setFrozen] = useState<number | null>(null);
  useEffect(() => {
    if (card.status !== "running") { setFrozen((current) => current ?? Date.now()); return; }
    setFrozen(null);
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [card.status, card.startedAt]);
  const elapsed = (frozen ?? now) - card.startedAt;
  const filled = Math.round(card.progress * SEGMENTS);
  const label = card.status === "running" ? "ACTIVE" : card.status === "done" ? "COMPLETE" : "FAILED";
  return (
    <aside className={`rc rc-${card.status}`} style={style} role="status" aria-live="polite">
      <div className="rc-frame">
        <header className="rc-head">
          <span>RESEARCH // {label}</span>
          <span className="rc-clock">{clock(elapsed)}</span>
        </header>
        <h2 className="rc-title">{card.title}</h2>
        <p className="rc-stage">{card.status === "error" && card.error ? card.error.slice(0, 80).toUpperCase() : card.stage}</p>
        <div className="rc-bar" aria-hidden="true">
          {Array.from({ length: SEGMENTS }, (_, index) => <i key={index} className={index < filled ? "on" : ""} />)}
        </div>
        <div className="rc-counts">
          <span>{card.blocks} BLOCKS</span>
          <span>{card.sources} SOURCES</span>
        </div>
      </div>
      <div className="rc-leds" aria-hidden="true"><i /><i className="hot" /></div>
      <div className="rc-foot"><span>ADDED JUST NOW</span><span>CISCO · {card.status === "running" ? "RUN" : "END"}</span></div>
    </aside>
  );
}
