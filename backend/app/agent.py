import os
import asyncio
import logging

logger = logging.getLogger("CiscoAgent")

class AgentRuntime:
    def __init__(self):
        self.provider = "local"

    async def ask(self, message: str, use_web: bool = False) -> tuple[str, str]:
        logger.info(f"Processing message: '{message}' (web_search={use_web})")
        
        try:
            # Fast response handling for common greetings & local testing
            msg_lower = message.strip().lower()
            await asyncio.sleep(0.2)  # Fast non-blocking delay
            
            if "hi" in msg_lower or "hello" in msg_lower:
                return "Hello! Cisco systems are online and operational. How can I assist you?", "cisco-core"
            
            return f"Acknowledged: '{message}'. All operational sub-routines active.", "cisco-core"

        except Exception as e:
            logger.error(f"Error processing agent request: {e}")
            return "System encountered a momentary delay. Please repeat your instruction.", "fallback"