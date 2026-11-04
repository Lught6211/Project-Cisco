"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { voiceBus } from "./voiceBus";

const FEMALE_VOICE_NAMES = ["samantha", "zira", "aria", "jenny", "michelle", "susan", "karen", "victoria", "hazel", "sonia", "libby", "natasha", "ava", "allison", "joanna", "kendra", "kimberly", "salli", "ivy", "google uk english female", "google us english"];

export type SpeechProgress = { text: string; chars: number };

/**
 * CISCO's voice: browser speech synthesis plus a voice envelope that drives the reactor while it talks.
 * Browsers do not expose the loudness of synthesized speech, so the envelope is built from syllable-rate
 * motion plus a pulse on every word boundary the browser reports (or on a steady word rhythm when it
 * reports none). `progress.chars` is how much of the text has been spoken, for the karaoke caption.
 */
export function useSpeech() {
  const [progress, setProgress] = useState<SpeechProgress>({ text: "", chars: 0 });
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const lockedRef = useRef(false);
  const frameRef = useRef(0);
  const runRef = useRef(0);

  const stopLoop = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
  }, []);

  /** Ease the voice level back to silence after speech ends. */
  const decay = useCallback(() => {
    stopLoop();
    const step = () => {
      voiceBus.level *= 0.86;
      if (voiceBus.level < 0.015) { voiceBus.level = 0; frameRef.current = 0; return; }
      frameRef.current = requestAnimationFrame(step);
    };
    frameRef.current = requestAnimationFrame(step);
  }, [stopLoop]);

  const cancel = useCallback(() => {
    runRef.current += 1;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    decay();
  }, [decay]);

  const speak = useCallback((text: string, handlers: { onStart: () => void; onEnd: () => void }) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      handlers.onEnd();
      return;
    }
    window.speechSynthesis.cancel();
    runRef.current += 1;
    const run = runRef.current;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = navigator.language || "en-US";
    utterance.volume = 1;
    setProgress({ text, chars: 0 });

    const chooseVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      if (!voices.length) return;
      const language = utterance.lang.toLowerCase();
      const sameLanguage = voices.filter((voice) => voice.lang.toLowerCase() === language);
      const english = voices.filter((voice) => voice.lang.toLowerCase().startsWith("en"));
      const candidates = sameLanguage.length ? sameLanguage : english;
      if (!lockedRef.current) {
        for (const name of FEMALE_VOICE_NAMES) {
          const match = candidates.find((voice) => voice.name.toLowerCase().includes(name));
          if (match) { voiceRef.current = match; break; }
        }
        voiceRef.current ??= candidates[0] ?? voices[0];
        lockedRef.current = true;
      }
      if (voiceRef.current) utterance.voice = voiceRef.current;
    };

    // Voice envelope + karaoke progress
    const startedAt = { value: 0 };
    let sawBoundary = false;
    let lastBeat = 0;
    let nextFakeBeat = 0;
    let spoken = 0;
    let reported = 0;
    const tick = (now: number) => {
      if (runRef.current !== run) return;
      const t = (now - startedAt.value) / 1000;
      if (!sawBoundary && now >= nextFakeBeat) {
        lastBeat = now;
        voiceBus.beat += 1;
        nextFakeBeat = now + 230 + Math.random() * 190;
        spoken = Math.min(text.length, spoken + 3 + Math.random() * 4);
      }
      const syllables = 0.5 + 0.5 * Math.sin(t * 11.3) * Math.sin(t * 4.1 + 1);
      const pulse = Math.exp(-(now - lastBeat) / 140);
      const target = Math.max(0, Math.min(1, 0.2 + 0.36 * syllables + 0.46 * pulse + (Math.random() - 0.5) * 0.08));
      voiceBus.level += (target - voiceBus.level) * 0.38;
      if (spoken - reported >= 2) { reported = spoken; setProgress({ text, chars: Math.floor(spoken) }); }
      frameRef.current = requestAnimationFrame(tick);
    };

    utterance.onstart = () => {
      if (runRef.current !== run) return;
      startedAt.value = performance.now();
      nextFakeBeat = startedAt.value;
      handlers.onStart();
      stopLoop();
      frameRef.current = requestAnimationFrame(tick);
    };
    utterance.onboundary = (event) => {
      if (runRef.current !== run || event.name === "sentence") return;
      sawBoundary = true;
      lastBeat = performance.now();
      voiceBus.beat += 1;
      spoken = Math.max(spoken, Math.min(text.length, event.charIndex + (event.charLength || 4)));
    };
    const finish = () => {
      if (runRef.current !== run) return;
      runRef.current += 1;
      setProgress({ text, chars: text.length });
      decay();
      handlers.onEnd();
    };
    utterance.onend = finish;
    utterance.onerror = finish;

    let queued = false;
    let waitTimer: number | undefined;
    const queue = () => {
      if (queued) return;
      queued = true;
      window.speechSynthesis.removeEventListener("voiceschanged", queue);
      if (waitTimer !== undefined) window.clearTimeout(waitTimer);
      chooseVoice();
      if (!window.speechSynthesis.getVoices().length) lockedRef.current = true;
      window.speechSynthesis.speak(utterance);
      // Some engines never report "start". Do not leave the interface frozen in "thinking".
      window.setTimeout(() => { if (runRef.current === run && startedAt.value === 0) utterance.onstart?.(new Event("start") as SpeechSynthesisEvent); }, 1400);
    };
    if (window.speechSynthesis.getVoices().length) queue();
    else {
      window.speechSynthesis.addEventListener("voiceschanged", queue);
      waitTimer = window.setTimeout(queue, 900);
    }
  }, [decay, stopLoop]);

  useEffect(() => () => { runRef.current += 1; stopLoop(); }, [stopLoop]);

  return { speak, cancel, progress };
}
