"use client";

import { useEffect, useRef } from "react";
import type { Meter, VoicePhase } from "./useVoiceInput";
import type { SpeechProgress } from "./useSpeech";
import type { VoiceState } from "./types";
import { voiceBus } from "./voiceBus";

type Props = {
  visible: boolean;
  micOn: boolean;
  phase: VoicePhase;
  voice: VoiceState;
  engine: "browser" | "server";
  requireWake: boolean;
  onToggleWake: () => void;
  meter: Meter;
  transcript: string;
  reply: string;
  spoken: SpeechProgress;
  hint: string;
  typing: boolean;
  draft: string;
  busy: boolean;
  onToggleMic: () => void;
  onStartTyping: () => void;
  onStopTyping: () => void;
  onDraft: (value: string) => void;
  onSubmit: () => void;
};

const db = (value: number) => `${value <= -59.9 ? "-60.0" : value.toFixed(1)} dB`;
const BARS = 28;

/** Little live waveform next to the mic button: follows your voice while listening and CISCO's while speaking. */
function Wave({ voice, active }: { voice: VoiceState; active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const voiceRef = useRef(voice);
  useEffect(() => { voiceRef.current = voice; }, [voice]);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = 104;
    const height = 22;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    context.scale(ratio, ratio);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const heights = new Float32Array(BARS);
    let raf = 0;
    const draw = (now: number) => {
      const state = voiceRef.current;
      const level = state === "speaking" || state === "listening" ? voiceBus.level : 0;
      const thinking = state === "thinking";
      context.clearRect(0, 0, width, height);
      for (let index = 0; index < BARS; index += 1) {
        const phase = now / 1000;
        const wave = 0.5 + 0.5 * Math.sin(phase * 7 + index * 0.9) * Math.sin(phase * 2.3 + index * 0.35);
        const target = thinking
          ? 0.18 + 0.22 * (0.5 + 0.5 * Math.sin(phase * 5 - index * 0.55))
          : 0.06 + level * (0.35 + wave * 0.75);
        heights[index] += (target - heights[index]) * 0.35;
        const barHeight = Math.max(2, Math.min(height, heights[index] * height));
        context.fillStyle = state === "speaking" ? "#8fd6ff" : state === "thinking" ? "#c9a7ff" : "#ff4a78";
        context.globalAlpha = active ? 0.95 : 0.35;
        context.fillRect(index * (width / BARS), (height - barHeight) / 2, 2, barHeight);
      }
      raf = reduce ? 0 : requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return <canvas ref={canvasRef} className="hx-wave" aria-hidden="true" />;
}

const PHASE_LABEL: Record<VoicePhase, string> = { idle: "STANDBY", listening: "LISTENING", hearing: "HEARING YOU", transcribing: "GOT IT" };

/** Bottom-left strip: red level meter, LVL/PK readouts, mic button, voice state, then the live transcript line. */
export default function VoiceStrip(props: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (props.typing) inputRef.current?.focus(); }, [props.typing]);
  const width = Math.max(4, Math.min(100, ((props.meter.level + 60) / 60) * 100));
  const stateLabel = props.voice === "speaking" ? "SPEAKING" : props.voice === "thinking" ? "THINKING" : PHASE_LABEL[props.phase];
  const stateActive = props.micOn || props.voice === "speaking" || props.voice === "thinking";
  const karaoke = props.spoken.text === props.reply && props.voice === "speaking";
  const said = karaoke ? props.reply.slice(0, props.spoken.chars) : "";
  return (
    <div className={`hx-strip${props.visible ? " on" : ""}${props.micOn ? " live" : ""}`} data-voice={props.voice}>
      {props.reply && (
        <p className={`hx-reply${karaoke ? " karaoke" : ""}`} key={props.reply}>
          <b>CISCO ▸</b>{" "}
          {karaoke ? <><span className="said">{said}</span><span className="rest">{props.reply.slice(said.length)}</span></> : props.reply}
        </p>
      )}
      <div className="hx-strip-row">
        <div className="hx-meter" role="meter" aria-label="Microphone level" aria-valuemin={-60} aria-valuemax={0} aria-valuenow={Math.round(props.meter.level)}>
          <i className="hx-meter-bar" style={{ width: `${width}%` }} />
          <span className="hx-meter-cap" style={{ left: `calc(${width}% + 2px)` }} />
        </div>
        <span className="hx-readout"><small>LVL</small> {db(props.meter.level)}</span>
        <span className="hx-readout"><small>PK</small> {db(props.meter.peak)}</span>
        <button className={`hx-chip hx-mic${props.micOn ? " active" : ""}`} onClick={props.onToggleMic} aria-pressed={props.micOn}>{props.micOn ? "MUTE" : "MIC"}</button>
        <span className={`hx-state${stateActive ? " on" : ""}`} data-phase={props.voice !== "idle" ? props.voice : props.phase} aria-live="polite">
          <Wave voice={props.voice} active={stateActive} />
          <b>{stateLabel}</b>
        </span>
        {props.micOn && (
          <button className={`hx-chip hx-mini${props.requireWake ? " active" : ""}`} onClick={props.onToggleWake} aria-pressed={props.requireWake} title={props.requireWake ? "Only answers after you say Hey Cisco" : "Answers everything you say"}>
            WAKE {props.requireWake ? "ON" : "OFF"}
          </button>
        )}
        {props.typing ? (
          <form className="hx-type" onSubmit={(event) => { event.preventDefault(); props.onSubmit(); }}>
            <span aria-hidden="true">›</span>
            <input
              ref={inputRef}
              value={props.draft}
              disabled={props.busy}
              onChange={(event) => props.onDraft(event.target.value)}
              onBlur={() => { if (!props.draft.trim()) props.onStopTyping(); }}
              onKeyDown={(event) => { if (event.key === "Escape") props.onStopTyping(); }}
              placeholder="Ask CISCO to research, remember, or check the server..."
              aria-label="Type a command for CISCO"
              maxLength={600}
            />
          </form>
        ) : (
          <button className="hx-transcript" onClick={props.onStartTyping} title="Click or press / to type">
            {props.transcript || props.hint}
            <span className="hx-caret" aria-hidden="true" />
          </button>
        )}
      </div>
      {props.micOn && props.engine === "server" && <span className="hx-engine" aria-hidden="true">SERVER SPEECH</span>}
    </div>
  );
}
