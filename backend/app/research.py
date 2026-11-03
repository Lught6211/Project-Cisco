"""Research jobs for the CISCO HUD.

A job gathers free web sources (Wikipedia, Wikimedia Commons, DuckDuckGo), then turns
them into *blocks* - text, chart, figure and image tiles - that the dashboard lays out
one by one while the research card shows progress. When an AI provider is configured it
writes the blocks (only from the gathered sources); otherwise a source-based fallback
builds a plain report so the feature still works with no API key.
"""
from __future__ import annotations

import html
import json
import logging
import re
import secrets
import time
from typing import Any, Literal
from urllib.parse import quote
from urllib.request import Request, urlopen

from pydantic import BaseModel, Field

from .web import SearchResult, search_duckduckgo, search_wikipedia

logger = logging.getLogger("CiscoResearch")

USER_AGENT = "Project-Cisco/0.2 (local research agent; https://github.com/Lught6211/Project-Cisco)"
HTTP_TIMEOUT = 8
MAX_JOBS = 40
MAX_BLOCKS = 9


class ChartData(BaseModel):
    labels: list[str]
    values: list[float]
    unit: str = ""
    caption: str = ""


class FigureData(BaseModel):
    value: str
    label: str
    caption: str = ""
    tag: str = "FACT"


class ImageData(BaseModel):
    url: str
    caption: str = ""
    credit: str = ""


class ResearchBlock(BaseModel):
    id: str
    type: Literal["text", "chart", "figure", "image"]
    kicker: str = ""
    title: str = ""
    pages: list[str] = Field(default_factory=list)
    chart: ChartData | None = None
    figure: FigureData | None = None
    image: ImageData | None = None
    source: str = ""


class ResearchJob(BaseModel):
    id: str
    topic: str
    title: str
    status: Literal["running", "done", "error"] = "running"
    stage: str = "STARTING RESEARCH AGENT"
    progress: float = 0.0
    started_at: float
    finished_at: float | None = None
    blocks: list[ResearchBlock] = Field(default_factory=list)
    sources: list[SearchResult] = Field(default_factory=list)
    summary: str = ""
    provider: str = ""
    error: str = ""
    memory_node_id: str = ""


JOBS: dict[str, ResearchJob] = {}


# --------------------------------------------------------------------------- helpers

_LEADING_NOISE = [
    r"^(?:hey|hi|ok|okay)[ ,]+(?:cisco|sisko)\b[ ,:]*",
    r"^(?:cisco|sisko)\b[ ,:]*",
    r"^(?:um+|uh+|erm+)\b[ ,]*",
    r"^(?:please[ ,]+)?(?:can|could|would|will) you[ ,]+(?:please[ ,]+)?",
    r"^(?:please[ ,]+)?(?:i (?:want|need|would like) you to|go and|go ahead and)[ ,]+",
    r"^(?:do|run|give me|make me|put together|build me|create)[ ,]+(?:me[ ,]+)?(?:an?[ ,]+)?(?:deep[- ]dive|report|brief(?:ing)?|dashboard|investigation|summary)[ ,]+(?:on|about|into|of|for)[ ,]+",
    r"^(?:research|look up|lookup|investigate|find out about|find out|look into|dig into|tell me everything about|brief me on|report on)\b[ ,]*(?:on |about |into )?",
]
_TRAILING_NOISE = r"[ ,]+(?:for me|please|thanks|thank you)\s*[.?!]*$"


def clean_topic(raw: str) -> str:
    """Turn 'Hey Cisco, can you research the state of VR for me?' into 'state of VR'."""
    text = re.sub(r"\b(?:um+|uh+|erm+)\b[ ,]*", "", raw.strip(), flags=re.I)
    for _ in range(2):  # a second pass catches "hey cisco, can you ..." stacked prefixes
        for pattern in _LEADING_NOISE:
            text = re.sub(pattern, "", text, flags=re.I).strip()
    text = re.sub(_TRAILING_NOISE, "", text, flags=re.I)
    text = re.sub(r"^(?:the|a|an)\s+(?=state of|history of|future of)", "", text, flags=re.I)
    text = re.sub(r"[?!.,;:\s]+$", "", text).strip()
    return (text or raw.strip())[:120]


def display_title(topic: str) -> str:
    return re.sub(r"\s+", " ", topic).strip().upper()[:44]


def _get_json(url: str, timeout: float = HTTP_TIMEOUT) -> Any:
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def _strip_tags(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", html.unescape(text or ""))).strip()


def _sentences(text: str) -> list[str]:
    return [piece.strip() for piece in re.split(r"(?<=[.!?])\s+(?=[A-Z0-9\"'(])", text) if piece.strip()]


def paginate(text: str, size: int = 360, limit: int = 3) -> list[str]:
    """Split long text into short pages on sentence boundaries."""
    pages: list[str] = []
    current = ""
    for sentence in _sentences(text):
        if current and len(current) + len(sentence) + 1 > size:
            pages.append(current)
            current = sentence
        else:
            current = f"{current} {sentence}".strip()
        if len(pages) >= limit:
            break
    if current and len(pages) < limit:
        pages.append(current)
    return [page[: size + 120] for page in pages if page]


# ------------------------------------------------------------------------- web fetch

def wiki_extract(title: str, chars: int = 3200) -> dict[str, str]:
    """Plain-text article text plus lead image for one Wikipedia page."""
    url = (
        "https://en.wikipedia.org/w/api.php?action=query&prop=extracts%7Cpageimages%7Cinfo&inprop=url"
        f"&explaintext=1&exsectionformat=plain&exchars={chars}&piprop=original&redirects=1"
        f"&titles={quote(title)}&format=json&formatversion=2"
    )
    data = _get_json(url)
    pages = data.get("query", {}).get("pages", [])
    if not pages or pages[0].get("missing"):
        return {}
    page = pages[0]
    return {
        "title": str(page.get("title", title)),
        "text": re.sub(r"\n{2,}", "\n", str(page.get("extract", ""))).strip(),
        "url": str(page.get("fullurl", f"https://en.wikipedia.org/wiki/{quote(title.replace(' ', '_'))}")),
        "image": str(page.get("original", {}).get("source", "")),
    }


def commons_images(query: str, limit: int = 4) -> list[ImageData]:
    """Openly licensed photos from Wikimedia Commons, with credit lines."""
    url = (
        "https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6"
        f"&gsrlimit={limit * 3}&gsrsearch={quote(query + ' filetype:bitmap')}"
        "&prop=imageinfo&iiprop=url%7Cmime%7Cextmetadata&iiurlwidth=900&format=json&formatversion=2"
    )
    data = _get_json(url)
    images: list[ImageData] = []
    for page in sorted(data.get("query", {}).get("pages", []), key=lambda item: item.get("index", 99)):
        info = (page.get("imageinfo") or [{}])[0]
        if info.get("mime") not in ("image/jpeg", "image/png") or not info.get("thumburl"):
            continue
        meta = info.get("extmetadata", {})
        title = re.sub(r"^File:|\.[A-Za-z]{3,4}$", "", str(page.get("title", ""))).replace("_", " ")
        artist = _strip_tags(meta.get("Artist", {}).get("value", ""))[:40]
        licence = _strip_tags(meta.get("LicenseShortName", {}).get("value", ""))[:20]
        credit = " / ".join(part for part in (artist, licence, "Wikimedia Commons") if part)
        images.append(ImageData(url=info["thumburl"], caption=title[:90], credit=credit))
        if len(images) >= limit:
            break
    return images


# ----------------------------------------------------------------------- AI synthesis

SYSTEM_PROMPT = (
    "You are CISCO's research analyst. You turn gathered source material into a compact dashboard of 'blocks'. "
    "Use ONLY facts that appear in the provided sources. Never invent numbers, dates, names or quotes. "
    "If the sources do not contain enough numeric data for a chart or figure, leave that block out. "
    "Reply with a single JSON object and nothing else."
)


def build_prompt(topic: str, docs: list[dict[str, str]]) -> str:
    lines = [f"RESEARCH TOPIC: {topic}", "", "SOURCES:"]
    for index, doc in enumerate(docs, start=1):
        lines.append(f"[{index}] {doc['title']} - {doc['url']}\n{doc['text'][:2400]}\n")
    lines.append(
        """Return JSON in exactly this shape:
{
  "summary": "two short spoken sentences telling the user what you found",
  "blocks": [
    {"type": "text", "kicker": "SHORT LABEL", "title": "HEADLINE", "pages": ["paragraph under 340 chars", "optional second paragraph"], "source": 1},
    {"type": "chart", "kicker": "SHORT LABEL", "title": "WHAT IS COMPARED", "labels": ["A", "B", "C"], "values": [3, 2, 1], "unit": "unit or empty", "caption": "one sentence naming the source and caveats", "source": 2},
    {"type": "figure", "kicker": "YEAR OR CATEGORY", "value": "short value such as 20m or 4.2%", "label": "what the number measures", "caption": "context and caveats", "source": 1}
  ]
}
Rules: 4 to 7 blocks; at least 3 text blocks; add a chart only when a source lists 3 or more comparable numbers (max 6 bars, labels under 14 chars); add a figure only for one standout number that is stated in a source; headlines under 48 chars; every block cites a source number."""
    )
    return "\n".join(lines)


def parse_json_object(raw: str) -> dict[str, Any] | None:
    text = raw.strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.I)
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        value = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


def _num(value: Any) -> float | None:
    try:
        number = float(str(value).replace(",", "").replace("%", "").strip())
    except (TypeError, ValueError):
        return None
    return number if number == number and abs(number) < 1e15 else None


def blocks_from_ai(payload: dict[str, Any], docs: list[dict[str, str]]) -> tuple[str, list[ResearchBlock]]:
    """Validate AI output so a malformed answer can never crash the dashboard."""
    blocks: list[ResearchBlock] = []
    for item in payload.get("blocks", []) if isinstance(payload.get("blocks"), list) else []:
        if not isinstance(item, dict) or len(blocks) >= MAX_BLOCKS:
            continue
        kind = item.get("type")
        kicker = str(item.get("kicker", "")).strip().upper()[:34]
        title = str(item.get("title", "")).strip()[:70]
        source_index = int(item["source"]) if str(item.get("source", "")).isdigit() else 0
        source_url = docs[source_index - 1]["url"] if 0 < source_index <= len(docs) else ""
        block_id = f"blk-{secrets.token_hex(3)}"
        if kind == "text":
            pages = [str(page).strip()[:480] for page in item.get("pages", []) if str(page).strip()][:3]
            if title and pages:
                blocks.append(ResearchBlock(id=block_id, type="text", kicker=kicker, title=title.upper(), pages=pages, source=source_url))
        elif kind == "chart":
            labels = [str(label)[:16] for label in item.get("labels", [])][:6]
            values = [_num(value) for value in item.get("values", [])][:6]
            if len(labels) >= 3 and len(values) >= len(labels) and all(value is not None for value in values[: len(labels)]):
                chart = ChartData(
                    labels=labels,
                    values=[float(value) for value in values[: len(labels)] if value is not None],
                    unit=str(item.get("unit", ""))[:18],
                    caption=str(item.get("caption", ""))[:220],
                )
                blocks.append(ResearchBlock(id=block_id, type="chart", kicker=kicker, title=title.upper(), chart=chart, source=source_url))
        elif kind == "figure":
            value = str(item.get("value", "")).strip()[:12]
            label = str(item.get("label", "")).strip()[:90]
            if value and label:
                figure = FigureData(value=value, label=label.upper(), caption=str(item.get("caption", ""))[:220], tag="FACT")
                blocks.append(ResearchBlock(id=block_id, type="figure", kicker=kicker, figure=figure, source=source_url))
    return str(payload.get("summary", "")).strip()[:400], blocks


FIGURE_PATTERN = re.compile(
    r"(?<![\w.$])(\$?\d{1,3}(?:,\d{3})+|\$?\d+(?:\.\d+)?)\s?(million|billion|trillion|thousand|percent|%)(?!\w)",
    re.I,
)


def fallback_blocks(topic: str, docs: list[dict[str, str]]) -> tuple[str, list[ResearchBlock]]:
    """Source-based report used when no AI provider is available."""
    blocks: list[ResearchBlock] = []
    for index, doc in enumerate(docs[:3], start=1):
        pages = paginate(doc["text"])
        if pages:
            blocks.append(ResearchBlock(
                id=f"blk-{secrets.token_hex(3)}", type="text", kicker=f"TEXT // SOURCE {index:02d}",
                title=doc["title"].upper()[:48], pages=pages, source=doc["url"],
            ))
    for doc in docs[:2]:
        for sentence in _sentences(doc["text"])[:24]:
            match = FIGURE_PATTERN.search(sentence)
            if match:
                unit = match.group(2).lower()
                short = {"million": "M", "billion": "B", "trillion": "T", "thousand": "K", "percent": "%", "%": "%"}[unit]
                value = f"{match.group(1)}{short}"
                blocks.append(ResearchBlock(
                    id=f"blk-{secrets.token_hex(3)}", type="figure", kicker=f"FIGURE // {doc['title'].upper()[:20]}",
                    figure=FigureData(value=value, label=sentence[:90].upper(), caption=f"Stated in {doc['title']}.", tag="FACT"),
                    source=doc["url"],
                ))
                break
        if any(block.type == "figure" for block in blocks):
            break
    lead = docs[0]["text"].split("\n")[0] if docs else ""
    summary = " ".join(_sentences(lead)[:2])[:300] or f"I gathered sources on {topic}."
    return summary, blocks


# --------------------------------------------------------------------------- the job

def create_job(topic: str) -> ResearchJob:
    for stale in [key for key, job in JOBS.items() if time.time() - job.started_at > 3600]:
        JOBS.pop(stale, None)
    while len(JOBS) >= MAX_JOBS:
        JOBS.pop(next(iter(JOBS)))
    cleaned = clean_topic(topic)
    job = ResearchJob(id=f"res-{secrets.token_hex(4)}", topic=cleaned, title=display_title(cleaned), started_at=time.time())
    JOBS[job.id] = job
    return job


def _step(job: ResearchJob, stage: str, progress: float) -> None:
    job.stage = stage
    job.progress = max(job.progress, min(progress, 0.99))


def run_job(job: ResearchJob, agent: Any) -> None:
    """Blocking pipeline - run it in a worker thread."""
    topic = job.topic
    docs: list[dict[str, str]] = []
    images: list[ImageData] = []
    web_hits: list[SearchResult] = []

    _step(job, "SEARCHING THE WEB", 0.08)
    try:
        web_hits = search_wikipedia(topic, 5)
    except Exception as exc:  # network failures should degrade, not crash
        logger.warning("Wikipedia search failed: %s", exc)
    if len(web_hits) < 2:
        try:
            web_hits += search_duckduckgo(topic, 4)
        except Exception as exc:
            logger.warning("DuckDuckGo search failed: %s", exc)
    job.sources = web_hits[:6]
    _step(job, "READING SOURCES", 0.25)

    wiki_titles = [hit.title for hit in web_hits if "wikipedia.org" in hit.url][:3]
    for position, title in enumerate(wiki_titles):
        try:
            page = wiki_extract(title)
        except Exception as exc:
            logger.warning("Wikipedia extract for %s failed: %s", title, exc)
            continue
        if page.get("text"):
            docs.append({"title": page["title"], "url": page["url"], "text": page["text"], "image": page.get("image", "")})
        _step(job, "READING SOURCES", 0.25 + 0.12 * (position + 1))
    for hit in web_hits:
        if "wikipedia.org" not in hit.url and hit.snippet and len(docs) < 5:
            docs.append({"title": hit.title, "url": hit.url, "text": hit.snippet, "image": ""})
    job.sources = [SearchResult(title=doc["title"], url=doc["url"], snippet=doc["text"][:160]) for doc in docs] or job.sources

    if not docs:
        job.status = "error"
        job.error = "No sources could be reached. Check the backend's internet connection."
        job.stage = "RESEARCH FAILED"
        job.finished_at = time.time()
        return

    _step(job, "FINDING IMAGES", 0.62)
    try:
        images = commons_images(topic, 4)
    except Exception as exc:
        logger.warning("Commons image search failed: %s", exc)
    for doc in docs:
        if doc.get("image") and all(doc["image"] != existing.url for existing in images):
            images.insert(0, ImageData(url=doc["image"], caption=doc["title"], credit="Wikipedia"))
    images = images[:4]

    _step(job, "WRITING BLOCKS", 0.74)
    summary, blocks = "", []
    try:
        raw, provider = agent.respond(
            build_prompt(topic, docs), system=SYSTEM_PROMPT, json_mode=True, max_tokens=2200, time_budget=45.0
        )
        job.provider = provider
        if not provider.endswith("-error") and provider not in ("configuration-required", "timeout", "error"):
            payload = parse_json_object(raw)
            if payload:
                summary, blocks = blocks_from_ai(payload, docs)
    except Exception as exc:
        logger.warning("AI synthesis failed: %s", exc)
    if len(blocks) < 2:
        summary, blocks = fallback_blocks(topic, docs)
        job.provider = job.provider if job.provider.endswith("-error") else (job.provider or "sources-only")

    # Interleave photos so the dashboard mixes media with text like a briefing wall.
    for position, image in enumerate(images):
        block = ResearchBlock(
            id=f"blk-{secrets.token_hex(3)}", type="image", kicker=f"IMAGE // {docs[0]['title'].upper()[:22]}",
            title=image.caption[:48].upper(), image=image, source=docs[0]["url"],
        )
        blocks.insert(min(len(blocks), 2 + position * 2), block)
    blocks = blocks[: MAX_BLOCKS + 4]

    job.summary = summary or f"I finished researching {topic}."
    _step(job, "LAYING OUT BLOCKS", 0.88)
    staged = list(blocks)
    job.blocks = []
    for index, block in enumerate(staged):
        job.blocks.append(block)
        job.progress = max(job.progress, 0.88 + 0.1 * (index + 1) / max(1, len(staged)))
        time.sleep(0.45)
    job.stage = "RESEARCH COMPLETE"
    job.progress = 1.0
    job.finished_at = time.time()
