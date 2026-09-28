import json
import logging
import os
from pathlib import Path
from urllib import error, parse, request

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

logger = logging.getLogger("CiscoAgent")


class AgentRuntime:
    """Small provider runtime for Gemini, OpenAI-compatible APIs, or local Ollama."""

    def __init__(self) -> None:
        self.gemini_api_key = os.getenv("GEMINI_API_KEY", "").strip()
        self.gemini_model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip()
        self.api_key = os.getenv("OPENAI_API_KEY", "").strip()
        self.model = os.getenv("OPENAI_MODEL", "llama3.2").strip()
        self.base_url = (os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").strip().rstrip("/")
                         or "https://api.openai.com/v1")

    def respond(self, message: str, context: str = "") -> tuple[str, str]:
        if self.gemini_api_key:
            try:
                return self._gemini_response(message, context), "gemini"
            except (OSError, ValueError, KeyError, error.URLError, error.HTTPError) as exc:
                return self._provider_error("Gemini", exc), "gemini-error"

        if self.api_key or self.base_url != "https://api.openai.com/v1":
            provider = "ollama" if "localhost:11434" in self.base_url else "openai-compatible"
            try:
                return self._compatible_response(message, context), provider
            except (OSError, ValueError, KeyError, error.URLError, error.HTTPError) as exc:
                return self._provider_error(provider, exc), f"{provider}-error"

        return (
            "CISCO's AI provider is not configured. Add GEMINI_API_KEY to the backend environment to enable AI replies.",
            "configuration-required",
        )

    def _gemini_response(self, message: str, context: str) -> str:
        instruction = "You are CISCO, a helpful autonomous assistant. Be clear, accurate, and concise."
        if context:
            instruction += f"\nUse this research context when relevant:\n{context}"
        payload = json.dumps({
            "systemInstruction": {"parts": [{"text": instruction}]},
            "contents": [{"role": "user", "parts": [{"text": message}]}],
            "generationConfig": {"temperature": 0.3, "maxOutputTokens": 700},
        }).encode("utf-8")
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{parse.quote(self.gemini_model, safe='')}:generateContent"
        req = request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json", "x-goog-api-key": self.gemini_api_key},
            method="POST",
        )
        with request.urlopen(req, timeout=30) as response:
            result = json.loads(response.read().decode("utf-8"))
        parts = result["candidates"][0]["content"]["parts"]
        answer = "\n".join(part.get("text", "") for part in parts).strip()
        if not answer:
            raise ValueError("Gemini returned an empty response")
        return answer

    def _compatible_response(self, message: str, context: str) -> str:
        system = "You are CISCO, a helpful autonomous assistant. Be clear, accurate, and concise."
        if context:
            system += f"\nUse this research context when relevant:\n{context}"
        payload = json.dumps({
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": message},
            ],
            "temperature": 0.3,
        }).encode("utf-8")
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        req = request.Request(f"{self.base_url}/chat/completions", data=payload, headers=headers, method="POST")
        with request.urlopen(req, timeout=30) as response:
            result = json.loads(response.read().decode("utf-8"))
        answer = result["choices"][0]["message"]["content"]
        if not isinstance(answer, str) or not answer.strip():
            raise ValueError("AI provider returned an empty response")
        return answer.strip()

    @staticmethod
    def _provider_error(provider: str, exc: Exception) -> str:
        logger.error("%s request failed: %s", provider, exc)
        return f"CISCO couldn't reach the {provider} AI service. Check the backend API key and provider settings, then try again."
