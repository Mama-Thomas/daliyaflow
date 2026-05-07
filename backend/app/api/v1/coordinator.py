import uuid
from datetime import datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import (
    TenantContext,
    require_roles,
)
from app.core.rate_limit import LIMITS, limiter
from app.core.sanitization import sanitize_text_input
from app.db.session import get_db
from app.models.client import Client
from app.models.coordinator_action import CoordinatorAction
from app.models.handoff import HandoffSummary
from app.models.risk_flag import RiskFlag
from app.models.shift import Shift
from app.models.shift_note import ShiftNoteRaw
from app.models.user import User
from app.services.audit_service import record_audit
from pydantic import BaseModel, Field, field_validator
from typing import Any

router = APIRouter(tags=["coordinator"])


class CoordinatorActionCreate(BaseModel):
    related_object_type: str = Field(min_length=1, max_length=100)
    related_object_id: uuid.UUID
    action_type: str = Field(min_length=1, max_length=100)
    note: str | None = Field(default=None, max_length=5000)

    @field_validator("note", mode="before")
    @classmethod
    def _strip(cls, v: Any) -> Any:
        if isinstance(v, str):
            return sanitize_text_input(v)
        return v


def _today_utc_bounds() -> tuple[datetime, datetime]:
    now = datetime.now(timezone.utc)
    start = datetime.combine(now.date(), time.min, tzinfo=timezone.utc)
    end = datetime.combine(now.date(), time.max, tzinfo=timezone.utc)
    return start, end


@router.get("/dashboard/summary")
async def dashboard_summary(
    tenant: TenantContext = Depends(
        require_roles("coordinator", "supervisor", "admin")
    ),
    db: AsyncSession = Depends(get_db),
) -> dict:
    start, end = _today_utc_bounds()

    submissions_today = (
        await db.execute(
            select(func.count(ShiftNoteRaw.id))
            .where(ShiftNoteRaw.agency_id == tenant.agency_id)
            .where(ShiftNoteRaw.created_at >= start)
            .where(ShiftNoteRaw.created_at <= end)
        )
    ).scalar_one()

    open_flags_rows = (
        await db.execute(
            select(RiskFlag.severity, func.count(RiskFlag.id))
            .where(RiskFlag.agency_id == tenant.agency_id)
            .where(RiskFlag.status.in_(["suggested", "confirmed", "escalated"]))
            .group_by(RiskFlag.severity)
        )
    ).all()
    open_flags_by_severity = {sev: int(cnt) for sev, cnt in open_flags_rows}
    for sev in ("high", "medium", "low"):
        open_flags_by_severity.setdefault(sev, 0)

    shifts_at_risk = (
        await db.execute(
            select(func.count(Shift.id))
            .where(Shift.agency_id == tenant.agency_id)
            .where(Shift.status == "at_risk")
        )
    ).scalar_one()

    recent_actions = (
        await db.execute(
            select(CoordinatorAction)
            .where(CoordinatorAction.agency_id == tenant.agency_id)
            .order_by(CoordinatorAction.created_at.desc())
            .limit(5)
        )
    ).scalars().all()

    # Average review time: minutes between flag.created_at and the
    # CoordinatorAction logged for it (related_object_type='risk_flag').
    seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)
    review_pairs = (
        await db.execute(
            select(
                func.extract(
                    "epoch",
                    CoordinatorAction.created_at - RiskFlag.created_at,
                ).label("delta_seconds")
            )
            .join(
                RiskFlag,
                RiskFlag.id == CoordinatorAction.related_object_id,
            )
            .where(CoordinatorAction.agency_id == tenant.agency_id)
            .where(CoordinatorAction.related_object_type == "risk_flag")
            .where(CoordinatorAction.created_at >= seven_days_ago)
        )
    ).all()
    deltas = [
        float(row[0]) for row in review_pairs if row[0] is not None and row[0] > 0
    ]
    avg_review_time_minutes: int | None = (
        int(round(sum(deltas) / len(deltas) / 60)) if deltas else None
    )

    return {
        "submissions_today": int(submissions_today),
        "open_flags_by_severity": open_flags_by_severity,
        "shifts_at_risk": int(shifts_at_risk),
        "avg_review_time_minutes": avg_review_time_minutes,
        "recent_actions": [
            {
                "id": str(a.id),
                "action_type": a.action_type,
                "related_object_type": a.related_object_type,
                "related_object_id": str(a.related_object_id),
                "note": a.note,
                "created_at": a.created_at.isoformat(),
            }
            for a in recent_actions
        ],
    }


@router.get("/dashboard/priority-queue")
async def priority_queue(
    tenant: TenantContext = Depends(
        require_roles("coordinator", "supervisor", "admin")
    ),
    db: AsyncSession = Depends(get_db),
) -> dict:
    flags = (
        await db.execute(
            select(RiskFlag)
            .where(RiskFlag.agency_id == tenant.agency_id)
            .where(RiskFlag.severity == "high")
            .where(RiskFlag.status == "suggested")
            .order_by(RiskFlag.created_at.desc())
            .limit(15)
        )
    ).scalars().all()

    at_risk = (
        await db.execute(
            select(Shift)
            .where(Shift.agency_id == tenant.agency_id)
            .where(Shift.status == "at_risk")
            .order_by(Shift.scheduled_start.desc())
            .limit(15)
        )
    ).scalars().all()

    items = [
        {
            "type": "flag",
            "id": str(f.id),
            "category": f.category,
            "severity": f.severity,
            "extracted_reason": f.extracted_reason,
            "shift_id": str(f.shift_id),
            "client_id": str(f.client_id),
            "created_at": f.created_at.isoformat(),
        }
        for f in flags
    ] + [
        {
            "type": "shift_at_risk",
            "id": str(s.id),
            "scheduled_start": s.scheduled_start.isoformat(),
            "scheduled_end": s.scheduled_end.isoformat(),
            "client_id": str(s.client_id),
            "caregiver_id": str(s.caregiver_id),
            "call_out_reason": s.call_out_reason,
            "created_at": s.created_at.isoformat(),
        }
        for s in at_risk
    ]
    items.sort(key=lambda x: x["created_at"], reverse=True)
    return {"items": items[:20]}


_SEVERITY_ORDER = {"high": 0, "medium": 1, "low": 2}


@router.get("/dashboard/shift-brief")
async def shift_brief(
    tenant: TenantContext = Depends(
        require_roles("coordinator", "supervisor", "admin")
    ),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Aggregated morning brief: clients with new (unreviewed) flags today."""
    start, end = _today_utc_bounds()

    # Pull every shift today for this agency, with the client + caregiver names.
    today_shift_rows = (
        await db.execute(
            select(Shift, Client, User)
            .join(Client, Client.id == Shift.client_id)
            .join(User, User.id == Shift.caregiver_id)
            .where(Shift.agency_id == tenant.agency_id)
            .where(Shift.scheduled_start >= start)
            .where(Shift.scheduled_start <= end)
        )
    ).all()

    if not today_shift_rows:
        return {"clients": []}

    shift_ids = [row[0].id for row in today_shift_rows]

    # Pull every unreviewed flag tied to today's shifts.
    flag_rows = (
        await db.execute(
            select(RiskFlag)
            .where(RiskFlag.agency_id == tenant.agency_id)
            .where(RiskFlag.shift_id.in_(shift_ids))
            .where(RiskFlag.status == "suggested")
        )
    ).scalars().all()

    if not flag_rows:
        return {"clients": []}

    # Latest handoff per shift for last_handoff_at lookups.
    handoff_rows = (
        await db.execute(
            select(HandoffSummary.shift_id, func.max(HandoffSummary.created_at))
            .where(HandoffSummary.agency_id == tenant.agency_id)
            .where(HandoffSummary.shift_id.in_(shift_ids))
            .group_by(HandoffSummary.shift_id)
        )
    ).all()
    latest_handoff_by_shift: dict[uuid.UUID, datetime] = {
        row[0]: row[1] for row in handoff_rows
    }

    # Group shifts and caregivers by client.
    by_client: dict[uuid.UUID, dict] = {}
    for shift, client, caregiver in today_shift_rows:
        entry = by_client.setdefault(
            client.id,
            {
                "client_id": str(client.id),
                "client_name": (
                    f"{client.preferred_name or client.first_name} "
                    f"{client.last_name[:1]}."
                ),
                "shift_ids": set(),
                "caregivers_today": set(),
                "caregiver_ids": set(),
                "new_flags": [],
                "highest_severity": "low",
                "last_handoff_at": None,
            },
        )
        entry["shift_ids"].add(shift.id)
        entry["caregivers_today"].add(
            f"{caregiver.first_name} {caregiver.last_name[:1]}."
        )
        entry["caregiver_ids"].add(caregiver.id)
        last = latest_handoff_by_shift.get(shift.id)
        if last is not None and (
            entry["last_handoff_at"] is None or last > entry["last_handoff_at"]
        ):
            entry["last_handoff_at"] = last

    # Attach flags + compute highest severity per client.
    for flag in flag_rows:
        if flag.client_id not in by_client:
            continue
        entry = by_client[flag.client_id]
        entry["new_flags"].append(
            {
                "category": flag.category,
                "severity": flag.severity,
                "extracted_reason": flag.extracted_reason,
            }
        )
        if _SEVERITY_ORDER[flag.severity] < _SEVERITY_ORDER[entry["highest_severity"]]:
            entry["highest_severity"] = flag.severity

    # Drop clients with zero unreviewed flags today.
    eligible = [c for c in by_client.values() if c["new_flags"]]

    # Pull edited handoff summaries to read supervisor_attention_needed.
    if eligible:
        client_shift_ids = [
            sid for entry in eligible for sid in entry["shift_ids"]
        ]
        sup_rows = (
            await db.execute(
                select(HandoffSummary)
                .where(HandoffSummary.agency_id == tenant.agency_id)
                .where(HandoffSummary.shift_id.in_(client_shift_ids))
            )
        ).scalars().all()
        sup_by_shift: dict[uuid.UUID, bool] = {}
        for h in sup_rows:
            payload = h.edited_summary or h.generated_summary or {}
            if payload.get("supervisor_attention_needed"):
                sup_by_shift[h.shift_id] = True
        for entry in eligible:
            entry["supervisor_attention_needed"] = any(
                sup_by_shift.get(sid, False) for sid in entry["shift_ids"]
            )

    # Sort: highest severity first, then most recent handoff.
    def sort_key(entry: dict) -> tuple:
        return (
            _SEVERITY_ORDER[entry["highest_severity"]],
            -(
                entry["last_handoff_at"].timestamp()
                if entry["last_handoff_at"]
                else 0
            ),
        )

    eligible.sort(key=sort_key)

    return {
        "clients": [
            {
                "client_id": entry["client_id"],
                "client_name": entry["client_name"],
                "shift_count_today": len(entry["shift_ids"]),
                "caregivers_today": sorted(entry["caregivers_today"]),
                "new_flags": entry["new_flags"],
                "highest_severity": entry["highest_severity"],
                "last_handoff_at": (
                    entry["last_handoff_at"].isoformat()
                    if entry["last_handoff_at"]
                    else None
                ),
                "continuity_break": len(entry["caregiver_ids"]) > 1,
                "supervisor_attention_needed": entry.get(
                    "supervisor_attention_needed", False
                ),
            }
            for entry in eligible[:10]
        ]
    }


@router.get("/coordinator/actions")
async def list_actions(
    tenant: TenantContext = Depends(
        require_roles("coordinator", "supervisor", "admin")
    ),
    db: AsyncSession = Depends(get_db),
    related_type: str | None = None,
    related_id: uuid.UUID | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list[dict]:
    stmt = select(CoordinatorAction).where(
        CoordinatorAction.agency_id == tenant.agency_id
    )
    if related_type:
        stmt = stmt.where(CoordinatorAction.related_object_type == related_type)
    if related_id:
        stmt = stmt.where(CoordinatorAction.related_object_id == related_id)
    stmt = (
        stmt.order_by(CoordinatorAction.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [
        {
            "id": str(a.id),
            "related_object_type": a.related_object_type,
            "related_object_id": str(a.related_object_id),
            "action_type": a.action_type,
            "note": a.note,
            "created_by": str(a.created_by),
            "created_at": a.created_at.isoformat(),
        }
        for a in rows
    ]


@router.post("/coordinator/actions", status_code=201)
@limiter.limit(LIMITS["coordinator_action_create"])
async def create_action(
    payload: CoordinatorActionCreate,
    request: Request,
    response: Response,
    tenant: TenantContext = Depends(
        require_roles("coordinator", "supervisor", "admin")
    ),
    db: AsyncSession = Depends(get_db),
) -> dict:
    action = CoordinatorAction(
        agency_id=tenant.agency_id,
        related_object_type=payload.related_object_type,
        related_object_id=payload.related_object_id,
        action_type=payload.action_type,
        note=payload.note,
        created_by=tenant.user_id,
    )
    db.add(action)
    await db.flush()
    await record_audit(
        db,
        action="coordinator.action_logged",
        agency_id=tenant.agency_id,
        actor_user_id=tenant.user_id,
        target_type=payload.related_object_type,
        target_id=payload.related_object_id,
        metadata={"action_type": payload.action_type},
        request=request,
    )
    await db.commit()
    await db.refresh(action)
    return {
        "id": str(action.id),
        "related_object_type": action.related_object_type,
        "related_object_id": str(action.related_object_id),
        "action_type": action.action_type,
        "note": action.note,
        "created_at": action.created_at.isoformat(),
    }
