"""Rate limiting via slowapi.

Per SKILL.md section 9.4. Default key is the requesting IP, but on
authenticated routes we prefer the user_id (from JWT subject) so a single
laptop on a shared NAT can't be limited by an unrelated request.

Storage is Redis-backed when available so state survives backend restarts and
can be flushed in dev/CI. Falls back to in-memory if Redis is unreachable."""
from __future__ import annotations

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings


def _key_func(request: Request) -> str:
    user_id = getattr(request.state, "user_id", None)
    if user_id:
        return f"user:{user_id}"
    return f"ip:{get_remote_address(request)}"


limiter = Limiter(
    key_func=_key_func,
    default_limits=["200/minute"],
    headers_enabled=True,
    in_memory_fallback_enabled=True,
    storage_uri=settings.REDIS_URL,
)


# Per-route limits in one place so api modules just reference them.
LIMITS = {
    "auth_login": "5/minute",
    "auth_magic_link": "3/minute",
    "auth_magic_link_verify": "10/minute",
    "auth_sessions_delete": "10/minute",
    "note_text": "10/minute",
    "note_audio": "5/minute",
    # Whisper transcribe is now a single post-recording call rather than
    # streaming chunks every 3s, so a higher per-user cap is safe.
    "note_transcribe": "30/minute",
    "note_translate": "20/minute",
    "handoff_finalize": "10/minute",
    "waitlist": "3/hour",
    "waitlist_submit": "3/hour",
    "demo_handoff": "10/hour",
    "demo_transcribe": "5/hour",
    "flag_update": "30/minute",
    "coordinator_action_create": "30/minute",
    "user_invite": "20/hour",
}
