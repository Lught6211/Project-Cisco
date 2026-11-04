"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { voiceBus } from "./voiceBus";

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
const WAKE_KEY = "cisco.wake.v1";

// Voice activity detection
const FRAME_MS = 66;
const SPEECH_FRAMES = 2; // about 130 ms above the threshold starts an utterance
const SILENCE_MS = 900; // this much quiet ends it
const MIN_SPEECH_MS = 280;
const MAX_UTTERANCE_MS = 24000;
const PREROLL_CHUNKS = 7; // about 0.6 s of audio kept from before speech was detected
const INTERIM_SETTLE_MS = 1500; // browser recognition that stops updating this long is treated as final
const RECOGNITION_GRACE_MS = 1500; // how long to wait for browser recognition before using server transcription
const TARGET_RATE = 16000;

export type Meter = { level: number; peak: number };
export type VoicePhase = "idle" | "listening" | "hearing" | "transcribing";

/** Mono 16 kHz, 16-bit WAV from raw microphone chunks. Every browser and the AI provider can read it. */
function encodeWav(chunks: Float32Array[], sampleRate: number): string {
  let length = 0;
  for (const chunk of chunks) length += chunk.length;
  const ratio = sampleRate / TARGET_RATE;
  const outLength = Math.max(1, Math.floor(length / ratio));
  const merged = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
  const pcm = new Int16Array(outLength);
  for (let index = 0; index < outLength; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(length, Math.max(start + 1, Math.floor((index + 1) * ratio)));
    let sum = 0;
    for (let cursor = start; cursor < end; cursor += 1) sum += merged[cursor];
    const sample = Math.max(-1, Math.min(1, sum / (end - start)));
    pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  const bytes = new Uint8Array(44 + pcm.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (position: number, value: string) => { for (let i = 0; i < value.length; i += 1) view.setUint8(position + i, value.charCodeAt(i)); };
  text(0, "RIFF"); view.setUint32(4, 36 + pcm.length * 2, true); text(8, "WAVE"); text(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, TARGET_RATE, true); view.setUint32(28, TARGET_RATE * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, "data"); view.setUint32(40, pcm.length * 2, true);
  for (let index = 0; index < pcm.length; index += 1) view.setInt16(44 + index * 2, pcm[index], true);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

/**
 * Microphone input for CISCO.
 *
 * - A live dB meter and a voice-activity detector decide when you start and stop talking.
 * - The browser's own speech recognition is used when it works (Chrome, Edge). Browsers that do not
 *   really support it (Opera, Firefox, desktop shells) fall back to `transcribe`, which sends the recorded
 *   utterance to the backend. Either way the utterance is sent about one second after you stop talking.
 * - By default everything you say goes to CISCO. Turn on the wake word to require "Hey Cisco".
 */
export function useVoiceInput({ onUtterance, paused, transcribe }: {
  onUtterance: (text: string) => void;
  paused: boolean;
  transcribe?: (audioBase64: string) => Promise<string>;
}) {
  const [enabled, setEnabled] = useState(false);
  const [recognitionSupported, setRecognitionSupported] = useState(true);
  const [engine, setEngine] = useState<"browser" | "server">("browser");
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [meter, setMeter] = useState<Meter>({ level: FLOOR_DB, peak: FLOOR_DB });
  const [interim, setInterim] = useState("");
  const [awake, setAwake] = useState(false);
  const [error, setError] = useState("");
  const [requireWake, setRequireWakeState] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const timerRef = useRef<number | null>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const wantedRef = useRef(false);
  const pausedRef = useRef(paused);
  const awakeUntilRef = useRef(0);
  const restartRef = useRef<number | null>(null);
  const onUtteranceRef = useRef(onUtterance);
  const transcribeRef = useRef(transcribe);
  const meterRef = useRef<Meter>({ level: FLOOR_DB, peak: FLOOR_DB });
  const requireWakeRef = useRef(false);
  const phaseRef = useRef<VoicePhase>("idle");

  // Voice activity state
  const noiseRef = useRef(-54);
  const voicedFramesRef = useRef(0);
  const inSpeechRef = useRef(false);
  const speechStartRef = useRef(0);
  const lastVoiceRef = useRef(0);
  const holdoffRef = useRef(0);
  const prerollRef = useRef<Float32Array[]>([]);
  const utteranceRef = useRef<Float32Array[]>([]);
  const sampleRateRef = useRef(48000);
  const resolveTimerRef = useRef<number | null>(null);
  const interimTimerRef = useRef<number | null>(null);
  const interimTextRef = useRef("");
  const lastSubmitRef = useRef(0);
  const recognitionHealthyRef = useRef(true);
  const heardResultRef = useRef(false);

  useEffect(() => { onUtteranceRef.current = onUtterance; }, [onUtterance]);
  useEffect(() => { transcribeRef.current = transcribe; }, [transcribe]);

  useEffect(() => {
    try {
      if (localStorage.getItem(WAKE_KEY) === "1") { requireWakeRef.current = true; setRequireWakeState(true); }
    } catch { /* storage blocked: wake word stays off */ }
  }, []);

  const setRequireWake = useCallback((value: boolean) => {
    requireWakeRef.current = value;
    setRequireWakeState(value);
    if (value) awakeUntilRef.current = Date.now() + AWAKE_WINDOW_MS;
    try { localStorage.setItem(WAKE_KEY, value ? "1" : "0"); } catch { /* ignore */ }
  }, []);

  const changePhase = useCallback((next: VoicePhase) => {
    if (phaseRef.current === next) return;
    phaseRef.current = next;
    setPhase(next);
  }, []);

  /** Final gate for every utterance, wherever the text came from. */
  const submit = useCallback((raw: string) => {
    const text = raw.replace(/\s+/g, " ").trim();
    if (text.replace(/[^\p{L}\p{N}]/gu, "").length < 2) return;
    const now = Date.now();
    if (requireWakeRef.current && !WAKE_WORD.test(text) && now >= awakeUntilRef.current) return;
    awakeUntilRef.current = now + AWAKE_WINDOW_MS;
    lastSubmitRef.current = now;
    interimTextRef.current = "";
    if (interimTimerRef.current !== null) window.clearTimeout(interimTimerRef.current);
    setInterim("");
    setAwake(true);
    onUtteranceRef.current(text);
  }, []);

  const startRecognition = useCallback(() => {
    if (!recognitionHealthyRef.current) return;
    const scope = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
    const Ctor = scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
    if (!Ctor) {
      recognitionHealthyRef.current = false;
      setRecognitionSupported(false);
      setEngine("server");
      return;
    }
    if (recognitionRef.current || pausedRef.current || !wantedRef.current) return;
    const recognition = new Ctor();
    recognition.lang = navigator.language || "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      if (pausedRef.current) return;
      heardResultRef.current = true;
      let interimText = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result[0]?.transcript ?? "";
        if (!result.isFinal) { interimText += text; continue; }
        // Ignore a final that repeats what a settled interim already sent a moment ago.
        if (Date.now() - lastSubmitRef.current < 1200) continue;
        submit(text);
        interimText = "";
      }
      interimTextRef.current = interimText.trim();
      setInterim(interimTextRef.current);
      if (interimTimerRef.current !== null) window.clearTimeout(interimTimerRef.current);
      if (interimTextRef.current) {
        // Some engines leave the last phrase "interim" for a long time. Treat it as final once it stops changing.
        interimTimerRef.current = window.setTimeout(() => {
          const pending = interimTextRef.current;
          if (pending && !pausedRef.current) submit(pending);
        }, INTERIM_SETTLE_MS);
      }
    };
    recognition.onerror = (event) => {
      if (event.error === "not-allowed") {
        wantedRef.current = false;
        setError("MIC BLOCKED - ALLOW MICROPHONE ACCESS");
      } else if (event.error === "network" || event.error === "service-not-allowed" || event.error === "language-not-supported") {
        // This browser cannot reach a speech service (common outside Chrome). Use server transcription instead.
        recognitionHealthyRef.current = false;
        setEngine("server");
      }
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setInterim("");
      if (wantedRef.current && !pausedRef.current && recognitionHealthyRef.current) {
        restartRef.current = window.setTimeout(startRecognition, 300);
      }
    };
    recognitionRef.current = recognition;
    try { recognition.start(); } catch { recognitionRef.current = null; }
  }, [submit]);

  const stopRecognition = useCallback(() => {
    if (restartRef.current !== null) window.clearTimeout(restartRef.current);
    if (interimTimerRef.current !== null) window.clearTimeout(interimTimerRef.current);
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onend = null;
      try { recognition.abort(); } catch { /* already stopped */ }
    }
    interimTextRef.current = "";
    setInterim("");
  }, []);

  /** An utterance just ended (about a second of quiet). Decide how its text gets produced. */
  const finishUtterance = useCallback((chunks: Float32Array[], startedAt: number) => {
    const runServerTranscription = async () => {
      const send = transcribeRef.current;
      if (!send || !wantedRef.current) { changePhase("listening"); return; }
      changePhase("transcribing");
      try {
        const text = await send(encodeWav(chunks, sampleRateRef.current));
        if (wantedRef.current && !pausedRef.current && text) submit(text);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message.toUpperCase().slice(0, 70) : "SPEECH SERVICE ERROR");
        window.setTimeout(() => setError(""), 5000);
      } finally {
        if (wantedRef.current) changePhase("listening");
      }
    };
    if (!recognitionHealthyRef.current) { void runServerTranscription(); return; }
    // Browser recognition is expected to deliver the text. Give it a moment; if it heard nothing at all, it is not working here.
    changePhase("transcribing");
    if (resolveTimerRef.current !== null) window.clearTimeout(resolveTimerRef.current);
    resolveTimerRef.current = window.setTimeout(() => {
      resolveTimerRef.current = null;
      if (lastSubmitRef.current >= startedAt) { changePhase("listening"); return; } // already sent
      const pending = interimTextRef.current;
      if (pending) { submit(pending); changePhase("listening"); return; }
      if (!heardResultRef.current) {
        recognitionHealthyRef.current = false;
        setEngine("server");
        stopRecognition();
        void runServerTranscription();
        return;
      }
      changePhase("listening");
    }, RECOGNITION_GRACE_MS);
  }, [changePhase, stopRecognition, submit]);

  const resetVad = useCallback(() => {
    inSpeechRef.current = false;
    voicedFramesRef.current = 0;
    utteranceRef.current = [];
    prerollRef.current = [];
  }, []);

  const stop = useCallback(() => {
    wantedRef.current = false;
    stopRecognition();
    if (resolveTimerRef.current !== null) window.clearTimeout(resolveTimerRef.current);
    resolveTimerRef.current = null;
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    processorRef.current?.disconnect();
    if (processorRef.current) processorRef.current.onaudioprocess = null;
    processorRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
    resetVad();
    meterRef.current = { level: FLOOR_DB, peak: FLOOR_DB };
    setMeter(meterRef.current);
    document.documentElement.style.setProperty("--mic-level", "0");
    if (voiceBus.mode === "listening") { voiceBus.mode = "idle"; voiceBus.level = 0; }
    setEnabled(false);
    setAwake(false);
    changePhase("idle");
  }, [changePhase, resetVad, stopRecognition]);

  const start = useCallback(async () => {
    if (wantedRef.current) return;
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("MIC UNAVAILABLE - NEEDS HTTPS OR LOCALHOST");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      streamRef.current = stream;
      const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const context = new AudioCtx();
      audioContextRef.current = context;
      sampleRateRef.current = context.sampleRate;
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);

      // Raw capture, so the utterance can be sent for transcription when the browser cannot do it.
      const processor = context.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (event) => {
        if (pausedRef.current || !wantedRef.current) return;
        const copy = new Float32Array(event.inputBuffer.getChannelData(0));
        if (inSpeechRef.current) {
          utteranceRef.current.push(copy);
        } else {
          prerollRef.current.push(copy);
          if (prerollRef.current.length > PREROLL_CHUNKS) prerollRef.current.shift();
        }
      };
      const mute = context.createGain();
      mute.gain.value = 0;
      source.connect(processor);
      processor.connect(mute);
      mute.connect(context.destination);
      processorRef.current = processor;

      const samples = new Float32Array(analyser.fftSize);
      noiseRef.current = -54;
      timerRef.current = window.setInterval(() => {
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (let index = 0; index < samples.length; index += 1) sum += samples[index] * samples[index];
        const db = Math.max(FLOOR_DB, Math.min(0, 20 * Math.log10(Math.max(Math.sqrt(sum / samples.length), 1e-5))));
        const previous = meterRef.current;
        const level = db > previous.level ? db : Math.max(db, previous.level - 3.2);
        const peak = db > previous.peak ? db : Math.max(FLOOR_DB, previous.peak - 0.5);
        meterRef.current = { level, peak };
        const normalized = (level - FLOOR_DB) / -FLOOR_DB;
        document.documentElement.style.setProperty("--mic-level", normalized.toFixed(3));
        if (voiceBus.mode === "idle" || voiceBus.mode === "listening") {
          voiceBus.mode = "listening";
          voiceBus.level += (Math.max(0, (level + 52) / 40) - voiceBus.level) * 0.35;
        }
        setMeter((shown) => (Math.abs(shown.level - level) > 0.4 || Math.abs(shown.peak - peak) > 0.4 ? { level, peak } : shown));

        // Voice activity detection
        const now = Date.now();
        if (pausedRef.current || now < holdoffRef.current) { resetVad(); return; }
        const threshold = Math.max(noiseRef.current + 9, -46);
        if (!inSpeechRef.current) {
          if (db < noiseRef.current + 6) noiseRef.current = Math.min(-38, Math.max(-62, noiseRef.current * 0.97 + db * 0.03));
          voicedFramesRef.current = db > threshold ? voicedFramesRef.current + 1 : 0;
          if (voicedFramesRef.current >= SPEECH_FRAMES) {
            inSpeechRef.current = true;
            speechStartRef.current = now - SPEECH_FRAMES * FRAME_MS;
            lastVoiceRef.current = now;
            utteranceRef.current = [...prerollRef.current];
            prerollRef.current = [];
            heardResultRef.current = false;
            if (resolveTimerRef.current !== null) { window.clearTimeout(resolveTimerRef.current); resolveTimerRef.current = null; }
            changePhase("hearing");
          }
          return;
        }
        if (db > threshold - 3) lastVoiceRef.current = now;
        if (now - lastVoiceRef.current > SILENCE_MS || now - speechStartRef.current > MAX_UTTERANCE_MS) {
          inSpeechRef.current = false;
          voicedFramesRef.current = 0;
          const chunks = utteranceRef.current;
          utteranceRef.current = [];
          if (lastVoiceRef.current - speechStartRef.current < MIN_SPEECH_MS) { changePhase("listening"); return; }
          finishUtterance(chunks, speechStartRef.current);
        }
      }, FRAME_MS);
      wantedRef.current = true;
      recognitionHealthyRef.current = true;
      awakeUntilRef.current = Date.now() + AWAKE_WINDOW_MS;
      setEnabled(true);
      setAwake(true);
      changePhase("listening");
      startRecognition();
    } catch (cause) {
      const denied = cause instanceof DOMException && (cause.name === "NotAllowedError" || cause.name === "SecurityError");
      setError(denied ? "MIC BLOCKED - ALLOW MICROPHONE ACCESS" : "NO MICROPHONE FOUND");
      stop();
    }
  }, [changePhase, finishUtterance, resetVad, startRecognition, stop]);

  const toggle = useCallback(() => { if (wantedRef.current) stop(); else void start(); }, [start, stop]);

  // Do not let CISCO hear its own voice: pause listening while it is thinking or speaking.
  useEffect(() => {
    pausedRef.current = paused;
    if (paused) {
      stopRecognition();
      resetVad();
      if (resolveTimerRef.current !== null) { window.clearTimeout(resolveTimerRef.current); resolveTimerRef.current = null; }
      if (wantedRef.current) changePhase("listening");
    } else if (wantedRef.current) {
      holdoffRef.current = Date.now() + 700; // let the tail of CISCO's voice die away
      awakeUntilRef.current = Date.now() + AWAKE_WINDOW_MS;
      startRecognition();
    }
  }, [changePhase, paused, resetVad, startRecognition, stopRecognition]);

  // The "awake" flag is only for the UI; let it lapse with the window.
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => setAwake(Date.now() < awakeUntilRef.current), 1000);
    return () => window.clearInterval(timer);
  }, [enabled]);

  useEffect(() => stop, [stop]);

  return { enabled, awake, phase, engine, recognitionSupported, requireWake, setRequireWake, meter, interim, error, start, stop, toggle, wakeWord: WAKE_WORD };
}
