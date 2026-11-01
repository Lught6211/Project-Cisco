"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";

const HologramStage = dynamic(() => import("./HologramStage3D"), {
  ssr: false,
  loading: () => <div className="world-holo-stage holo-stage-loading" aria-label="Loading hologram renderer">CALIBRATING 3D PROJECTION…</div>,
});

type MemoryNode = {
  id: string;
  label: string;
  kind: string;
  detail?: string;
  active?: boolean;
};
type MemoryEdge = { source: string; target: string; label?: string };
type Point = { x: number; y: number };

const colorByKind: Record<string, string> = {
  agent: "#75d7ff",
  person: "#e4d77c",
  place: "#c4a6ff",
  task: "#ffc47a",
  memory: "#85d5c7",
  server: "#f0a5ff",
  service: "#76e1d5",
  site: "#84c9ff",
  download: "#ffc47a",
};

export default function MemoryScene2D({
  nodes = [],
  edges = [],
  selected,
  coreName = "CISCO",
  hologramModel = null,
  cameraResetToken = 0,
  onHologramDismiss,
  onSelect,
}: {
  nodes?: MemoryNode[];
  edges?: MemoryEdge[];
  selected: string;
  coreName?: string;
  hologramModel?: { title: string; archetype: string } | null;
  cameraResetToken?: number;
  onHologramDismiss?: () => void;
  onSelect: (id: string) => void;
}) {
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  const safeEdges = Array.isArray(edges) ? edges : [];
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragOffsets, setDragOffsets] = useState<Record<string, Point>>({});
  const [viewport, setViewport] = useState({ width: 1280, height: 800 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const backgroundDrag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const nodeDrag = useRef<{ id: string; x: number; y: number; originX: number; originY: number; moved: boolean } | null>(null);

  const layout = useMemo(() => {
    const byId = new Map(safeNodes.map((node) => [node.id, node]));
    const adjacent = new Map(safeNodes.map((node) => [node.id, new Set<string>()]));
    for (const edge of safeEdges) {
      if (!byId.has(edge.source) || !byId.has(edge.target)) continue;
      adjacent.get(edge.source)?.add(edge.target);
      adjacent.get(edge.target)?.add(edge.source);
    }
    const compare = (a: string, b: string) =>
      (byId.get(a)?.label ?? a).localeCompare(byId.get(b)?.label ?? b) || a.localeCompare(b);
    const root = safeNodes.find((node) => node.kind === "agent")?.id ?? safeNodes[0]?.id;
    const parent = new Map<string, string>();
    const depth = new Map<string, number>();
    const children = new Map<string, string[]>();
    const queue: string[] = [];
    if (root) {
      depth.set(root, 0);
      queue.push(root);
    }
    const discover = (from: string, to: string) => {
      if (depth.has(to)) return;
      parent.set(to, from);
      depth.set(to, (depth.get(from) ?? 0) + 1);
      children.set(from, [...(children.get(from) ?? []), to]);
      queue.push(to);
    };
    let cursor = 0;
    while (cursor < queue.length) {
      const current = queue[cursor++];
      [...(adjacent.get(current) ?? [])].sort(compare).forEach((child) => discover(current, child));
    }
    if (root) {
      [...safeNodes].sort((a, b) => compare(a.id, b.id)).forEach((node) => {
        if (!depth.has(node.id)) discover(root, node.id);
      });
    }

    const positions = new Map<string, Point>();
    const branches = new Map<string, number>();
    const viewScale = Math.max(.46, Math.min(1, Math.min(viewport.width / 1000, viewport.height / 760)));
    const rootChildren = [...(children.get(root ?? "") ?? [])].sort(compare);
    const rootRadius = Math.min(330, 220 + Math.max(0, rootChildren.length - 4) * 5) * viewScale;
    const shellGap = Math.min(250, 205 + Math.max(0, rootChildren.length - 5) * 3) * viewScale;
    const rootOffset = hologramModel ? -170 * viewScale : 0;
    if (root) positions.set(root, { x: rootOffset, y: 0 });

    // Place each graph depth on an expanding orbit around CISCO. A golden-angle
    // turn for single-child chains keeps follow-up memories from stacking in a
    // straight line; sibling groups fan out around their inherited direction.
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const pending = root ? [...rootChildren.map((id, index) => ({
      id,
      angle: rootChildren.length === 1 ? -Math.PI / 2 : -Math.PI / 2 + ((index + .5) / rootChildren.length) * Math.PI * 2,
    }))] : [];
    for (const entry of pending) branches.set(entry.id, entry.angle);
    let layoutCursor = 0;
    while (layoutCursor < pending.length) {
      const { id, angle } = pending[layoutCursor++];
      const nodeDepth = depth.get(id) ?? 1;
      const radius = (rootRadius + (nodeDepth - 1) * shellGap);
      positions.set(id, { x: rootOffset + Math.cos(angle) * radius, y: Math.sin(angle) * radius });
      const childIds = [...(children.get(id) ?? [])].sort(compare);
      const childSpread = Math.min(1.48, .5 + Math.max(0, childIds.length - 1) * .24);
      childIds.forEach((childId, index) => {
        const childAngle = childIds.length === 1
          ? angle + goldenAngle
          : angle + (index - (childIds.length - 1) / 2) * childSpread;
        branches.set(childId, childAngle);
        pending.push({ id: childId, angle: childAngle });
      });
    }

    return { positions, parent, depth, branches };
  }, [safeNodes, safeEdges, hologramModel, viewport]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const update = () => setViewport({ width: element.clientWidth, height: element.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setPan({ x: 0, y: 0 });
    setZoom(1);
  }, [cameraResetToken]);

  const beginBackgroundDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest(".graph-node, .world-holo-stage")) return;
    backgroundDrag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveBackground = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!backgroundDrag.current) return;
    setPan({
      x: backgroundDrag.current.panX + event.clientX - backgroundDrag.current.x,
      y: backgroundDrag.current.panY + event.clientY - backgroundDrag.current.y,
    });
  };
  const beginNodeDrag = (event: React.PointerEvent<HTMLButtonElement>, id: string) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const offset = dragOffsets[id] ?? { x: 0, y: 0 };
    nodeDrag.current = { id, x: event.clientX, y: event.clientY, originX: offset.x, originY: offset.y, moved: false };
  };
  const moveNode = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = nodeDrag.current;
    if (!drag) return;
    const dx = (event.clientX - drag.x) / zoom;
    const dy = (event.clientY - drag.y) / zoom;
    if (Math.hypot(dx, dy) > 4) drag.moved = true;
    if (drag.moved) {
      setDragOffsets((current) => ({ ...current, [drag.id]: { x: drag.originX + dx, y: drag.originY + dy } }));
    }
  };
  const finishNodeDrag = (id: string) => {
    const drag = nodeDrag.current;
    if (drag && drag.id === id && !drag.moved) onSelect(id);
    nodeDrag.current = null;
  };
  const handleZoom = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    setZoom((value) => Math.max(0.48, Math.min(1.9, value * (event.deltaY < 0 ? 1.1 : 0.91))));
  };

  const centerX = viewport.width / 2;
  const centerY = viewport.height / 2;
  const visibleNodes = hologramModel ? safeNodes.filter((node) => node.kind === "agent") : safeNodes;
  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = safeEdges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target));

  return (
    <div
      ref={viewportRef}
      className={`graph-2d-viewport${hologramModel ? " graph-2d-projecting" : ""}`}
      onPointerDown={beginBackgroundDrag}
      onPointerMove={(event) => { moveBackground(event); }}
      onPointerUp={() => { backgroundDrag.current = null; }}
      onPointerCancel={() => { backgroundDrag.current = null; }}
      onWheel={handleZoom}
      aria-label="Interactive 2D memory graph"
    >
      <div className="graph-space-field" aria-hidden="true" />
      <div className="graph-2d-world" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
        <svg className="graph-2d-links" viewBox={`0 0 ${viewport.width} ${viewport.height}`} preserveAspectRatio="none" aria-hidden="true">
          <g transform={`translate(${centerX} ${centerY})`}>
            {visibleEdges.map((edge) => {
              const from = layout.positions.get(edge.source);
              const to = layout.positions.get(edge.target);
              if (!from || !to) return null;
              const a = dragOffsets[edge.source] ?? { x: 0, y: 0 };
              const b = dragOffsets[edge.target] ?? { x: 0, y: 0 };
              const parentEdge = layout.parent.get(edge.source) === edge.target || layout.parent.get(edge.target) === edge.source;
              const selectedEdge = edge.source === selected || edge.target === selected;
              return <line key={`${edge.source}-${edge.target}`} x1={from.x + a.x} y1={from.y + a.y} x2={to.x + b.x} y2={to.y + b.y} className={`memory-edge${parentEdge ? " parent-edge" : ""}${selectedEdge ? " selected-edge" : ""}`} />;
            })}
            {visibleNodes.filter((node) => node.kind === "agent").map((node) => <circle key={`orbit-${node.id}`} cx={layout.positions.get(node.id)?.x ?? 0} cy={layout.positions.get(node.id)?.y ?? 0} r="76" className="core-orbit" />)}
          </g>
        </svg>
        <div className="graph-2d-node-layer">
          {visibleNodes.map((node) => {
            const point = layout.positions.get(node.id) ?? { x: 0, y: 0 };
            const offset = dragOffsets[node.id] ?? { x: 0, y: 0 };
            const selectedNode = node.id === selected;
            const isCore = node.kind === "agent";
            const nodeColor = colorByKind[node.kind] ?? colorByKind.memory;
            const angle = layout.branches.get(node.id) ?? Math.atan2(point.y, point.x);
            const horizontalLabel = Math.abs(Math.cos(angle)) > .62;
            const labelOnRight = Math.cos(angle) >= 0;
            const labelX = isCore ? 0 : horizontalLabel ? (labelOnRight ? 34 : -34) : 0;
            const labelY = isCore ? 0 : horizontalLabel ? 0 : (Math.sin(angle) >= 0 ? 35 : -35);
            const labelTransform = isCore
              ? ""
              : horizontalLabel
                ? labelOnRight ? "translate(0,-50%)" : "translate(-100%,-50%)"
                : Math.sin(angle) >= 0 ? "translate(-50%,0)" : "translate(-50%,-100%)";
            const delay = -((Array.from(node.id).reduce((sum, char) => sum * 31 + char.charCodeAt(0), 7) >>> 0) % 9000) / 1000;
            const top = `${point.y + offset.y}px`;
            const left = `${point.x + offset.x}px`;
            return (
              <button
                key={node.id}
                className={`graph-node kind-${node.kind}${isCore ? " graph-core-node" : ""}${selectedNode ? " selected" : ""}${node.active ? " node-active" : ""}`}
                style={{ left: `calc(50% + ${left})`, top: `calc(50% + ${top})`, "--node-color": nodeColor, "--node-delay": `${delay}s`, "--label-x": `${labelX}px`, "--label-y": `${labelY}px`, "--label-transform": labelTransform } as React.CSSProperties}
                title={`${node.label}${node.detail ? ` — ${node.detail}` : ""}`}
                aria-label={`${node.label}, ${node.kind}${selectedNode ? ", focused" : ""}. Drag to rearrange.`}
                onPointerDown={(event) => beginNodeDrag(event, node.id)}
                onPointerMove={moveNode}
                onPointerUp={() => finishNodeDrag(node.id)}
                onPointerCancel={() => { nodeDrag.current = null; }}
                onDoubleClick={(event) => {
                  event.preventDefault();
                  if (isCore && hologramModel) onHologramDismiss?.();
                }}
              >
                <span className={`node-radar${isCore ? " core-radar" : ""}`}>
                  <span className="node-orbit" />
                  {!isCore && <span className="node-orbit node-orbit-secondary" />}
                  <span className="node-sphere" />
                  {isCore && <><span className="core-ring core-ring-one" /><span className="core-ring core-ring-two" /></>}
                </span>
                <span className={`node-label-card${isCore ? " core-label-card" : ""}`}>
                  {!isCore && <i />}
                  <strong>{isCore ? coreName : node.label}</strong>
                  {isCore && <small>OPERATIONS CORE</small>}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {hologramModel && <HologramStage {...hologramModel} cameraResetToken={cameraResetToken} onDismiss={onHologramDismiss || (() => {})} />}

      <div className="graph-zoom-hint">DRAG NODES TO ARRANGE · DRAG SPACE TO PAN · SCROLL TO ZOOM</div>
    </div>
  );
}
