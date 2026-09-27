from dataclasses import dataclass
import html
import json
import re
from html.parser import HTMLParser
from urllib.parse import quote, urljoin
from urllib.request import Request, urlopen


@dataclass
class SearchResult:
    title: str
    url: str
    snippet: str


class ResultParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.results: list[SearchResult] = []
        self._link = ""
        self._title = ""
        self._snippet = ""
        self._capture_title = False
        self._capture_snippet = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        classes = attributes.get("class", "") or ""
        if tag == "a" and "result__a" in classes:
            self._link = urljoin("https://html.duckduckgo.com", attributes.get("href", ""))
            self._capture_title = True
        if "result__snippet" in classes:
            self._capture_snippet = True

    def handle_data(self, data: str) -> None:
        if self._capture_title:
            self._title += data
        if self._capture_snippet:
            self._snippet += data

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self._capture_title:
            self._capture_title = False
        if self._capture_snippet:
            self._capture_snippet = False
            if self._title.strip() and self._link:
                self.results.append(SearchResult(self._title.strip(), self._link, self._snippet.strip()))
                self._title = ""
                self._snippet = ""
                self._link = ""


def search_web(query: str, limit: int = 5) -> list[SearchResult]:
    wikipedia_results = search_wikipedia(query, limit)
    if wikipedia_results:
        return wikipedia_results
    return search_duckduckgo(query, limit)


def search_wikipedia(query: str, limit: int = 5) -> list[SearchResult]:
    url = f"https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={quote(query)}&format=json&utf8=1&srlimit={limit}"
    request = Request(url, headers={"User-Agent": "Project-Cisco/0.1 local research agent"})
    with urlopen(request, timeout=10) as response:
        data = json.loads(response.read().decode("utf-8"))
    results = []
    for item in data.get("query", {}).get("search", []):
        title = str(item.get("title", ""))
        snippet = re.sub(r"<[^>]+>", "", html.unescape(str(item.get("snippet", ""))))
        results.append(SearchResult(
            title=title,
            url=f"https://en.wikipedia.org/wiki/{quote(title.replace(' ', '_'))}",
            snippet=snippet,
        ))
    return results


def search_duckduckgo(query: str, limit: int = 5) -> list[SearchResult]:
    url = f"https://html.duckduckgo.com/html/?q={quote(query)}"
    request = Request(url, headers={"User-Agent": "Project-Cisco/0.1 local research agent"})
    with urlopen(request, timeout=10) as response:
        parser = ResultParser()
        parser.feed(response.read().decode("utf-8", errors="replace"))
    return parser.results[:limit]
