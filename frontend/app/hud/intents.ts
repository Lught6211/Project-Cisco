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
