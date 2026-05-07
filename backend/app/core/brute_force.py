"""Brute-force protection for login + magic-link endpoints.

Tracks failed attempts per email-hash in Redis. After 5 attempts inside a 10-minute
window the account is locked for 15 minutes. Lockouts return the same generic message
as a normal failure to avoid leaking the lockout state.

Falls back gracefully (no-op) if Redis is unavailable so an outage cannot lock
the entire user base out of the product.
"""
from __future__ import annotations

import hashlib
import logging

import redis.asyncio as aioredis  # type: ignore

from app.core.config import settings

logger = logging.getLogger(__name__)

MAX_ATTEMPTS = 5
ATTEMPT_WINDOW_SECONDS = 10 * 60
LOCKOUT_SECONDS = 15 * 60


def _email_key(email: str) -> str:
    digest = hashlib.sha256(email.lower().strip().encode()).hexdigest()
    return f"login_attempts:{digest}"


def _lockout_key(email: str) -> str:
    digest = hashlib.sha256(email.lower().strip().encode()).hexdigest()
    return f"login_lockout:{digest}"


async def _client() -> aioredis.Redis | None:
    try:
        return aioredis.from_url(
            settings.REDIS_URL, encoding="utf-8", decode_responses=True
        )
    except Exception:
        logger.warning("brute_force_redis_unavailable")
        return None


async def is_locked(email: str) -> bool:
    client = await _client()
    if client is None:
        return False
    try:
        v = await client.get(_lockout_key(email))
        return v is not None
    except Exception:
        return False
    finally:
        try:
            await client.aclose()
        except Exception:
            pass


async def record_failure(email: str) -> bool:
    """Record a failed attempt. Returns True if the account is now locked."""
    client = await _client()
    if client is None:
        return False
    try:
        key = _email_key(email)
        count = await client.incr(key)
        if count == 1:
            await client.expire(key, ATTEMPT_WINDOW_SECONDS)
        if count >= MAX_ATTEMPTS:
            await client.set(_lockout_key(email), "1", ex=LOCKOUT_SECONDS)
            await client.delete(key)
            return True
        return False
    except Exception:
        return False
    finally:
        try:
            await client.aclose()
        except Exception:
            pass


async def reset(email: str) -> None:
    client = await _client()
    if client is None:
        return
    try:
        await client.delete(_email_key(email))
        await client.delete(_lockout_key(email))
    except Exception:
        pass
    finally:
        try:
            await client.aclose()
        except Exception:
            pass
