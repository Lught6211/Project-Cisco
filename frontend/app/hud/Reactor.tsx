"use client";

import { useEffect, useMemo, useRef } from "react";
import type { CSSProperties } from "react";
import type { VoiceState } from "./types";
import { voiceBus } from "./voiceBus";

const BARS = 96;
const BAR_R = 196;

type Pose = { yaw: number; roll: number; pitch: number; spread: number };

const GYRO_POSE = (t: number): Pose => ({
  yaw: 62 + 17 * Math.sin(t * 0.55) + 6 * Math.sin(t * 1.3),
  roll: -24 + 11 * Math.sin(t * 0.38 + 0.8),
  pitch: 12 + 8 * Math.sin(t * 0.33 + 1.2),
  spread: 1,
});
const LOGO_POSE: Pose = { yaw: 0, roll: 0, pitch: 0, spread: 0 };

/** Cheap deterministic pseudo-random so server and client render the same sparkles. */
function seeded(seed: number) {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

export default function Reactor({
  phase,
  voice,
  docked,
  name,
  ultron = false,
  onActivate,
}: {
  phase: "gyro" | "logo";
  voice: VoiceState;
  docked: boolean;
  name: string;
  ultron?: boolean;
  onActivate?: () => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const barsRef = useRef<SVGGElement>(null);
  const poseRef = useRef<Pose & { t: number }>({ ...GYRO_POSE(0), t: 0 });
  const phaseRef = useRef(phase);

  const sparkles = useMemo(() => {
    const random = seeded(7);
    return Array.from({ length: 22 }, (_, index) => {
      const angle = random() * Math.PI * 2;
      const radius = 18 + random() * 26;
      return {
        key: index,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius * 0.85,
        z: (random() - 0.5) * 46,
        size: 0.35 + random() * 0.5,
        delay: random() * 3,
        pink: random() > 0.55,
      };
    });
  }, []);

  const splatter = useMemo(() => {
    const random = seeded(31);
    return Array.from({ length: 16 }, (_, index) => ({
      key: index,
      x: -92 + random() * 184,
      y: -34 + random() * 70,
      r: 0.5 + random() * 1.6,
      o: 0.35 + random() * 0.6,
    }));
  }, []);

  // Drive the 3D tumble with requestAnimationFrame so the "snap flat" at the end of boot is eased, not cut.
  useEffect(() => {
    phaseRef.current = phase;
    const body = bodyRef.current;
    if (!body) return;
    let raf = 0;
    let last = performance.now();
    const pose = poseRef.current;
    const apply = () => {
      body.style.transform = `rotateZ(${pose.roll.toFixed(2)}deg) rotateX(${pose.pitch.toFixed(2)}deg) rotateY(${pose.yaw.toFixed(2)}deg)`;
      body.style.setProperty("--spread", Math.max(0, pose.spread).toFixed(3));
    };
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      pose.t += dt;
      const target = phaseRef.current === "gyro" ? GYRO_POSE(pose.t) : LOGO_POSE;
      const rate = phaseRef.current === "gyro" ? 2.6 : 4.2;
      const k = 1 - Math.exp(-dt * rate);
      pose.yaw += (target.yaw - pose.yaw) * k;
      pose.roll += (target.roll - pose.roll) * k;
      pose.pitch += (target.pitch - pose.pitch) * k;
      pose.spread += (target.spread - pose.spread) * k;
      apply();
      const settled = phaseRef.current === "logo" && Math.abs(pose.yaw) < 0.08 && Math.abs(pose.roll) < 0.08 && Math.abs(pose.pitch) < 0.08 && pose.spread < 0.003;
      if (!settled) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  // Voice reactivity: while you talk (listening) or CISCO talks (speaking), a ring of bars and the glow follow the
  // voice level. Everything is written straight to the DOM from the animation loop, so nothing re-renders.
  useEffect(() => {
    const root = rootRef.current;
    const group = barsRef.current;
    if (!root || !group) return;
    const lines = Array.from(group.querySelectorAll("line"));
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const active = voice === "speaking" || voice === "listening";
    let raf = 0;
    let smooth = 0;
    let lastBeat = voiceBus.beat;
    const loop = (now: number) => {
      const target = active ? voiceBus.level : 0;
      smooth += (target - smooth) * 0.3;
      const t = now / 1000;
      const speed = voice === "speaking" ? 9 : 5;
      for (let index = 0; index < lines.length; index += 1) {
        const band = 0.5 + 0.5 * Math.sin(t * speed + index * 0.83) * Math.sin(t * 2.1 + index * 0.31 + 1.7);
        const length = 1.2 + smooth * (6 + band * 40);
        lines[index].setAttribute("y2", String(-(BAR_R + length)));
      }
      document.documentElement.style.setProperty("--vl", smooth.toFixed(3));
      if (voiceBus.beat !== lastBeat) {
        lastBeat = voiceBus.beat;
        root.classList.remove("beat");
        void root.offsetWidth;
        root.classList.add("beat");
      }
      if (!reduce && (active || smooth > 0.012)) raf = requestAnimationFrame(loop);
      else if (!active) {
        for (const line of lines) line.setAttribute("y2", String(-BAR_R - 1.2));
        document.documentElement.style.setProperty("--vl", "0");
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [voice]);

  const rings: Array<{ z: number; className: string; children: React.ReactNode }> = [
    {
      z: 0,
      className: "rx-r-main",
      children: (
        <>
          <circle r="74" className="rx-hot" strokeWidth="9" />
          <circle r="63" className="rx-white" strokeWidth="1.3" />
          <circle r="82" className="rx-hot" strokeWidth="1.2" opacity=".7" />
        </>
      ),
    },
    {
      z: -8,
      className: "rx-r-white",
      children: (
        <>
          <circle r="88" className="rx-white" strokeWidth="1.7" strokeDasharray="250 30 100 40" />
          <circle r="93" className="rx-white" strokeWidth=".8" opacity=".55" />
        </>
      ),
    },
    { z: 6, className: "rx-r-pink", children: <circle r="80" className="rx-hot" strokeWidth="2.6" /> },
    {
      z: 21,
      className: "rx-r-tick",
      children: (
        <>
          <circle r="118" stroke="#cfe3ff" strokeWidth="6" strokeDasharray="1.1 5.4" opacity=".5" />
          <circle r="118" className="rx-red" strokeWidth="6" strokeDasharray="1.6 36" />
          <circle r="124" stroke="#fff" strokeWidth="3.6" strokeDasharray="3 92" />
        </>
      ),
    },
    {
      z: -19,
      className: "rx-r-arcs",
      children: (
        <>
          <circle r="100" className="rx-white" strokeWidth="1.5" strokeDasharray="76 96 26 120" />
          <circle r="108" className="rx-white" strokeWidth="2.4" strokeDasharray="22 258" />
        </>
      ),
    },
    { z: 31, className: "rx-r-faint", children: <circle r="127" stroke="#8fb4d8" strokeWidth="1.1" strokeDasharray="1 6" opacity=".45" /> },
  ];

  const style = { "--rx-z-unit": "1cqw" } as CSSProperties;

  return (
    <div
      ref={rootRef}
      className={`hx-reactor${docked ? " docked" : ""}${ultron ? " ultron" : ""}`}
      data-phase={phase}
      data-voice={voice}
      role="button"
      tabIndex={0}
      aria-label={`${name} core, ${voice}. Activate to toggle the microphone.`}
      onClick={onActivate}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onActivate?.(); } }}
      style={style}
    >
      <div className="rx">
        {/* 3D gyroscope: shown while booting and while CISCO is thinking with nothing on screen yet */}
        <div className="rx-gyro" aria-hidden="true">
          <div className="rx-gyro-body" ref={bodyRef}>
            <div className="rx-axis" />
            {rings.map((ring) => (
              <svg key={ring.className} className={`rx-ring ${ring.className}`} viewBox="-130 -130 260 260" fill="none" style={{ "--z": `${ring.z}cqw` } as CSSProperties}>
                {ring.children}
              </svg>
            ))}
            {sparkles.map((spark) => (
              <i
                key={spark.key}
                className={`rx-spark${spark.pink ? " pink" : ""}`}
                style={{ "--x": `${spark.x}cqw`, "--y": `${spark.y}cqw`, "--z": `${spark.z}cqw`, "--s": `${spark.size}cqw`, animationDelay: `${spark.delay}s` } as CSSProperties}
              />
            ))}
          </div>
        </div>

        {/* Flat reactor logo */}
        <svg className="rx-logo" viewBox="-200 -200 400 400" aria-hidden="true">
          <defs>
            <filter id="rx-grunge" x="-12%" y="-25%" width="124%" height="150%">
              <feTurbulence type="fractalNoise" baseFrequency="0.045 0.09" numOctaves="2" seed="9" result="wobble" />
              <feDisplacementMap in="SourceGraphic" in2="wobble" scale="6" xChannelSelector="R" yChannelSelector="G" result="bent" />
              <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="1" seed="2" result="grain" />
              <feDisplacementMap in="bent" in2="grain" scale="1.6" xChannelSelector="G" yChannelSelector="R" />
            </filter>
            <radialGradient id="rx-core" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#05030a" stopOpacity="1" />
              <stop offset="68%" stopColor="#0a0410" stopOpacity="1" />
              <stop offset="100%" stopColor="#ff2f6d" stopOpacity=".38" />
            </radialGradient>
          </defs>

          <circle r="188" className="rx-spin-rev" stroke="#7c92b4" strokeWidth="1.4" strokeDasharray="0.8 5.2" opacity=".7" fill="none" />
          <g className="rx-spin-slow" fill="none">
            <circle r="170" stroke="#a7bddc" strokeWidth="8" strokeDasharray="1 6.6" opacity=".5" />
            <circle r="170" stroke="#ff3b5c" strokeWidth="8" strokeDasharray="2.2 51" />
            <circle r="179" stroke="#fff" strokeWidth="5" strokeDasharray="4 118" opacity=".9" />
          </g>
          <g className="rx-spin-rev-med" fill="none">
            <circle r="149" stroke="#fff" strokeWidth="3" strokeDasharray="118 40 60 72 92 52" />
            <circle r="157" stroke="#ff4d6e" strokeWidth="1.2" strokeDasharray="30 120" opacity=".8" />
          </g>
          <path d="M -61 143 A 156 156 0 0 0 88 129" className="rx-red-arc" fill="none" />

          <g className="rx-main-ring" fill="none">
            <circle r="124" className="rx-hot" strokeWidth="13" />
            <circle r="124" stroke="#ff7aa1" strokeWidth="4.5" />
            <circle r="113" stroke="#ffe5ec" strokeWidth="1.6" />
            <circle r="134" className="rx-hot" strokeWidth="1.2" opacity=".75" />
          </g>
          <circle r="106" fill="url(#rx-core)" />

          <g stroke="#ffc4d2" strokeWidth="1" opacity=".85" fill="none">
            <line x1="0" y1="-152" x2="0" y2="-96" />
            <line x1="0" y1="96" x2="0" y2="152" />
            <path d="M -34 -90 A 96 96 0 0 1 34 -90" strokeWidth="2.2" opacity=".8" />
            <path d="M -34 90 A 96 96 0 0 0 34 90" strokeWidth="2.2" opacity=".8" />
          </g>

          <g className="rx-corners" stroke="#fff" strokeWidth="2.6" strokeLinecap="round">
            {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) => (
              <g key={`${sx}${sy}`} transform={`translate(${sx * 176} ${sy * 176}) rotate(${sx * sy > 0 ? 45 : -45})`}>
                <line x1="-7" y1="-3.2" x2="7" y2="-3.2" />
                <line x1="-7" y1="3.2" x2="7" y2="3.2" />
              </g>
            ))}
          </g>

          <g className="rx-wordmark">
            <text x="0" y="22" textAnchor="middle" className="rx-word-glow" textLength={name.length > 5 ? 168 : 154} lengthAdjust="spacingAndGlyphs">{name}</text>
            <g filter="url(#rx-grunge)">
              <text x="0" y="22" textAnchor="middle" className="rx-word" textLength={name.length > 5 ? 168 : 154} lengthAdjust="spacingAndGlyphs">{name}</text>
            </g>
            <g fill="#fff">
              {splatter.map((dot) => <circle key={dot.key} cx={dot.x} cy={dot.y} r={dot.r} opacity={dot.o} />)}
            </g>
            <path d="M -86 -16 L -60 -22 M 62 30 L 90 24" stroke="#fff" strokeWidth="1.6" opacity=".7" fill="none" />
          </g>

          <g className="rx-voice" ref={barsRef} aria-hidden="true">
            <circle r="190" className="rx-ripple" />
            <circle r="190" className="rx-ripple" />
            <circle r="190" className="rx-ripple" />
            {Array.from({ length: BARS }, (_, index) => (
              <line key={index} x1="0" y1={-BAR_R} x2="0" y2={-BAR_R - 1.2} transform={`rotate(${((index / BARS) * 360).toFixed(2)})`} />
            ))}
          </g>

          <text x="0" y="205" textAnchor="middle" className="rx-micro">SYS 0001 // CORE {voice === "idle" ? "ONLINE" : voice.toUpperCase()}</text>
        </svg>
      </div>
    </div>
  );
}
