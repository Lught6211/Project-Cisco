"use client";

import { useEffect, useRef, useState } from "react";
import { voiceBus } from "./voiceBus";

type Rgb = [number, number, number];
const BLUE: Rgb = [89, 198, 255];
const PINK: Rgb = [255, 74, 120];
const RED: Rgb = [255, 64, 84];
const ICE: Rgb = [170, 226, 255];

type Mote = { x: number; y: number; z: number; speed: number; size: number; phase: number; hot: boolean };
type Ring = { born: number; hot: boolean; power: number };

const mix = (a: Rgb, b: Rgb, amount: number): Rgb => [a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount, a[2] + (b[2] - a[2]) * amount];
const rgba = (color: Rgb, alpha: number) => `rgba(${color[0] | 0},${color[1] | 0},${color[2] | 0},${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;

function FrameClock({ ultron }: { ultron: boolean }) {
  const [now, setNow] = useState("");
  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleTimeString([], { hour12: false }));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <span className="hx-frame-clock">{ultron ? "ULTRON" : "CISCO"} // CORE <i /> {now || "--:--:--"}</span>;
}

/**
 * The living backdrop behind everything: a slow perspective tunnel, drifting light motes, rings that pulse out of the
 * reactor with every word CISCO speaks (or every burst of your voice), and a scan band. A thin frame of corner
 * brackets and edge rulers sits around the screen. It is all pointer-transparent canvas + CSS.
 */
export default function Ambient({ tone = "hud", ultron = false, eco = false }: { tone?: "hud" | "memory"; ultron?: boolean; eco?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ultronRef = useRef(ultron);
  useEffect(() => { ultronRef.current = ultron; }, [ultron]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const ratio = Math.min(eco ? 1 : 1.5, window.devicePixelRatio || 1);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let width = 0;
    let height = 0;
    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const count = eco ? 36 : tone === "memory" ? 90 : 120;
    let seed = 7;
    const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const motes: Mote[] = Array.from({ length: count }, () => ({
      x: random(), y: random(), z: 0.2 + random() * 0.8, speed: 0.004 + random() * 0.014, size: 0.6 + random() * 1.6, phase: random() * 6.28, hot: random() < 0.16,
    }));
    const rings: Ring[] = [];

    // Pointer parallax, smoothed.
    const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
    const onPointer = (event: PointerEvent) => {
      pointer.x = (event.clientX / Math.max(1, width)) * 2 - 1;
      pointer.y = (event.clientY / Math.max(1, height)) * 2 - 1;
    };
    window.addEventListener("pointermove", onPointer, { passive: true });

    let reactor = { x: 0.5, y: 0.46, size: 0.3 };
    let reactorCheck = 0;
    let lastBeat = voiceBus.beat;
    let lastRing = 0;
    let energy = 0;
    let tint: Rgb = BLUE;
    let raf = 0;
    let last = performance.now();
    let scroll = 0;

    const draw = (now: number) => {
      const dt = Math.min(0.06, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      const mode = voiceBus.mode;
      const level = voiceBus.level;
      const talking = mode === "speaking" || mode === "listening";
      energy += ((talking ? 0.35 + level * 0.9 : mode === "thinking" ? 0.5 : 0.12) - energy) * Math.min(1, dt * 4);

      // Where the reactor is on screen (it moves when it docks).
      if (tone === "hud" && now - reactorCheck > 160) {
        reactorCheck = now;
        const element = document.querySelector(".hx-reactor");
        if (element) {
          const rect = element.getBoundingClientRect();
          reactor = { x: (rect.left + rect.width / 2) / Math.max(1, width), y: (rect.top + rect.height / 2) / Math.max(1, height), size: rect.width / Math.max(1, width) };
        }
      } else if (tone === "memory") reactor = { x: 0.5, y: 0.5, size: 0.12 };

      const base: Rgb = ultronRef.current ? RED : mode === "listening" ? PINK : BLUE;
      tint = mix(tint, base, Math.min(1, dt * 3));
      pointer.sx += (pointer.x - pointer.sx) * Math.min(1, dt * 3);
      pointer.sy += (pointer.y - pointer.sy) * Math.min(1, dt * 3);

      context.clearRect(0, 0, width, height);

      // --- perspective tunnel: floor and ceiling meet at a vanishing point that follows the pointer a little.
      const vx = width * 0.5 + pointer.sx * width * 0.025;
      const vy = height * 0.47 + pointer.sy * height * 0.02;
      scroll = (scroll + dt * (0.05 + energy * 0.22)) % 1;
      const lineAlpha = 0.05 + energy * 0.07;
      context.lineWidth = 1;
      const rays = 15;
      for (let index = -rays; index <= rays; index += 1) {
        const spread = index / rays;
        const bottomX = vx + spread * width * 1.15;
        for (const edgeY of [height, 0]) {
          const fromT = 0.3;
          context.strokeStyle = rgba(tint, lineAlpha * (1 - Math.abs(spread) * 0.45));
          context.beginPath();
          context.moveTo(vx + (bottomX - vx) * fromT, vy + (edgeY - vy) * fromT);
          context.lineTo(bottomX, edgeY);
          context.stroke();
        }
      }
      const rungs = 11;
      for (let index = 0; index < rungs; index += 1) {
        const depth = ((index + scroll) / rungs);
        const eased = Math.pow(depth, 2.2);
        const alpha = lineAlpha * (0.35 + depth * 1.3);
        const span = 0.25 + eased * 0.9;
        context.strokeStyle = rgba(tint, alpha);
        for (const edgeY of [height, 0]) {
          const y = vy + (edgeY - vy) * eased;
          context.beginPath();
          context.moveTo(vx - span * width * 0.9, y);
          context.lineTo(vx + span * width * 0.9, y);
          context.stroke();
        }
      }

      // --- rings out of the reactor on every spoken word / burst of your voice
      const cx = reactor.x * width;
      const cy = reactor.y * height;
      if (voiceBus.beat !== lastBeat) {
        lastBeat = voiceBus.beat;
        if (mode === "speaking") rings.push({ born: now, hot: false, power: 0.5 + level * 0.5 });
      }
      if (mode === "listening" && level > 0.22 && now - lastRing > 380) {
        lastRing = now;
        rings.push({ born: now, hot: true, power: 0.35 + level * 0.5 });
      }
      if (rings.length > 14) rings.splice(0, rings.length - 14);
      const reach = Math.hypot(width, height) * 0.62;
      for (let index = rings.length - 1; index >= 0; index -= 1) {
        const ring = rings[index];
        const age = (now - ring.born) / 1700;
        if (age >= 1) { rings.splice(index, 1); continue; }
        const radius = reactor.size * width * 0.42 + age * reach * (0.55 + ring.power * 0.45);
        context.strokeStyle = rgba(ring.hot ? PINK : ICE, (1 - age) * (1 - age) * 0.5 * ring.power);
        context.lineWidth = 1 + (1 - age) * 2.2;
        context.beginPath();
        context.arc(cx, cy, radius, 0, Math.PI * 2);
        context.stroke();
      }

      // --- drifting light motes
      for (const mote of motes) {
        mote.y -= mote.speed * dt * (1 + energy * 3) * (0.4 + mote.z);
        if (mote.y < -0.02) { mote.y = 1.02; mote.x = random(); }
        const px = (mote.x + pointer.sx * 0.03 * mote.z) * width;
        const py = mote.y * height + pointer.sy * 14 * mote.z;
        const twinkle = 0.5 + 0.5 * Math.sin(t * (0.8 + mote.z * 1.6) + mote.phase);
        const pulse = talking ? 1 + level * 1.4 : 1;
        context.fillStyle = rgba(mote.hot ? PINK : ICE, (0.1 + twinkle * 0.42) * mote.z * pulse);
        const size = mote.size * (0.7 + mote.z * 0.8) * (1 + level * 0.8);
        context.fillRect(px, py, size, size);
      }

      // --- scan band
      const bandT = (t / 9) % 1.25;
      const bandY = (bandT - 0.12) * height;
      const gradient = context.createLinearGradient(0, bandY - 90, 0, bandY + 6);
      gradient.addColorStop(0, rgba(tint, 0));
      gradient.addColorStop(1, rgba(tint, 0.07 + energy * 0.05));
      context.fillStyle = gradient;
      context.fillRect(0, bandY - 90, width, 96);
      context.fillStyle = rgba(tint, 0.14);
      context.fillRect(0, bandY + 5, width, 1);

      raf = reduce ? 0 : requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointer);
    };
  }, [tone, eco]);

  return (
    <div className={`hx-ambient ${tone}`} aria-hidden="true">
      <canvas ref={canvasRef} className="hx-ambient-canvas" />
      <div className="hx-frame">
        <i className="fc tl" /><i className="fc tr" /><i className="fc bl" /><i className="fc br" />
        <i className="hx-ruler l" /><i className="hx-ruler r" />
        {tone === "hud" && <FrameClock ultron={ultron} />}
      </div>
    </div>
  );
}
