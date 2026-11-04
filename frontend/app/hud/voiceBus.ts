/**
 * Shared, mutable voice signal. The microphone hook and the speech hook write to it every frame and the
 * reactor and the strip waveform read it in their own animation loops, so audio-reactive visuals never
 * cause React re-renders.
 */
export type VoiceMode = "idle" | "listening" | "thinking" | "speaking";

export const voiceBus: {
  /** 0..1, smoothed loudness of whatever is currently "talking": the user's mic or CISCO's voice. */
  level: number;
  mode: VoiceMode;
  /** Bumped on every spoken word so the reactor can fire a ripple. */
  beat: number;
} = { level: 0, mode: "idle", beat: 0 };
