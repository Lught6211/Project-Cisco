import type { BlockContent, BlockKind, HudBlock } from "./types";

export const GAP = 12;
export const ROWS = 9;

type Rect = { x: number; y: number; w: number; h: number };
type Size = { w: number; h: number };

/** Tile sizes (in grid cells) for each screen width tier. Photos and video take half the wall, on the right. */
const SIZES: Record<12 | 8 | 4, Record<BlockKind, Size>> = {
  12: { text: { w: 3, h: 3 }, chart: { w: 3, h: 3 }, figure: { w: 3, h: 2 }, image: { w: 6, h: 3 }, video: { w: 6, h: 4 }, camera: { w: 3, h: 3 }, screen: { w: 6, h: 4 }, server: { w: 4, h: 4 } },
  8: { text: { w: 4, h: 3 }, chart: { w: 4, h: 3 }, figure: { w: 4, h: 2 }, image: { w: 4, h: 3 }, video: { w: 8, h: 4 }, camera: { w: 4, h: 3 }, screen: { w: 8, h: 4 }, server: { w: 4, h: 4 } },
  4: { text: { w: 4, h: 3 }, chart: { w: 4, h: 3 }, figure: { w: 4, h: 2 }, image: { w: 4, h: 3 }, video: { w: 4, h: 3 }, camera: { w: 4, h: 3 }, screen: { w: 4, h: 3 }, server: { w: 4, h: 4 } },
};

export function columnsFor(width: number) {
  if (width >= 1000) return 12;
  if (width >= 640) return 8;
  return 4;
}

function fits(rect: Rect, taken: Rect[], cols: number) {
  if (rect.x < 0 || rect.x + rect.w > cols) return false;
  return !taken.some((other) => rect.x < other.x + other.w && other.x < rect.x + rect.w && rect.y < other.y + other.h && other.y < rect.y + rect.h);
}

function sizeFor(content: BlockContent, cols: number, imageIndex: number, shrink = 0): Size {
  const tier = cols >= 12 ? 12 : cols >= 8 ? 8 : 4;
  const base = { ...SIZES[tier][content.kind] };
  // After the first two big photos, extra photos become smaller tiles so the wall stays dense.
  if (content.kind === "image" && imageIndex >= 2 && tier === 12) { base.w = 3; base.h = 2; }
  if (shrink && base.h > 2 && content.kind !== "server") base.h = Math.max(2, base.h - shrink);
  return base;
}

/** Find the first free spot. Photos and video fill from the right edge, like a briefing wall. */
export function findSpot(taken: Rect[], size: { w: number; h: number }, cols: number, fromRight: boolean): { x: number; y: number } {
  for (let y = 0; y < 60; y += 1) {
    const xs = Array.from({ length: cols - size.w + 1 }, (_, index) => (fromRight ? cols - size.w - index : index));
    for (const x of xs) if (fits({ x, y, w: size.w, h: size.h }, taken, cols)) return { x, y };
  }
  return { x: 0, y: 0 };
}

/**
 * Pick the size and spot for one block. A second big photo that would drop two or more rows below an
 * open hole gets a narrower 3-column size instead, so the wall stays dense like a real briefing wall.
 */
function choose(taken: Rect[], content: BlockContent, cols: number, imageIndex: number, shrink: number) {
  const size = sizeFor(content, cols, imageIndex, shrink);
  const fromRight = cols >= 12 && (content.kind === "image" || content.kind === "video" || content.kind === "screen");
  const rightEdge = cols >= 8 && (content.kind === "image" || content.kind === "video" || content.kind === "screen");
  const spot = findSpot(taken, size, cols, rightEdge);
  if (fromRight && content.kind === "image" && size.w > 3) {
    const narrow = { w: 3, h: size.h };
    const narrowSpot = findSpot(taken, narrow, cols, rightEdge);
    if (narrowSpot.y + 2 <= spot.y) return { size: narrow, spot: narrowSpot };
  }
  return { size, spot };
}

export function placeBlock(existing: HudBlock[], content: BlockContent, cols: number, reserved: Rect[] = []): HudBlock {
  const imageIndex = existing.filter((block) => block.kind === "image").length;
  const { size, spot } = choose([...existing, ...reserved], content, cols, imageIndex, 0);
  const top = existing.reduce((max, block) => Math.max(max, block.z), 1);
  const seq = existing.reduce((max, block) => Math.max(max, block.seq), 0) + 1;
  return { ...content, ...spot, ...size, z: top + 1, seq };
}

/** Re-pack every block: photos right, text left, keeping reserved regions (the docked logo) clear. Used by TIDY. */
export function tidyBlocks(blocks: HudBlock[], cols: number, reserved: Rect[] = [], shrink = 0): HudBlock[] {
  const order = [...blocks].sort((a, b) => a.seq - b.seq);
  const placed: HudBlock[] = [];
  let imageIndex = 0;
  for (const block of order) {
    const content: BlockContent = block;
    const { size, spot } = choose([...reserved, ...placed], content, cols, imageIndex, shrink);
    if (block.kind === "image") imageIndex += 1;
    placed.push({ ...block, ...spot, ...size });
  }
  return placed;
}

/** If the wall is taller than the screen, re-pack with shorter tall tiles (down to 2 rows) so everything stays visible. */
export function fitRows(blocks: HudBlock[], cols: number, reserved: Rect[] = []): HudBlock[] {
  const bottomOf = (list: HudBlock[]) => list.reduce((max, block) => Math.max(max, block.y + block.h), 0);
  if (bottomOf(blocks) <= ROWS || cols < 8) return blocks;
  let packed = blocks;
  for (let shrink = 0; shrink <= 2; shrink += 1) {
    packed = tidyBlocks(blocks, cols, reserved, shrink);
    if (bottomOf(packed) <= ROWS) break;
  }
  return packed;
}

/** Where the docked logo sits, in grid cells, so tiles leave it clear. */
export function dockRect(cols: number): Rect[] {
  return cols >= 8 ? [{ x: cols - 2, y: ROWS - 2, w: 2, h: 2 }] : [];
}

export function rectToStyle(block: Rect, metrics: { cellW: number; cellH: number }) {
  return {
    left: block.x * (metrics.cellW + GAP),
    top: block.y * (metrics.cellH + GAP),
    width: block.w * metrics.cellW + (block.w - 1) * GAP,
    height: block.h * metrics.cellH + (block.h - 1) * GAP,
  };
}
