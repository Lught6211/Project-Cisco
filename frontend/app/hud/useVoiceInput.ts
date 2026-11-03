"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* The Web Speech API is not in TypeScript's DOM typings, so describe the little we use. */
type RecognitionAlternative = { transcript: string };
type RecognitionResult = { isFinal: boolean; length: number; [index: number]: RecognitionAlternative };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

const WAKE_WORD = /\b(?:(?:hey|hi|ok|okay)[ ,]+)?(?:cisco|sisco|sysco|cisko|sisko|disco)\b[ ,:.!?]*/i;
const AWAKE_WINDOW_MS = 25000;
const FLOOR_DB = -60;

export type Meter = { level: number; peak: number };

/**
 * Microphone level meter (dB) plus continuous speech recognition with a wake word.
 * Saying "Hey Cisco ..." wakes CISCO; follow-ups within 25 seconds do not need the wake word again.
 * Browsers without speech recognition (Firefox) still get the live meter.
 */
export function useVoiceInput({ onUtterance, paused }: { onUtterance: (text: string) => void; paused: boolean }) {
  const [enabled, setEnabled] = useState(false);
  const [recognitionSupported, setRecognitionSupported] = useState(true);
  const [meter, setMeter] = useState<Meter>({ level: FLOOR_DB, peak: FLOOR_DB });
  const [interim, setInterim] = useState("");
  const [awake, setAwake] = useState(false);
  const [error, setError] = useState("");

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const wantedRef = useRef(false);
  const pausedRef = useRef(paused);
  const awakeUntilRef = useRef(0);
  const restartRef = useRef<number | null>(null);
  const onUtteranceRef = useRef(onUtterance);
  const meterRef = useRef<Meter>({ level: FLOOR_DB, peak: FLOOR_DB });

  useEffect(() => { onUtteranceRef.current = onUtterance; }, [onUtterance]);

  const startRecognition = useCallback(() => {
    const scope = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
    const Ctor = scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
    if (!Ctor) {
      setRecognitionSupported(false);
      return;
    }
    if (recognitionRef.current || pausedRef.current || !wantedRef.current) return;
    const recognition = new Ctor();
    recognition.lang = navigator.language || "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      if (pausedRef.current) return;
      let interimText = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result[0]?.transcript ?? "";
        if (!result.isFinal) {
          interimText += text;
          continue;
        }
        const spoken = text.trim();
        if (!spoken) continue;
        const now = Date.now();
        const hasWake = WAKE_WORD.test(spoken);
        if (hasWake || now < awakeUntilRef.current) {
          awakeUntilRef.current = now + AWAKE_WINDOW_MS;
          setAwake(true);
          onUtteranceRef.current(spoken);
        }
      }
      setInterim(interimText.trim());
    };
    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        wantedRef.current = false;
        setError("MIC BLOCKED - ALLOW MICROPHONE ACCESS");
      } else if (event.error === "network") {
        setError("SPEECH SERVICE OFFLINE - TYPE WITH /");
      }
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setInterim("");
      if (wantedRef.current && !pausedRef.current) {
        restartRef.current = window.setTimeout(startRecognition, 300);
      }
    };
    recognitionRef.current = recognition;
    try { recognition.start(); } catch { recognitionRef.current = null; }
  }, []);

  const stopRecognition = useCallback(() => {
    if (restartRef.current !== null) window.clearTimeout(restartRef.current);
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onend = null;
      try { recognition.abort(); } catch { /* already stopped */ }
    }
    setInterim("");
  }, []);

  const stop = useCallback(() => {
    wantedRef.current = false;
    stopRecognition();
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
    meterRef.current = { level: FLOOR_DB, peak: FLOOR_DB };
    setMeter(meterRef.current);
    document.documentElement.style.setProperty("--mic-level", "0");
    setEnabled(false);
    setAwake(false);
  }, [stopRecognition]);

  const start = useCallback(async () => {
    if (wantedRef.current) return;
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("MIC UNAVAILABLE - NEEDS HTTPS OR LOCALHOST");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const context = new AudioCtx();
      audioContextRef.current = context;
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      timerRef.current = window.setInterval(() => {
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (let index = 0; index < samples.length; index += 1) sum += samples[index] * samples[index];
        const db = Math.max(FLOOR_DB, Math.min(0, 20 * Math.log10(Math.max(Math.sqrt(sum / samples.length), 1e-5))));
        const previous = meterRef.current;
        const level = db > previous.level ? db : Math.max(db, previous.level - 3.2);
        const peak = db > previous.peak ? db : Math.max(FLOOR_DB, previous.peak - 0.5);
        meterRef.current = { level, peak };
        document.documentElement.style.setProperty("--mic-level", ((level - FLOOR_DB) / -FLOOR_DB).toFixed(3));
        setMeter((shown) => (Math.abs(shown.level - level) > 0.4 || Math.abs(shown.peak - peak) > 0.4 ? { level, peak } : shown));
      }, 66);
      wantedRef.current = true;
      awakeUntilRef.current = Date.now() + AWAKE_WINDOW_MS;
      setEnabled(true);
      setAwake(true);
      startRecognition();
    } catch (cause) {
      const denied = cause instanceof DOMException && (cause.name === "NotAllowedError" || cause.name === "SecurityError");
      setError(denied ? "MIC BLOCKED - ALLOW MICROPHONE ACCESS" : "NO MICROPHONE FOUND");
      stop();
    }
  }, [startRecognition, stop]);

  const toggle = useCallback(() => { if (wantedRef.current) stop(); else void start(); }, [start, stop]);

  // Do not let CISCO hear its own voice: pause recognition while it is thinking or speaking.
  useEffect(() => {
    pausedRef.current = paused;
    if (paused) stopRecognition();
    else if (wantedRef.current) {
      awakeUntilRef.current = Date.now() + AWAKE_WINDOW_MS;
      startRecognition();
    }
  }, [paused, startRecognition, stopRecognition]);

  // The "awake" flag is only for the UI; let it lapse with the window.
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => setAwake(Date.now() < awakeUntilRef.current), 1000);
    return () => window.clearInterval(timer);
  }, [enabled]);

  useEffect(() => stop, [stop]);

  return { enabled, awake, recognitionSupported, meter, interim, error, start, stop, toggle, wakeWord: WAKE_WORD };
}
