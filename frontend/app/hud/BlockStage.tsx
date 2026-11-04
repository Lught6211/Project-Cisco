"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import BlockView from "./BlockView";
import { GAP, ROWS, columnsFor, rectToStyle } from "./grid";
import type { HudBlock } from "./types";

type Metrics = { cols: number; cellW: number; cellH: number; height: number };
type Beam = { id: string; x1: number; y1: number; x2: number; y2: number; delay: number };

export default function BlockStage({
  blocks,
  onChange,
  onClose,
  onMetrics,
}: {
  blocks: HudBlock[];
  onChange: (blocks: HudBlock[]) => void;
  onClose: (id: string) => void;
  onMetrics: (cols: number) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState<Metrics>({ cols: 12, cellW: 80, cellH: 80, height: 600 });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const drag = useRef<{ id: string; startX: number; startY: number; element: HTMLElement; moved: boolean } | null>(null);
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const innerRef = useRef<HTMLDivElement>(null);
  const arrivals = useRef(new Map<string, number>());
  const [beams, setBeams] = useState<Beam[]>([]);

  // Every tile gets a launch delay the first time it is seen, so a batch fires one after another.
  let fresh = 0;
  for (const block of blocks) {
    if (!arrivals.current.has(block.id)) { arrivals.current.set(block.id, Math.min(fresh, 10) * 120); fresh += 1; }
  }

  useLayoutEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      const cols = columnsFor(width);
      const cellW = Math.max(40, (width - GAP * (cols - 1)) / cols);
      const cellH = Math.max(cols < 8 ? 92 : 56, (height - GAP * (ROWS - 1)) / ROWS);
      setMetrics({ cols, cellW, cellH, height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => { onMetrics(metrics.cols); }, [metrics.cols, onMetrics]);

  useEffect(() => {
    if (!expandedId) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setExpandedId(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expandedId]);

  // A light beam from the reactor to each tile that has just arrived.
  const beamed = useRef(new Set<string>());
  useLayoutEffect(() => {
    const inner = innerRef.current;
    const reactor = document.querySelector(".hx-reactor");
    if (!inner || !reactor) return;
    const origin = inner.getBoundingClientRect();
    const rect = reactor.getBoundingClientRect();
    const x1 = rect.left + rect.width / 2 - origin.left;
    const y1 = rect.top + rect.height / 2 - origin.top;
    const added: Beam[] = [];
    for (const block of blocks) {
      if (beamed.current.has(block.id)) continue;
      beamed.current.add(block.id);
      const box = rectToStyle(block, metrics);
      added.push({ id: block.id, x1, y1, x2: box.left + box.width / 2, y2: box.top + box.height / 2, delay: arrivals.current.get(block.id) ?? 0 });
    }
    if (!added.length) return;
    setBeams((current) => [...current.filter((beam) => !added.some((next) => next.id === beam.id)), ...added]);
    const timer = window.setTimeout(() => setBeams((current) => current.filter((beam) => !added.some((next) => next.id === beam.id))), 2600 + Math.max(...added.map((beam) => beam.delay)));
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks.map((block) => block.id).join("|")]);

  // Tiles drift a few pixels with the pointer, each at its own depth.
  useEffect(() => {
    const inner = innerRef.current;
    if (!inner || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    let nx = 0;
    let ny = 0;
    const apply = () => {
      frame = 0;
      inner.style.setProperty("--px", nx.toFixed(3));
      inner.style.setProperty("--py", ny.toFixed(3));
    };
    const onMove = (event: PointerEvent) => {
      nx = (event.clientX / window.innerWidth) * 2 - 1;
      ny = (event.clientY / window.innerHeight) * 2 - 1;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => { window.removeEventListener("pointermove", onMove); if (frame) cancelAnimationFrame(frame); };
  }, []);

  const raise = useCallback((id: string) => {
    const current = blocksRef.current;
    const top = current.reduce((max, block) => Math.max(max, block.z), 0);
    const target = current.find((block) => block.id === id);
    if (!target || target.z === top) return;
    onChange(current.map((block) => (block.id === id ? { ...block, z: top + 1 } : block)));
  }, [onChange]);

  const onHeaderPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>, block: HudBlock) => {
    if ((event.target as HTMLElement).closest("button") || event.button !== 0) return;
    const element = event.currentTarget.closest(".hb") as HTMLElement | null;
    if (!element) return;
    drag.current = { id: block.id, startX: event.clientX, startY: event.clientY, element, moved: false };
    element.classList.add("dragging");
    const onMove = (moveEvent: PointerEvent) => {
      const state = drag.current;
      if (!state) return;
      state.moved = true;
      state.element.style.transform = `translate(${moveEvent.clientX - state.startX}px, ${moveEvent.clientY - state.startY}px)`;
    };
    const onUp = (upEvent: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const state = drag.current;
      drag.current = null;
      if (!state) return;
      state.element.classList.remove("dragging");
      state.element.style.transform = "";
      if (!state.moved) return;
      const current = blocksRef.current;
      const moving = current.find((item) => item.id === state.id);
      if (!moving) return;
      const dx = (upEvent.clientX - state.startX) / (metrics.cellW + GAP);
      const dy = (upEvent.clientY - state.startY) / (metrics.cellH + GAP);
      const x = Math.min(Math.max(0, Math.round(moving.x + dx)), Math.max(0, metrics.cols - moving.w));
      const y = Math.max(0, Math.round(moving.y + dy));
      const top = current.reduce((max, item) => Math.max(max, item.z), 0);
      onChange(current.map((item) => (item.id === state.id ? { ...item, x, y, z: top + 1 } : item)));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [metrics, onChange]);

  const bottom = blocks.reduce((max, block) => Math.max(max, block.y + block.h), 0);
  const contentHeight = Math.max(metrics.height, bottom * (metrics.cellH + GAP));
  const expanded = blocks.find((block) => block.id === expandedId) ?? null;

  return (
    <div className="hx-stage" ref={stageRef}>
      <div className="hx-stage-inner" ref={innerRef} style={{ height: contentHeight }}>
        {beams.length > 0 && (
          <svg className="hx-beams" width="100%" height={contentHeight} aria-hidden="true">
            {beams.map((beam) => {
              const path = `M${beam.x1.toFixed(1)} ${beam.y1.toFixed(1)} L${beam.x2.toFixed(1)} ${beam.y2.toFixed(1)}`;
              return (
                <g key={beam.id} style={{ "--d": `${beam.delay}ms` } as CSSProperties}>
                  <path className="hx-beam trail" d={path} pathLength={1} />
                  <path className="hx-beam head" d={path} pathLength={1} />
                  <circle className="hx-beam-spark" cx={beam.x2} cy={beam.y2} r="4" />
                </g>
              );
            })}
          </svg>
        )}
        {blocks.map((block) => (
          <BlockView
            key={block.id}
            block={block}
            arrive={arrivals.current.get(block.id) ?? 0}
            style={rectToStyle(block, metrics)}
            onHeaderPointerDown={onHeaderPointerDown}
            onRaise={raise}
            onClose={onClose}
            onExpand={setExpandedId}
          />
        ))}
      </div>
      {expanded && (
        <div className="hx-expanded-scrim" onPointerDown={(event) => { if (event.target === event.currentTarget) setExpandedId(null); }}>
          <BlockView block={expanded} expanded style={{}} onClose={() => setExpandedId(null)} onExpand={() => setExpandedId(null)} />
        </div>
      )}
    </div>
  );
}
