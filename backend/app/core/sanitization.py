"""Text sanitization helpers for user-submitted content.

Applied at the schema layer for any free-form text we persist. The goal is not
HTML-escaping for rendering (the frontend handles that) but stripping bytes that
have no semantic meaning and would only complicate downstream search/storage.
"""
from __future__ import annotations

import re
import unicodedata


_ZERO_WIDTH = re.compile(r"[​‌‍﻿]")
_CONTROL_CHARS = re.compile(r"[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]")
_SECRETS = re.compile(
    r'(sk-|Bearer |token["\s:=]+)[A-Za-z0-9_\-\.]+',
    flags=re.IGNORECASE,
)


def sanitize_text_input(text: str | None) -> str | None:
    """Strip null bytes, zero-width chars, and control chars; NFC-normalize; trim."""
    if text is None:
        return None
    if not text:
        return text
    text = text.replace("\x00", "")
    text = _ZERO_WIDTH.sub("", text)
    text = _CONTROL_CHARS.sub("", text)
    text = unicodedata.normalize("NFC", text)
    text = text.strip()
    return text


def sanitize_for_log(text: str | None, max_length: int = 100) -> str:
    """Truncate and redact obvious-token patterns before logging user content."""
    if not text:
        return ""
    text = _SECRETS.sub("[REDACTED]", text)
    if len(text) > max_length:
        return text[:max_length] + "..."
    return text
