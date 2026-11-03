export type VoiceState = "idle" | "listening" | "thinking" | "speaking";

export type BlockKind = "text" | "chart" | "figure" | "image" | "video" | "camera" | "screen" | "server";

/** Content a block carries. Research results arrive from the backend in this shape. */
export type BlockContent = {
  id: string;
  kind: BlockKind;
  kicker?: string;
  title?: string;
  pages?: string[];
  chart?: { labels: string[]; values: number[]; unit?: string; caption?: string };
  figure?: { value: string; label: string; caption?: string; tag?: string };
  image?: { url: string; caption?: string; credit?: string };
  video?: { url: string; caption?: string };
  source?: string;
};

/** A block placed on the dashboard grid (units are grid cells). */
export type HudBlock = BlockContent & { x: number; y: number; w: number; h: number; z: number; seq: number };

/** Shape returned by the backend's /api/research/{id} endpoint for each block. */
export type ResearchBlockPayload = {
  id: string;
  type: "text" | "chart" | "figure" | "image";
  kicker?: string;
  title?: string;
  pages?: string[];
  chart?: { labels: string[]; values: number[]; unit?: string; caption?: string } | null;
  figure?: { value: string; label: string; caption?: string; tag?: string } | null;
  image?: { url: string; caption?: string; credit?: string } | null;
  source?: string;
};

export type ResearchJobPayload = {
  id: string;
  topic: string;
  title: string;
  status: "running" | "done" | "error";
  stage: string;
  progress: number;
  blocks: ResearchBlockPayload[];
  sources: { title: string; url: string; snippet?: string }[];
  summary: string;
  provider: string;
  error: string;
  memory_node_id: string;
};

export type ResearchCardState = {
  title: string;
  stage: string;
  progress: number;
  blocks: number;
  sources: number;
  startedAt: number;
  status: "running" | "done" | "error";
  error?: string;
};

export type HistoryEntry = { id: string; title: string; at: number; blocks: BlockContent[]; sources: number };

export function toBlockContent(payload: ResearchBlockPayload): BlockContent {
  return {
    id: payload.id,
    kind: payload.type,
    kicker: payload.kicker || undefined,
    title: payload.title || undefined,
    pages: payload.pages?.length ? payload.pages : undefined,
    chart: payload.chart ?? undefined,
    figure: payload.figure ?? undefined,
    image: payload.image ?? undefined,
    source: payload.source || undefined,
  };
}
