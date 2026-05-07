"""Redis cache helpers for AI-derived artifacts.

Per-call connections (matching app.core.brute_force) so a Redis outage
degrades cleanly to a cache-miss rather than a 5xx.
"""
from __future__ import annotations

import json
import logging
import uuid

import redis.asyncio as aioredis  # type: ignore

from app.core.config import settings

logger = logging.getLogger(__name__)

CARECARD_TTL_SECONDS = 2 * 60 * 60


def _carecard_key(client_id: uuid.UUID) -> str:
    return f"carecard:{client_id}"


async def _client() -> aioredis.Redis | None:
    try:
        return aioredis.from_url(
            settings.REDIS_URL, encoding="utf-8", decode_responses=True
        )
    except Exception:
        logger.warning("carecard_cache_redis_unavailable")
        return None


async def get_carecard(client_id: uuid.UUID) -> dict | None:
    client = await _client()
    if client is None:
        return None
    try:
        raw = await client.get(_carecard_key(client_id))
        return json.loads(raw) if raw else None
    except Exception:
        return None
    finally:
        try:
            await client.aclose()
        except Exception:
            pass


async def set_carecard(client_id: uuid.UUID, payload: dict) -> None:
    client = await _client()
    if client is None:
        return
    try:
        await client.set(
            _carecard_key(client_id),
            json.dumps(payload),
            ex=CARECARD_TTL_SECONDS,
        )
    except Exception:
        return
    finally:
        try:
            await client.aclose()
        except Exception:
            pass


async def invalidate_carecard(client_id: uuid.UUID) -> None:
    client = await _client()
    if client is None:
        return
    try:
        await client.delete(_carecard_key(client_id))
    except Exception:
        return
    finally:
        try:
            await client.aclose()
        except Exception:
            pass
