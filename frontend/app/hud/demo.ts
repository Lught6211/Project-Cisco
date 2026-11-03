import type { BlockContent } from "./types";

const svgUri = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

/** Original line-art used only by the offline demo. */
const RACK_ART = svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 520"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0a1a33"/><stop offset="1" stop-color="#1a0a1f"/></linearGradient></defs><rect width="800" height="520" fill="url(#g)"/><g fill="none" stroke="#5ec8ff" stroke-width="2" opacity=".35">${Array.from({ length: 16 }, (_, i) => `<line x1="${i * 52}" y1="0" x2="${i * 52}" y2="520"/>`).join("")}${Array.from({ length: 11 }, (_, i) => `<line x1="0" y1="${i * 52}" x2="800" y2="${i * 52}"/>`).join("")}</g><g transform="translate(230 70)">${[0, 1, 2, 3, 4].map((i) => `<g transform="translate(0 ${i * 78})"><rect width="340" height="62" rx="4" fill="#07111f" stroke="#5ec8ff" stroke-width="2"/><rect x="16" y="22" width="150" height="6" fill="#5ec8ff" opacity=".55"/><rect x="16" y="36" width="96" height="6" fill="#5ec8ff" opacity=".3"/><circle cx="284" cy="31" r="6" fill="${i % 2 ? "#ff2f6d" : "#5dffb0"}"/><circle cx="308" cy="31" r="6" fill="#ffffff" opacity=".8"/></g>`).join("")}</g><text x="30" y="492" fill="#8fd4ff" font-family="monospace" font-size="18" letter-spacing="4">SAMPLE ART // SERVER RACK</text></svg>`);

const MESH_ART = svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 520"><rect width="800" height="520" fill="#06070f"/><g stroke="#ff2f6d" stroke-width="2" opacity=".7"><line x1="400" y1="260" x2="160" y2="110"/><line x1="400" y1="260" x2="640" y2="120"/><line x1="400" y1="260" x2="180" y2="410"/><line x1="400" y1="260" x2="650" y2="400"/><line x1="160" y1="110" x2="180" y2="410"/><line x1="640" y1="120" x2="650" y2="400"/></g><g fill="#06070f" stroke="#5ec8ff" stroke-width="3"><circle cx="160" cy="110" r="30"/><circle cx="640" cy="120" r="30"/><circle cx="180" cy="410" r="30"/><circle cx="650" cy="400" r="30"/></g><circle cx="400" cy="260" r="58" fill="#12040c" stroke="#ff2f6d" stroke-width="6"/><circle cx="400" cy="260" r="38" fill="none" stroke="#fff" stroke-width="2" opacity=".8"/><text x="30" y="492" fill="#8fd4ff" font-family="monospace" font-size="18" letter-spacing="4">SAMPLE ART // NETWORK MESH</text></svg>`);

export type DemoReport = { title: string; summary: string; sources: number; blocks: BlockContent[] };

export function demoReport(): DemoReport {
  const blocks: BlockContent[] = [
    {
      id: "demo-1", kind: "text", kicker: "TEXT // PREVIEW", title: "HOW THIS WALL WORKS",
      pages: [
        "This is a sample report. When you ask CISCO to research a topic, a research card tracks progress, the logo docks in the corner, and tiles arrive one at a time like this.",
        "Say 'Hey Cisco, research solid state batteries' or type it with the slash key. Real reports fill these tiles with sourced text, charts, figures and photos.",
      ],
    },
    {
      id: "demo-2", kind: "text", kicker: "TEXT // CONTROLS", title: "CONTROLS AT THE TOP RIGHT",
      pages: [
        "HISTORY reopens earlier reports. TIDY re-packs the wall. CLEAR VIEW wipes it. CAMERA and SCREEN add live video tiles.",
        "Drag any tile by its header. Click the dots to flip pages. The square at the corner expands a tile.",
      ],
    },
    { id: "demo-3", kind: "chart", kicker: "CHART // SAMPLE", title: "SAMPLE SERVER LOAD", chart: { labels: ["CPU", "MEM", "DISK", "NET"], values: [23, 41, 67, 12], unit: "PERCENT", caption: "Sample numbers for the layout preview. Not measured." } },
    { id: "demo-4", kind: "image", kicker: "IMAGE // SAMPLE", title: "SERVER RACK", image: { url: RACK_ART, caption: "Generated line art", credit: "CISCO demo" } },
    { id: "demo-5", kind: "chart", kicker: "CHART // SAMPLE", title: "SAMPLE RESPONSE TIME", chart: { labels: ["MON", "TUE", "WED", "THU", "FRI"], values: [120, 98, 143, 87, 76], unit: "MS", caption: "Sample numbers for the layout preview. Not measured." } },
    { id: "demo-6", kind: "figure", kicker: "FIGURE // SAMPLE", figure: { value: "99.9%", label: "SAMPLE AVAILABILITY", caption: "Illustrative value used to show the figure tile.", tag: "SAMPLE" } },
    { id: "demo-7", kind: "image", kicker: "IMAGE // SAMPLE", title: "NETWORK MESH", image: { url: MESH_ART, caption: "Generated line art", credit: "CISCO demo" } },
  ];
  return {
    title: "STATE OF THE LAB",
    summary: "Here is a sample briefing wall. Ask me to research anything and I will build one from real sources.",
    sources: 6,
    blocks,
  };
}
