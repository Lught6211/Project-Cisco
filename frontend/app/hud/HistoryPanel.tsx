"use client";

import type { HistoryEntry } from "./types";

export default function HistoryPanel({ entries, onOpen, onDelete, onClose }: { entries: HistoryEntry[]; onOpen: (entry: HistoryEntry) => void; onDelete: (id: string) => void; onClose: () => void }) {
  return (
    <aside className="hx-history" aria-label="Research history">
      <header><span>HISTORY // {entries.length} REPORTS</span><button onClick={onClose} aria-label="Close history">×</button></header>
      {entries.length === 0 ? <p className="hx-history-empty">NO REPORTS YET. ASK CISCO TO RESEARCH SOMETHING.</p> : (
        <ul>
          {entries.map((entry) => (
            <li key={entry.id}>
              <button className="hx-history-open" onClick={() => onOpen(entry)}>
                <b>{entry.title}</b>
                <small>{new Date(entry.at).toLocaleString([], { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).toUpperCase()} · {entry.blocks.length} BLOCKS · {entry.sources} SOURCES</small>
              </button>
              <button className="hx-history-del" onClick={() => onDelete(entry.id)} aria-label={`Delete ${entry.title}`}>×</button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
