/** Plain-language routing for spoken or typed commands. Nothing here calls an AI. */

const RESEARCH = /\b(research|investigate|look\s?up|look into|dig into|deep[- ]dive|report on|briefing on|brief me on|find out about|tell me everything about|dashboard (?:of|on|for))\b/i;

const LEADING_NOISE = [
  /^(?:hey|hi|ok|okay)[ ,]+(?:cisco|sisco|sisko)\b[ ,:]*/i,
  /^(?:cisco|sisco|sisko)\b[ ,:]*/i,
  /^(?:um+|uh+|erm+)\b[ ,]*/i,
  /^(?:please[ ,]+)?(?:can|could|would|will) you[ ,]+(?:please[ ,]+)?/i,
  /^(?:please[ ,]+)?(?:i (?:want|need|would like) you to|go and|go ahead and)[ ,]+/i,
  /^(?:do|run|give me|make me|put together|build me|create)[ ,]+(?:me[ ,]+)?(?:an?[ ,]+)?(?:deep[- ]dive|report|brief(?:ing)?|dashboard|investigation|summary)[ ,]+(?:on|about|into|of|for)[ ,]+/i,
  /^(?:research|look up|lookup|investigate|find out about|find out|look into|dig into|tell me everything about|brief me on|report on)\b[ ,]*(?:on |about |into )?/i,
];

export function isResearchIntent(prompt: string) {
  return RESEARCH.test(prompt) && !/\bhologram\b/i.test(prompt);
}

export function topicFromPrompt(prompt: string) {
  let text = prompt.replace(/\b(?:um+|uh+|erm+)\b[ ,]*/gi, "").trim();
  for (let pass = 0; pass < 2; pass += 1) for (const pattern of LEADING_NOISE) text = text.replace(pattern, "").trim();
  text = text.replace(/[ ,]+(?:for me|please|thanks|thank you)\s*[.?!]*$/i, "");
  text = text.replace(/^(?:the|a|an)\s+(?=state of|history of|future of)/i, "");
  text = text.replace(/[?!.,;:\s]+$/, "").trim();
  return (text || prompt.trim()).slice(0, 120);
}

export function isDemoIntent(prompt: string) {
  return /^(?:hey cisco[ ,]+)?(?:(?:run|show|start|play)(?: me)?(?: the| a)? )?(?:demo|sample report|sample dashboard)(?: mode)?[.!?]*$/i.test(prompt.trim());
}

export type UiCommand = "clear" | "tidy" | "camera-on" | "camera-off" | "screen-on" | "screen-off" | "memory" | "history" | "log";

/** Short phrases that drive the dashboard itself, like "clear the screen" or "open the camera". */
export function uiCommand(prompt: string): UiCommand | null {
  const text = prompt.toLowerCase().replace(/[.!?,]/g, " ").replace(/\b(hey|ok|okay)?\s*cisco\b/g, " ").replace(/\b(please|can you|could you|just)\b/g, " ").replace(/\s+/g, " ").trim();
  if (/^(?:clear|wipe|reset|close everything)(?: the)?(?: view| screen| wall| display| board)?$/.test(text) || /^clear (?:all|everything)$/.test(text)) return "clear";
  if (/^(?:tidy|tidy up|arrange|organi[sz]e|clean up)(?: the)?(?: view| screen| wall| tiles| blocks)?$/.test(text)) return "tidy";
  if (/^(?:turn on|open|show|start)(?: the| my)? camera$/.test(text)) return "camera-on";
  if (/^(?:turn off|close|hide|stop)(?: the| my)? camera$/.test(text)) return "camera-off";
  if (/^(?:share|show|start)(?: my| the)? screen$/.test(text) || /^start screen share$/.test(text)) return "screen-on";
  if (/^(?:stop|end|close)(?: my| the)? screen(?: share| sharing)?$/.test(text)) return "screen-off";
  if (/^(?:open|show|go to)(?: the)? memory(?: graph| field| map)?$/.test(text)) return "memory";
  if (/^(?:open|show)(?: the)? history$/.test(text)) return "history";
  if (/^(?:open|show)(?: the)? (?:log|chat|conversation)$/.test(text)) return "log";
  return null;
}

export type VisionRequest = {
  camera: boolean;
  screen: boolean;
  /** "what do you see" with no source named: use whatever is live, or open the camera. */
  generic: boolean;
  /** "what is this" style questions: only treated as vision when a camera or screen feed is already on. */
  weak: boolean;
};

const SEE = /\b(see|looking at|look at|watch|watching|view|check|read|describe|identify|recogni[sz]e|show)\b/i;
const SCREEN = /\b(screen|display|monitor|desktop)\b/i;
const CAMERA_DIRECT = /\b(see me|look at me|watch me|view me|check me out|how do i look|what am i (?:holding|wearing|doing)|what i(?:'m| am) (?:holding|wearing|doing)|in front of you)\b/i;
const CAMERA_PART = /\bmy (?:face|room|hand|hands|desk|outfit|shirt|hair|background|setup)\b/i;
const CAMERA_WORD = /\b(camera|webcam)\b/i;
const GENERIC = /\b(what do you see|what can you see|can you see|do you see|look at (?:this|that|me)|take a look|have a look)\b/i;
const WEAK = /\b(what(?:'s| is) (?:this|that)|what am i (?:holding|wearing|doing)|how do i look)\b/i;

/** Does this request need CISCO to look at the camera or the shared screen? */
export function visionIntent(prompt: string): VisionRequest | null {
  const text = prompt.trim();
  if (!text || text.length > 200) return null;
  const generic = GENERIC.test(text);
  const weak = WEAK.test(text);
  const screen = SCREEN.test(text) && (SEE.test(text) || /\bwhat(?:'s| is)\b/i.test(text));
  const camera = CAMERA_DIRECT.test(text) || ((CAMERA_PART.test(text) || CAMERA_WORD.test(text)) && SEE.test(text));
  if (!screen && !camera && !generic && !weak) return null;
  return { camera, screen, generic: generic && !screen && !camera, weak: weak && !screen && !camera && !generic };
}
