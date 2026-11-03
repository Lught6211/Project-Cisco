import type { BlockContent, HistoryEntry } from "./types";

const KEY = "cisco.history.v1";
const LIMIT = 20;

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]).filter((entry) => entry && Array.isArray(entry.blocks)) : [];
  } catch {
    return [];
  }
}

export function storeHistory(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries.slice(0, LIMIT)));
  } catch { /* storage full or blocked: history just will not persist */ }
}

export function addHistory(entries: HistoryEntry[], title: string, blocks: BlockContent[], sources: number): HistoryEntry[] {
  return [{ id: `h-${Date.now()}`, title, at: Date.now(), blocks, sources }, ...entries.filter((entry) => entry.title !== title)].slice(0, LIMIT);
}
