import json
import logging
import os
import time
from pathlib import Path
from urllib import error, parse, request

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

logger = logging.getLogger("CiscoAgent")


class AgentRuntime:
    """Small provider runtime for Gemini, OpenAI-compatible APIs, or local Ollama."""

    def __init__(self) -> None:
        self.gemini_api_key = os.getenv("GEMINI_API_KEY", "").strip()
        self.gemini_model = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite").strip()
        self.api_key = os.getenv("OPENAI_API_KEY", "").strip()
        self.model = os.getenv("OPENAI_MODEL", "llama3.2").strip()
        self.base_url = (os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").strip().rstrip("/")
                         or "https://api.openai.com/v1")

    def respond(self, message: str, context: str = "", history: list[dict[str, str]] | None = None) -> tuple[str, str]:
        history = history or []
        if self.gemini_api_key:
            try:
                return self._gemini_response(message, context, history), "gemini"
            except (OSError, ValueError, KeyError, error.URLError, error.HTTPError) as exc:
                if self.api_key or self.base_url != "https://api.openai.com/v1":
                    provider = "ollama" if "localhost:11434" in self.base_url else "openai-compatible"
                    try:
                        return self._compatible_response(message, context, history), provider
                    except (OSError, ValueError, KeyError, error.URLError, error.HTTPError) as fallback_exc:
                        logger.warning("Secondary AI provider %s also failed: %s", provider, fallback_exc)
                return self._provider_error("Gemini", exc), "gemini-error"

        if self.api_key or self.base_url != "https://api.openai.com/v1":
            provider = "ollama" if "localhost:11434" in self.base_url else "openai-compatible"
            try:
                return self._compatible_response(message, context, history), provider
            except (OSError, ValueError, KeyError, error.URLError, error.HTTPError) as exc:
                return self._provider_error(provider, exc), f"{provider}-error"

        return (
            "CISCO's AI provider is not configured. Add GEMINI_API_KEY to the backend environment to enable AI replies.",
            "configuration-required",
        )

    def _gemini_response(self, message: str, context: str, history: list[dict[str, str]] | None = None) -> str:
        instruction = (
            "You are CISCO, a helpful autonomous assistant. Be clear, accurate, and concise. "
            "Use the conversation history to resolve short or ambiguous follow-up questions. "
            "Keep the same topic unless the user clearly changes it; do not invent a new topic for phrases like 'and what would those be?'. "
            "If a graph topic is currently focused, treat it as the current subject even if older chat turns discussed something else."
        )
        if context:
            instruction += f"\nUse the focused graph topic and research context when relevant:\n{context}"
        contents = [
            {"role": "model" if turn.get("role") == "assistant" else "user", "parts": [{"text": turn["content"]}]}
            for turn in (history or [])[-12:]
            if turn.get("role") in ("user", "assistant") and turn.get("content")
        ]
        contents.append({"role": "user", "parts": [{"text": message}]})
        payload = json.dumps({
            "systemInstruction": {"parts": [{"text": instruction}]},
            "contents": contents,
            "generationConfig": {"maxOutputTokens": 700},
        }).encode("utf-8")
        fallback_models = [model for model in ("gemini-3.5-flash-lite", "gemini-3.6-flash", "gemini-3.7-flash", "gemini-3.8-flash") if model != self.gemini_model]
        models = [self.gemini_model, *fallback_models]
        attempted: list[str] = []
        deadline = time.monotonic() + 28
        result: dict | None = None
        for index, model in enumerate(models):
            try:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    break
                result = self._send_gemini_request(model, payload, timeout=min(15, remaining))
                break
            except error.HTTPError as exc:
                attempted.append(f"{model} (HTTP {exc.code})")
                retryable = exc.code in (404, 429, 502, 503)
                if not retryable:
                    raise
                if index == len(models) - 1:
                    raise ValueError(f"Gemini model fallback exhausted: {', '.join(attempted)}. Try again shortly.") from exc
                logger.warning("Gemini model %s returned HTTP %s; retrying with a fallback model", model, exc.code)
            except (TimeoutError, error.URLError, OSError) as exc:
                attempted.append(f"{model} (connection timeout/error)")
                if index == len(models) - 1:
                    raise ValueError(f"Gemini model fallback exhausted: {', '.join(attempted)}. Try again shortly.") from exc
                logger.warning("Gemini model %s could not be reached; retrying with a fallback model: %s", model, exc)
        else:
            raise ValueError("Gemini models exhausted")
        if result is None:
            raise ValueError(f"Gemini fallback models failed: {', '.join(attempted)}. Try again shortly.")
        parts = result["candidates"][0]["content"]["parts"]
        answer = "\n".join(part.get("text", "") for part in parts).strip()
        if not answer:
            raise ValueError("Gemini returned an empty response")
        return answer

    def _send_gemini_request(self, model: str, payload: bytes, timeout: float = 15) -> dict:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{parse.quote(model, safe='')}:generateContent"
        req = request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json", "x-goog-api-key": self.gemini_api_key},
            method="POST",
        )
        with request.urlopen(req, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))

    def _compatible_response(self, message: str, context: str, history: list[dict[str, str]] | None = None) -> str:
        system = (
            "You are CISCO, a helpful autonomous assistant. Be clear, accurate, and concise. "
            "Use conversation history to resolve follow-up questions and stay on the current topic unless the user changes it. "
            "If a graph topic is currently focused, treat it as the current subject even if older chat turns discussed something else."
        )
        if context:
            system += f"\nUse the focused graph topic and research context when relevant:\n{context}"
        messages = [{"role": "system", "content": system}]
        messages.extend(
            {"role": turn["role"], "content": turn["content"]}
            for turn in (history or [])[-12:]
            if turn.get("role") in ("user", "assistant") and turn.get("content")
        )
        messages.append({"role": "user", "content": message})
        payload = json.dumps({
            "model": self.model,
            "messages": messages,
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
        if isinstance(exc, error.HTTPError):
            detail = ""
            try:
                payload = json.loads(exc.read().decode("utf-8"))
                detail = payload.get("error", {}).get("message", "")
            except (UnicodeDecodeError, json.JSONDecodeError, AttributeError):
                pass

            status = exc.code
            if provider.lower() == "gemini":
                if status in (401, 403):
                    hint = "Verify GEMINI_API_KEY in Render and confirm it is allowed to use this model."
                elif status == 404:
                    hint = "Check GEMINI_MODEL; the configured model was not found."
                elif status == 429:
                    hint = "The Gemini quota or rate limit was reached; check Google AI Studio usage and retry later."
                else:
                    hint = "Check the Gemini provider settings and try again."
            elif status in (401, 403):
                hint = "Verify the API key configured for this provider."
            elif status == 404:
                hint = "Check the configured provider endpoint and model name."
            elif status == 429:
                hint = "The provider quota or rate limit was reached; retry later."
            else:
                hint = "Check the provider settings and try again."
            explanation = f" {detail[:240]}" if detail else ""
            return f"CISCO's {provider} request was rejected (HTTP {status}).{explanation} {hint}"

        if isinstance(exc, (TimeoutError, error.URLError, OSError)):
            return f"CISCO couldn't connect to the {provider} service. The backend may be offline, waking from sleep, or unable to reach the network. Try again shortly."
        return f"CISCO's {provider} request failed: {str(exc)[:240]}. Check the backend logs and provider settings."
