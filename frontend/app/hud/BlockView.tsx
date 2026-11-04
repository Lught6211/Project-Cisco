"use client";

import { useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { HudContext } from "./context";
import type { HudBlock } from "./types";

function youTubeId(url: string) {
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  return match ? match[1] : "";
}

function LiveVideo({ streamKey }: { streamKey: string }) {
  const { streams } = useContext(HudContext);
  const ref = useRef<HTMLVideoElement>(null);
  const stream = streams[streamKey] ?? null;
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.srcObject = stream;
    if (stream) void element.play().catch(() => undefined);
  }, [stream]);
  return <video ref={ref} className="hb-media" autoPlay muted playsInline />;
}

function TextBody({ block, expanded }: { block: HudBlock; expanded: boolean }) {
  const pages = block.pages?.length ? block.pages : [""];
  const [page, setPage] = useState(0);
  const [hold, setHold] = useState(false);
  useEffect(() => {
    if (pages.length < 2 || hold) return;
    const timer = window.setInterval(() => setPage((current) => (current + 1) % pages.length), 7000);
    return () => window.clearInterval(timer);
  }, [pages.length, hold]);
  return (
    <>
      <div className="hb-body hb-text" onPointerEnter={() => setHold(true)} onPointerLeave={() => setHold(false)}>
        {expanded ? pages.map((text, index) => <p key={index}>{text}</p>) : <p key={page}>{pages[page % pages.length]}</p>}
      </div>
      {pages.length > 1 && !expanded && (
        <div className="hb-dots" role="tablist" aria-label="Pages">
          {pages.map((_, index) => (
            <button key={index} role="tab" aria-selected={index === page} className={index === page ? "on" : ""} onClick={() => setPage(index)} aria-label={`Page ${index + 1}`} />
          ))}
        </div>
      )}
    </>
  );
}

function ChartBody({ block }: { block: HudBlock }) {
  const chart = block.chart;
  if (!chart) return null;
  const max = Math.max(...chart.values.map((value) => Math.abs(value)), 1);
  return (
    <>
      <div className="hb-plot" role="img" aria-label={`${block.title ?? "Chart"}: ${chart.labels.map((label, index) => `${label} ${chart.values[index]}`).join(", ")}`}>
        <div className="hb-bars">
          {chart.values.map((value, index) => (
            <div key={index} className="hb-bar-col">
              <span className="hb-bar-value">{Number.isInteger(value) ? value : value.toFixed(1)}</span>
              <i className="hb-bar" style={{ "--h": `${Math.max(4, (Math.abs(value) / max) * 100)}%`, animationDelay: `calc(var(--arrive, 0ms) + 750ms + ${index * 80}ms)` } as CSSProperties} />
            </div>
          ))}
        </div>
        <div className="hb-axis">
          {chart.labels.map((label, index) => <span key={index}>{label}</span>)}
        </div>
      </div>
      {chart.caption && <p className="hb-caption">{chart.caption}</p>}
    </>
  );
}

/** "$1,250.5B" -> prefix "$", number 1250.5, suffix "B". Anything that is not a plain number is shown as is. */
function splitFigure(value: string) {
  const match = value.match(/^([~≈<>]?\s*[$€£]?)(\d[\d,]*(?:\.\d+)?)(.*)$/);
  if (!match) return null;
  const number = Number(match[2].replace(/,/g, ""));
  if (!Number.isFinite(number)) return null;
  const decimals = (match[2].split(".")[1] ?? "").length;
  return { prefix: match[1], number, decimals, suffix: match[3], grouped: match[2].includes(",") };
}

/** Counts a figure up from zero once the tile has landed, like a gauge spinning up. */
function useCountUp(value: string, delayMs: number) {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    const parts = splitFigure(value);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!parts || reduce || parts.number === 0) { setShown(value); return; }
    let raf = 0;
    const duration = 1100;
    const format = (amount: number) => {
      const text = amount.toFixed(parts.decimals);
      const [whole, fraction] = text.split(".");
      const withGrouping = parts.grouped ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : whole;
      return `${parts.prefix}${fraction ? `${withGrouping}.${fraction}` : withGrouping}${parts.suffix}`;
    };
    setShown(format(0));
    const timer = window.setTimeout(() => {
      const started = performance.now();
      const step = (now: number) => {
        const progress = Math.min(1, (now - started) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        setShown(progress >= 1 ? value : format(parts.number * eased));
        if (progress < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, delayMs);
    return () => { window.clearTimeout(timer); cancelAnimationFrame(raf); };
  }, [value, delayMs]);
  return shown;
}

function FigureBody({ block, arrive }: { block: HudBlock; arrive: number }) {
  const figure = block.figure;
  const text = figure ? (figure.value.startsWith("~") || figure.value.startsWith("≈") ? figure.value : `≈${figure.value}`.replace(/^≈(?=[$€£]?\d+(?:\.\d+)?%$)/, "")) : "";
  const shown = useCountUp(text, arrive + 650);
  if (!figure) return null;
  return (
    <div className="hb-fig">
      <div className="hb-figure-label">{figure.label}</div>
      <div className="hb-figure-value" aria-label={text}>{shown}</div>
      {figure.caption && <p className="hb-caption">{figure.caption}</p>}
    </div>
  );
}

function ImageBody({ block }: { block: HudBlock }) {
  const image = block.image;
  const [failed, setFailed] = useState(false);
  if (!image) return null;
  return (
    <div className="hb-photo">
      {failed ? <div className="hb-photo-missing">IMAGE UNAVAILABLE</div> : (
        <img src={image.url} alt={image.caption || block.title || "Research image"} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      )}
      {(image.caption || image.credit) && <figcaption>{[image.caption, image.credit].filter(Boolean).join(" · ")}</figcaption>}
    </div>
  );
}

function VideoBody({ block }: { block: HudBlock }) {
  const url = block.video?.url ?? "";
  const id = youTubeId(url);
  if (id) return <iframe className="hb-media" src={`https://www.youtube-nocookie.com/embed/${id}`} title={block.title || "Video"} allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen />;
  return <video className="hb-media" src={url} controls playsInline />;
}

function ServerBody() {
  const { homelab, homelabState } = useContext(HudContext);
  if (!homelab) {
    return <div className="hb-body hb-text"><p>{homelabState === "offline" ? "The homelab link is offline. Check Tailscale, then open SERVER." : homelabState === "unconfigured" ? "No homelab connected yet. Open SERVER to connect." : "Contacting the homelab..."}</p></div>;
  }
  const running = homelab.services.filter((service) => service.state === "running").length;
  const meters: Array<[string, number]> = [["CPU", homelab.server.cpu_percent], ["MEM", homelab.server.memory.percent], ["DISK", homelab.server.filesystem.percent]];
  return (
    <>
      <div className="hb-meters">
        {meters.map(([label, value]) => (
          <div key={label} className="hb-meter">
            <span>{label}</span>
            <div><i style={{ width: `${Math.min(100, Math.max(2, value))}%` }} className={value > 85 ? "hot" : ""} /></div>
            <b>{Math.round(value)}%</b>
          </div>
        ))}
      </div>
      <div className="hb-body hb-text">
        <p>{running} of {homelab.services.length} containers running · up {Math.floor(homelab.server.uptime_seconds / 3600)}h</p>
        {homelab.sites.length > 0 && <p>{homelab.sites.map((site) => `${site.name}: ${site.status}`).join(" · ")}</p>}
      </div>
    </>
  );
}

const KIND_LABEL: Record<string, string> = { text: "TEXT", chart: "CHART", figure: "FIGURE", image: "IMAGE", video: "VIDEO", camera: "LIVE", screen: "LIVE", server: "SERVER" };

export default function BlockView({
  block,
  style,
  expanded = false,
  arrive = 0,
  onHeaderPointerDown,
  onRaise,
  onClose,
  onExpand,
}: {
  block: HudBlock;
  style: CSSProperties;
  expanded?: boolean;
  /** Milliseconds to wait before this tile launches, so a batch of tiles fires one after another. */
  arrive?: number;
  onHeaderPointerDown?: (event: ReactPointerEvent<HTMLElement>, block: HudBlock) => void;
  onRaise?: (id: string) => void;
  onClose?: (id: string) => void;
  onExpand?: (id: string) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const kicker = block.kicker || `${KIND_LABEL[block.kind] ?? "BLOCK"} // ${(block.title ?? "").toUpperCase().slice(0, 28)}`;
  const tilt = block.kind === "image" ? (block.seq % 2 ? "tilt-r" : "tilt-l") : "";
  const showTitle = block.kind === "text" || block.kind === "chart" || block.kind === "server" || block.kind === "video" || block.kind === "camera" || block.kind === "screen";

  // Where the reactor is, relative to this tile: the tile launches from there. offsetLeft/Top ignore transforms.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || expanded) return;
    const inner = element.offsetParent as HTMLElement | null;
    const reactor = document.querySelector(".hx-reactor");
    if (!inner || !reactor) return;
    const origin = inner.getBoundingClientRect();
    const rect = reactor.getBoundingClientRect();
    const dx = rect.left + rect.width / 2 - (origin.left + element.offsetLeft + element.offsetWidth / 2);
    const dy = rect.top + rect.height / 2 - (origin.top + element.offsetTop + element.offsetHeight / 2);
    element.style.setProperty("--fx", `${Math.round(dx)}px`);
    element.style.setProperty("--fy", `${Math.round(dy)}px`);
    element.style.setProperty("--fr", `${Math.max(-28, Math.min(28, dx / 40))}deg`);
  }, [expanded]);

  const vars = {
    ...style,
    zIndex: expanded ? 90 : block.z,
    "--arrive": `${arrive}ms`,
    "--depth": expanded ? 0 : 3 + (block.z % 5) * 2.4,
    "--phase": `${-(block.seq * 1.7) % 6}s`,
    "--cycle": `${11 + (block.seq % 5) * 1.6}s`,
  } as CSSProperties;
  return (
    <section
      ref={ref}
      className={`hb hb-${block.kind} ${tilt}${expanded ? " expanded" : ""}`}
      style={vars}
      onPointerDown={() => onRaise?.(block.id)}
      aria-label={block.title || kicker}
    >
      <header className="hb-head" onPointerDown={(event) => onHeaderPointerDown?.(event, block)}>
        <span className="hb-idx">{String(block.seq).padStart(2, "0")}</span>
        <span className="hb-kicker">{kicker}</span>
        <span className="hb-tools">
          {onClose && <button className="hb-x" onClick={() => onClose(block.id)} aria-label="Close tile">×</button>}
        </span>
      </header>
      {showTitle && block.title && <h3 className="hb-title">{block.title}</h3>}
      {block.kind === "text" && <TextBody block={block} expanded={expanded} />}
      {block.kind === "chart" && <ChartBody block={block} />}
      {block.kind === "figure" && <FigureBody block={block} arrive={arrive} />}
      {block.kind === "image" && <ImageBody block={block} />}
      {block.kind === "video" && <VideoBody block={block} />}
      {block.kind === "camera" && <LiveVideo streamKey="camera" />}
      {block.kind === "screen" && <LiveVideo streamKey="screen" />}
      {block.kind === "server" && <ServerBody />}
      <footer className="hb-foot">
        <span>{block.source ? safeHost(block.source) : `BLOCK ${String(block.seq).padStart(2, "0")}`}</span>
        <span className="hb-ticks" aria-hidden="true"><i /><i /><i /><i /><i /></span>
        {onExpand && (block.kind === "text" || block.kind === "chart" || block.kind === "image") && (
          <button className="hb-expand" onClick={() => onExpand(block.id)} aria-label={expanded ? "Close expanded tile" : "Expand tile"} />
        )}
      </footer>
      <i className="hb-sweep" aria-hidden="true" />
      <i className="hb-c tl" aria-hidden="true" /><i className="hb-c tr" aria-hidden="true" /><i className="hb-c bl" aria-hidden="true" /><i className="hb-c br" aria-hidden="true" />
      <i className="hb-pip a" /><i className="hb-pip b" />
    </section>
  );
}

function safeHost(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, "").toUpperCase(); } catch { return "SOURCE"; }
}
