import asyncio
import json
import os

import websockets


class RealtimeBridge:
    """Bridge Twilio G.711 audio to an OpenAI-compatible realtime socket."""

    def __init__(self) -> None:
        self.api_key = os.getenv("OPENAI_API_KEY", "")
        self.model = os.getenv("OPENAI_REALTIME_MODEL", "gpt-4o-realtime-preview")
        self.socket = None

    @property
    def enabled(self) -> bool:
        return bool(self.api_key)

    async def connect(self) -> None:
        if not self.enabled:
            return
        self.socket = await websockets.connect(
            f"wss://api.openai.com/v1/realtime?model={self.model}",
            additional_headers={
                "Authorization": f"Bearer {self.api_key}",
                "OpenAI-Beta": "realtime=v1",
            },
        )
        await self.socket.send(json.dumps({
            "type": "session.update",
            "session": {
                "modalities": ["audio", "text"],
                "instructions": "You are CISCO, a concise and helpful voice assistant. Speak naturally and keep replies short.",
                "voice": "alloy",
                "input_audio_format": "g711_ulaw",
                "output_audio_format": "g711_ulaw",
                "turn_detection": {"type": "server_vad"},
            },
        }))

    async def send_audio(self, payload: str) -> None:
        if self.socket is not None:
            await self.socket.send(json.dumps({"type": "input_audio_buffer.append", "audio": payload}))

    async def receive_audio(self) -> str | None:
        if self.socket is None:
            return None
        while True:
            event = json.loads(await self.socket.recv())
            if event.get("type") == "response.audio.delta":
                return event.get("delta")
            if event.get("type") == "error":
                raise RuntimeError(event.get("error", {}).get("message", "Realtime provider error"))

    async def close(self) -> None:
        if self.socket is not None:
            await self.socket.close()
            self.socket = None


async def provider_audio_loop(bridge: RealtimeBridge, websocket, stream_id: str) -> None:
    try:
        while True:
            payload = await bridge.receive_audio()
            if not payload:
                continue
            await websocket.send_text(json.dumps({
                "event": "media",
                "streamSid": stream_id,
                "media": {"payload": payload},
            }))
    except (OSError, RuntimeError, json.JSONDecodeError, websockets.exceptions.ConnectionClosed):
        return
