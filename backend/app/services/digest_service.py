"""Morning digest builder.

Daily summary of yesterday's activity + today's outlook for an agency.
Returned in a shape ready to drop into the email template.
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, time, timedelta, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agency import Agency
from app.models.client import Client
from app.models.handoff import HandoffSummary
from app.models.risk_flag import RiskFlag
from app.models.shift import Shift
from app.models.shift_note import ShiftNoteRaw
from app.models.user import User

logger = logging.getLogger(__name__)

_SEVERITY_RANK = {"high": 0, "medium": 1, "low": 2}


@dataclass
class DigestData:
    organization_name: str
    today: str
    yesterday_stats: dict[str, int]
    today_outlook: dict[str, int]
    top_clients: list[dict[str, Any]]


async def generate_agency_digest(
    db: AsyncSession, agency_id: uuid.UUID
) -> DigestData | None:
    agency = await db.get(Agency, agency_id)
    if agency is None:
        return None

    now = datetime.now(timezone.utc)
    today_start = datetime.combine(now.date(), time.min, tzinfo=timezone.utc)
    today_end = datetime.combine(now.date(), time.max, tzinfo=timezone.utc)
    yest_start = today_start - timedelta(days=1)
    yest_end = today_start - timedelta(microseconds=1)

    # ---------- Yesterday ----------

    submissions = (
        await db.execute(
            select(func.count(ShiftNoteRaw.id))
            .where(ShiftNoteRaw.agency_id == agency_id)
            .where(ShiftNoteRaw.created_at >= yest_start)
            .where(ShiftNoteRaw.created_at <= yest_end)
        )
    ).scalar_one()

    new_high = (
        await db.execute(
            select(func.count(RiskFlag.id))
            .where(RiskFlag.agency_id == agency_id)
            .where(RiskFlag.severity == "high")
            .where(RiskFlag.created_at >= yest_start)
            .where(RiskFlag.created_at <= yest_end)
        )
    ).scalar_one()

    confirmed = (
        await db.execute(
            select(func.count(RiskFlag.id))
            .where(RiskFlag.agency_id == agency_id)
            .where(RiskFlag.status == "confirmed")
            .where(RiskFlag.reviewed_at >= yest_start)
            .where(RiskFlag.reviewed_at <= yest_end)
        )
    ).scalar_one()

    dismissed = (
        await db.execute(
            select(func.count(RiskFlag.id))
            .where(RiskFlag.agency_id == agency_id)
            .where(RiskFlag.status == "dismissed")
            .where(RiskFlag.reviewed_at >= yest_start)
            .where(RiskFlag.reviewed_at <= yest_end)
        )
    ).scalar_one()

    yest_at_risk = (
        await db.execute(
            select(func.count(Shift.id))
            .where(Shift.agency_id == agency_id)
            .where(Shift.status == "at_risk")
            .where(Shift.scheduled_start >= yest_start)
            .where(Shift.scheduled_start <= yest_end)
        )
    ).scalar_one()

    yesterday_stats = {
        "submissions": int(submissions or 0),
        "new_high_flags": int(new_high or 0),
        "flags_confirmed": int(confirmed or 0),
        "flags_dismissed": int(dismissed or 0),
        "shifts_at_risk": int(yest_at_risk or 0),
    }

    # ---------- Today ----------

    today_count = (
        await db.execute(
            select(func.count(Shift.id))
            .where(Shift.agency_id == agency_id)
            .where(Shift.scheduled_start >= today_start)
            .where(Shift.scheduled_start <= today_end)
        )
    ).scalar_one()

    today_at_risk = (
        await db.execute(
            select(func.count(Shift.id))
            .where(Shift.agency_id == agency_id)
            .where(Shift.status == "at_risk")
            .where(Shift.scheduled_start >= today_start)
            .where(Shift.scheduled_start <= today_end)
        )
    ).scalar_one()

    clients_with_high_open = (
        await db.execute(
            select(func.count(func.distinct(RiskFlag.client_id)))
            .where(RiskFlag.agency_id == agency_id)
            .where(RiskFlag.severity == "high")
            .where(RiskFlag.status.in_(["suggested", "confirmed", "escalated"]))
        )
    ).scalar_one()

    today_outlook = {
        "shifts_scheduled": int(today_count or 0),
        "shifts_at_risk": int(today_at_risk or 0),
        "clients_with_high_flags": int(clients_with_high_open or 0),
    }

    # ---------- Top 3 clients needing attention ----------

    top_flag_rows = (
        await db.execute(
            select(RiskFlag, Client)
            .join(Client, Client.id == RiskFlag.client_id)
            .where(RiskFlag.agency_id == agency_id)
            .where(RiskFlag.status.in_(["suggested", "confirmed", "escalated"]))
            .order_by(RiskFlag.created_at.desc())
            .limit(50)
        )
    ).all()

    by_client: dict[uuid.UUID, dict[str, Any]] = {}
    for flag, client in top_flag_rows:
        entry = by_client.setdefault(
            client.id,
            {
                "client_name": (
                    f"{client.preferred_name or client.first_name} "
                    f"{client.last_name[:1] if client.last_name else ''}".strip()
                ),
                "highest_severity": "low",
                "flag_categories": [],
                "latest_at": flag.created_at,
            },
        )
        if _SEVERITY_RANK[flag.severity] < _SEVERITY_RANK[entry["highest_severity"]]:
            entry["highest_severity"] = flag.severity
        if flag.category not in entry["flag_categories"]:
            entry["flag_categories"].append(flag.category)
        if flag.created_at > entry["latest_at"]:
            entry["latest_at"] = flag.created_at

    ranked = sorted(
        by_client.values(),
        key=lambda e: (
            _SEVERITY_RANK[e["highest_severity"]],
            -e["latest_at"].timestamp(),
        ),
    )

    top_clients = [
        {
            "client_name": e["client_name"],
            "summary": (
                f"{e['highest_severity'].upper()} · "
                + ", ".join(c.replace("_", " ") for c in e["flag_categories"][:3])
            ),
        }
        for e in ranked[:3]
    ]

    return DigestData(
        organization_name=agency.name,
        today=now.date().isoformat(),
        yesterday_stats=yesterday_stats,
        today_outlook=today_outlook,
        top_clients=top_clients,
    )


async def recipients_for_digest(
    db: AsyncSession, agency_id: uuid.UUID
) -> list[User]:
    """Coordinators+supervisors with morning_digest enabled in prefs."""
    rows = (
        await db.execute(
            select(User)
            .where(User.agency_id == agency_id)
            .where(User.role.in_(["coordinator", "supervisor"]))
            .where(User.status == "active")
        )
    ).scalars().all()
    return [
        u
        for u in rows
        if (u.notification_preferences or {}).get("morning_digest", True)
    ]
