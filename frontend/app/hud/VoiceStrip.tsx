"use client";

import { useEffect, useRef } from "react";
import type { Meter } from "./useVoiceInput";

type Props = {
  visible: boolean;
  micOn: boolean;
  awake: boolean;
  meter: Meter;
  transcript: string;
  reply: string;
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

/** Bottom-left strip: red level meter, LVL/PK readouts, mic button, then the live transcript line. */
export default function VoiceStrip(props: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (props.typing) inputRef.current?.focus(); }, [props.typing]);
  const width = Math.max(4, Math.min(100, ((props.meter.level + 60) / 60) * 100));
  return (
    <div className={`hx-strip${props.visible ? " on" : ""}${props.micOn ? " live" : ""}`}>
      {props.reply && <p className="hx-reply" key={props.reply}><b>CISCO ▸</b> {props.reply}</p>}
      <div className="hx-strip-row">
        <div className="hx-meter" role="meter" aria-label="Microphone level" aria-valuemin={-60} aria-valuemax={0} aria-valuenow={Math.round(props.meter.level)}>
          <i className="hx-meter-bar" style={{ width: `${width}%` }} />
          <span className="hx-meter-cap" style={{ left: `calc(${width}% + 2px)` }} />
        </div>
        <span className="hx-readout"><small>LVL</small> {db(props.meter.level)}</span>
        <span className="hx-readout"><small>PK</small> {db(props.meter.peak)}</span>
        <button className={`hx-chip hx-mic${props.micOn ? " active" : ""}`} onClick={props.onToggleMic} aria-pressed={props.micOn}>{props.micOn ? "MUTE" : "MIC"}</button>
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
      {props.micOn && <span className="hx-wake" aria-hidden="true">{props.awake ? "LISTENING" : "SAY “HEY CISCO”"}</span>}
    </div>
  );
}
