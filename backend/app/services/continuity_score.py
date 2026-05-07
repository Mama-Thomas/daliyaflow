"""Handoff continuity / completeness scoring.

Lightweight rubric — applied after the AI pipeline finishes. Doesn't grade
factual accuracy (we can't), only structural completeness: did the note have
substance, did the AI fill the structured fields, and was the AI confident.
"""
from __future__ import annotations

from typing import Any

from app.services.ai_pipeline import HandoffSummaryResult


def calculate_continuity_score(
    summary: HandoffSummaryResult, raw_note: str
) -> tuple[float, dict[str, float]]:
    """Returns (score in [0.0, 1.0], breakdown dict)."""
    breakdown: dict[str, float] = {}

    word_count = len(raw_note.split())
    breakdown["note_length"] = round(min(word_count / 20, 1.0) * 0.2, 3)

    breakdown["has_overview"] = (
        0.2 if summary.summary_overview and len(summary.summary_overview) > 20 else 0.0
    )
    breakdown["notable_changes"] = (
        0.15 if summary.notable_changes and summary.notable_changes.strip() else 0.0
    )
    has_tasks = bool(summary.tasks_completed or summary.tasks_pending)
    breakdown["tasks_present"] = 0.15 if has_tasks else 0.0
    breakdown["follow_up"] = 0.15 if summary.follow_up_items else 0.0
    breakdown["ai_confidence"] = round(summary.confidence_score * 0.15, 3)

    total = round(sum(breakdown.values()), 2)
    # Clip just in case any rounding pushes us over 1.0.
    if total > 1.0:
        total = 1.0
    return total, breakdown


def serializable_breakdown(breakdown: dict[str, float]) -> dict[str, Any]:
    """JSONB-safe (it already is, but this gives us a single conversion point)."""
    return {k: float(v) for k, v in breakdown.items()}
