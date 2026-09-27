import json
import os
from urllib import error, request

from dotenv import load_dotenv

load_dotenv()


class AgentRuntime:
    """Small provider-neutral runtime with a deterministic local fallback."""

    def __init__(self) -> None:
        self.api_key = os.getenv("OPENAI_API_KEY", "")
        self.model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        self.base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")

    def respond(self, message: str) -> tuple[str, str]:
        if not self.api_key and self.base_url == "https://api.openai.com/v1":
            return self._local_response(message), "simulation"
        provider = "ollama" if "localhost:11434" in self.base_url else "openai-compatible"
        try:
            return self._provider_response(message), provider
        except (OSError, ValueError, error.URLError, error.HTTPError):
            return self._local_response(message), f"{provider}-fallback"

    def _local_response(self, message: str) -> str:
        normalized = message.lower()
        if "reservation" in normalized or "book" in normalized:
            return "I captured the reservation request and can start a simulated call when you are ready."
        if "remember" in normalized or "memory" in normalized:
            return "I captured that in local memory and linked it to the active context."
        return "I captured the directive. Local systems are ready for the next action."

    def _provider_response(self, message: str) -> str:
        payload = json.dumps({
            "model": self.model,
            "messages": [
                {"role": "system", "content": "You are CISCO, a concise autonomous assistant. State what you can do next."},
                {"role": "user", "content": message},
            ],
            "temperature": 0.2,
        }).encode("utf-8")
        endpoint = f"{self.base_url.rstrip('/')}/chat/completions"
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        req = request.Request(endpoint, data=payload, headers=headers, method="POST")
        with request.urlopen(req, timeout=20) as response:
            result = json.loads(response.read().decode("utf-8"))
        content = result["choices"][0]["message"]["content"]
        if not isinstance(content, str) or not content.strip():
            raise ValueError("Provider returned an empty response")
        return content.strip()
