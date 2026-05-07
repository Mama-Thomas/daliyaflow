"""Continuity briefing (CareCard) service."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.client import Client
from app.models.handoff import HandoffSummary
from app.models.risk_flag import RiskFlag
from app.services.ai_pipeline import CareCardResult, generate_carecard


async def build_carecard(
    db: AsyncSession, *, client_id: uuid.UUID, agency_id: uuid.UUID
) -> tuple[CareCardResult, datetime]:
    client = await db.get(Client, client_id)
    if client is None or client.agency_id != agency_id:
        raise LookupError("Client not found")

    handoffs = (
        await db.execute(
            select(HandoffSummary)
            .where(HandoffSummary.agency_id == agency_id)
            .where(HandoffSummary.shift_id.in_(  # noqa: E711
                select(HandoffSummary.shift_id)
            ))
            .order_by(HandoffSummary.created_at.desc())
            .limit(3)
        )
    ).scalars().all()

    recent_handoffs: list[str] = []
    for h in handoffs:
        body = h.edited_summary or h.generated_summary or {}
        overview = body.get("summary_overview")
        if overview:
            recent_handoffs.append(overview)

    flags = (
        await db.execute(
            select(RiskFlag)
            .where(RiskFlag.agency_id == agency_id)
            .where(RiskFlag.client_id == client_id)
            .where(RiskFlag.status.in_(["suggested", "confirmed", "escalated"]))
            .order_by(RiskFlag.created_at.desc())
            .limit(10)
        )
    ).scalars().all()
    active_flag_strings = [
        f"{f.category}: {f.extracted_reason}" for f in flags
    ]

    card = await generate_carecard(
        preferred_name=client.preferred_name or client.first_name,
        care_context=client.care_context_summary or "",
        recent_handoffs=recent_handoffs,
        active_flags=active_flag_strings,
    )
    return card, datetime.now(timezone.utc)
