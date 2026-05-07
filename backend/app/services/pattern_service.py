"""Repeat-flag pattern detection.

After a new flag is persisted, count how many times the same category fired on
this client in the past 14 days. If that count crosses the threshold, raise an
escalation: a ContinuityEvent + a high-severity 'Pattern detected' RiskFlag with
metadata so the UI can render a special chip.
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.continuity import ContinuityEvent
from app.models.risk_flag import RiskFlag
from app.services.audit_service import record_audit

logger = logging.getLogger(__name__)

PATTERN_THRESHOLD = 3
PATTERN_WINDOW_DAYS = 14


@dataclass
class PatternAlert:
    category: str
    pattern_count: int
    window_days: int


async def check_flag_patterns(
    db: AsyncSession,
    *,
    client_id: uuid.UUID,
    agency_id: uuid.UUID,
    new_flag_category: str,
    shift_id: uuid.UUID,
    handoff_id: uuid.UUID | None = None,
) -> PatternAlert | None:
    """Returns a PatternAlert if a repeating pattern has been detected.

    Persists a ContinuityEvent and a synthetic high-severity RiskFlag with
    flag_metadata.pattern_count so the UI can render a 'Pattern' chip.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=PATTERN_WINDOW_DAYS)

    count = (
        await db.execute(
            select(func.count(RiskFlag.id))
            .where(RiskFlag.agency_id == agency_id)
            .where(RiskFlag.client_id == client_id)
            .where(RiskFlag.category == new_flag_category)
            .where(RiskFlag.created_at >= cutoff)
            # Skip prior pattern markers so we don't compound on themselves.
            .where(RiskFlag.flag_metadata["pattern"].astext.is_(None))
        )
    ).scalar_one()
    count = int(count or 0)

    if count < PATTERN_THRESHOLD:
        return None

    # Already raised a pattern alert for this category+client recently? Skip.
    recent_pattern = (
        await db.execute(
            select(RiskFlag.id)
            .where(RiskFlag.agency_id == agency_id)
            .where(RiskFlag.client_id == client_id)
            .where(RiskFlag.category == new_flag_category)
            .where(RiskFlag.flag_metadata["pattern"].astext == "true")
            .where(RiskFlag.created_at >= cutoff)
            .limit(1)
        )
    ).first()
    if recent_pattern is not None:
        return None

    db.add(
        ContinuityEvent(
            agency_id=agency_id,
            client_id=client_id,
            shift_id=shift_id,
            category="repeat_flag_pattern",
            description=(
                f"This concern ({new_flag_category.replace('_', ' ')}) has been "
                f"flagged {count} times in the past {PATTERN_WINDOW_DAYS} days."
            ),
            severity="high",
            status="open",
        )
    )

    pattern_flag = RiskFlag(
        shift_id=shift_id,
        handoff_id=handoff_id,
        client_id=client_id,
        agency_id=agency_id,
        category=new_flag_category,
        severity="high",
        extracted_reason=(
            f"This concern has been flagged {count} times in the past "
            f"{PATTERN_WINDOW_DAYS} days."
        ),
        status="suggested",
        flag_metadata={
            "pattern": "true",
            "pattern_count": count,
            "window_days": PATTERN_WINDOW_DAYS,
        },
    )
    db.add(pattern_flag)
    await db.flush()

    await record_audit(
        db,
        action="flag.pattern_detected",
        agency_id=agency_id,
        target_type="risk_flag",
        target_id=pattern_flag.id,
        metadata={
            "category": new_flag_category,
            "count": count,
            "window_days": PATTERN_WINDOW_DAYS,
        },
    )

    return PatternAlert(
        category=new_flag_category,
        pattern_count=count,
        window_days=PATTERN_WINDOW_DAYS,
    )
