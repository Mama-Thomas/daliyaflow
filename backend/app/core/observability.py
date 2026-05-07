"""Structured logging + Sentry payload scrubbing.

Logs are emitted as JSON with a stable shape that downstream pipelines (and
the dev console) can both consume. Sensitive fields are stripped before they
leave the process — never log raw note text, audio keys, tokens, passwords,
or email addresses."""
from __future__ import annotations

import json
import logging
import sys
from typing import Any

SENSITIVE_FIELDS: frozenset[str] = frozenset(
    {
        "password",
        "password_hash",
        "token",
        "access_token",
        "refresh_token",
        "raw_text",
        "audio_s3_key",
        "email",
        "secret",
        "authorization",
        "x-api-key",
    }
)

_RESERVED_LOGRECORD_FIELDS = frozenset(
    {
        "name",
        "msg",
        "args",
        "levelname",
        "levelno",
        "pathname",
        "filename",
        "module",
        "exc_info",
        "exc_text",
        "stack_info",
        "lineno",
        "funcName",
        "created",
        "msecs",
        "relativeCreated",
        "thread",
        "threadName",
        "processName",
        "process",
        "message",
        "taskName",
    }
)


def _scrub(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            k: ("[redacted]" if k.lower() in SENSITIVE_FIELDS else _scrub(v))
            for k, v in value.items()
        }
    if isinstance(value, list):
        return [_scrub(item) for item in value]
    return value


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "event": record.getMessage(),
        }
        for key, value in record.__dict__.items():
            if key in _RESERVED_LOGRECORD_FIELDS or key.startswith("_"):
                continue
            payload[key] = value
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(_scrub(payload), default=str)


def setup_logging() -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(logging.INFO)
    # Quiet down noisy libraries
    for noisy in ("uvicorn.access",):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def scrub_sentry_event(event: dict[str, Any], hint: dict[str, Any] | None) -> dict[str, Any] | None:
    """Sentry before_send hook. Strips sensitive fields from request data,
    breadcrumbs, and extras before the event leaves the process."""
    try:
        if "request" in event and isinstance(event["request"], dict):
            req = event["request"]
            for k in ("data", "headers", "cookies", "query_string"):
                if k in req:
                    req[k] = _scrub(req[k])
        for key in ("extra", "contexts", "tags"):
            if key in event and isinstance(event[key], dict):
                event[key] = _scrub(event[key])
        bc = event.get("breadcrumbs")
        if isinstance(bc, dict) and "values" in bc and isinstance(bc["values"], list):
            for crumb in bc["values"]:
                if isinstance(crumb, dict) and "data" in crumb:
                    crumb["data"] = _scrub(crumb["data"])
    except Exception:
        # If scrubbing itself fails, drop the event rather than leak.
        return None
    return event
