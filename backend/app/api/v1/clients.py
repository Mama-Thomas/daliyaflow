import uuid

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import (
    TenantContext,
    get_tenant_context,
    require_roles,
)
from app.core.cache import get_carecard, set_carecard
from app.core.exceptions import PermissionDeniedError, ResourceNotFoundError
from app.db.session import get_db
from app.models.client import Client
from app.models.shift import Shift
from app.schemas.client import ClientCreate, ClientRead, ClientUpdate
from app.services.audit_service import record_audit
from app.services.continuity_service import build_carecard

router = APIRouter(prefix="/clients", tags=["clients"])


async def _caregiver_has_shift_for_client(
    db: AsyncSession, *, agency_id: uuid.UUID, caregiver_id: uuid.UUID, client_id: uuid.UUID
) -> bool:
    """True if this caregiver has at least one shift (any status, any time)
    for the given client within the same agency. Used to gate caregiver
    access to client-level briefings."""
    row = (
        await db.execute(
            select(Shift.id)
            .where(Shift.agency_id == agency_id)
            .where(Shift.caregiver_id == caregiver_id)
            .where(Shift.client_id == client_id)
            .limit(1)
        )
    ).first()
    return row is not None


async def _get_or_404(
    db: AsyncSession, client_id: uuid.UUID, agency_id: uuid.UUID
) -> Client:
    client = await db.get(Client, client_id)
    if client is None or client.agency_id != agency_id:
        # Always 404 across tenants — never reveal that the row exists elsewhere.
        raise ResourceNotFoundError("Client not found")
    return client


@router.get("", response_model=list[ClientRead])
async def list_clients(
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list[ClientRead]:
    result = await db.execute(
        select(Client)
        .where(Client.agency_id == tenant.agency_id)
        .order_by(Client.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return [ClientRead.model_validate(c) for c in result.scalars().all()]


@router.get("/{client_id}", response_model=ClientRead)
async def get_client(
    client_id: uuid.UUID,
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> ClientRead:
    client = await _get_or_404(db, client_id, tenant.agency_id)
    return ClientRead.model_validate(client)


@router.post("", response_model=ClientRead, status_code=201)
async def create_client(
    payload: ClientCreate,
    request: Request,
    tenant: TenantContext = Depends(require_roles("coordinator", "supervisor", "admin")),
    db: AsyncSession = Depends(get_db),
) -> ClientRead:
    client = Client(agency_id=tenant.agency_id, **payload.model_dump())
    db.add(client)
    await db.flush()
    await record_audit(
        db,
        action="client.created",
        agency_id=tenant.agency_id,
        actor_user_id=tenant.user_id,
        target_type="client",
        target_id=client.id,
        request=request,
    )
    await db.commit()
    await db.refresh(client)
    return ClientRead.model_validate(client)


@router.patch("/{client_id}", response_model=ClientRead)
async def update_client(
    client_id: uuid.UUID,
    payload: ClientUpdate,
    request: Request,
    tenant: TenantContext = Depends(require_roles("coordinator", "supervisor", "admin")),
    db: AsyncSession = Depends(get_db),
) -> ClientRead:
    client = await _get_or_404(db, client_id, tenant.agency_id)
    changes = payload.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(client, key, value)
    await record_audit(
        db,
        action="client.updated",
        agency_id=tenant.agency_id,
        actor_user_id=tenant.user_id,
        target_type="client",
        target_id=client.id,
        metadata={"fields": list(changes.keys())},
        request=request,
    )
    await db.commit()
    await db.refresh(client)
    return ClientRead.model_validate(client)


@router.get("/{client_id}/handoff-history")
async def handoff_history(
    client_id: uuid.UUID,
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    limit: int = 25,
    offset: int = 0,
) -> list[dict]:
    from sqlalchemy import select as _select  # local import to avoid clash

    from app.models.handoff import HandoffSummary
    from app.models.shift import Shift
    from app.models.user import User as _User

    # Confirm the client belongs to the tenant before exposing any history.
    await _get_or_404(db, client_id, tenant.agency_id)

    rows = (
        await db.execute(
            _select(HandoffSummary, Shift, _User)
            .join(Shift, Shift.id == HandoffSummary.shift_id)
            .join(_User, _User.id == Shift.caregiver_id)
            .where(HandoffSummary.agency_id == tenant.agency_id)
            .where(Shift.client_id == client_id)
            .order_by(HandoffSummary.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()

    return [
        {
            "handoff_id": str(h.id),
            "shift_id": str(s.id),
            "scheduled_start": s.scheduled_start.isoformat(),
            "scheduled_end": s.scheduled_end.isoformat(),
            "caregiver": {
                "id": str(u.id),
                "first_name": u.first_name,
                "last_initial": (u.last_name[:1] if u.last_name else ""),
            },
            "summary": h.edited_summary or h.generated_summary,
            "continuity_score": h.continuity_score,
            "score_breakdown": h.score_breakdown,
            "finalized_at": h.finalized_at.isoformat() if h.finalized_at else None,
            "caregiver_accepted": h.caregiver_accepted,
            "created_at": h.created_at.isoformat(),
        }
        for (h, s, u) in rows
    ]


@router.get("/{client_id}/continuity-briefing")
async def continuity_briefing(
    client_id: uuid.UUID,
    request: Request,
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> dict:
    # Sprint 8: caregivers can read the CareCard for any client they have a
    # shift for (past or present). Coordinators+ retain unrestricted agency-
    # scoped access.
    if tenant.role == "caregiver":
        if not await _caregiver_has_shift_for_client(
            db,
            agency_id=tenant.agency_id,
            caregiver_id=tenant.user_id,
            client_id=client_id,
        ):
            # Hide existence rather than returning 403 — a caregiver should
            # not be able to probe which clients exist in the agency by
            # walking IDs.
            raise ResourceNotFoundError("Client not found")
    elif tenant.role not in {"coordinator", "supervisor", "admin"}:
        raise PermissionDeniedError("Insufficient role")

    cached = await get_carecard(client_id)
    if cached is not None:
        await record_audit(
            db,
            action="carecard.generated",
            agency_id=tenant.agency_id,
            actor_user_id=tenant.user_id,
            target_type="client",
            target_id=client_id,
            request=request,
        )
        await db.commit()
        return {**cached, "cache_hit": True}

    try:
        card, generated_at = await build_carecard(
            db, client_id=client_id, agency_id=tenant.agency_id
        )
    except LookupError as exc:
        raise ResourceNotFoundError("Client not found") from exc

    payload = {
        "client_id": str(client_id),
        "generated_at": generated_at.isoformat(),
        "card": card.model_dump(),
    }
    await set_carecard(client_id, payload)

    await record_audit(
        db,
        action="carecard.generated",
        agency_id=tenant.agency_id,
        actor_user_id=tenant.user_id,
        target_type="client",
        target_id=client_id,
        request=request,
    )
    await db.commit()
    return {**payload, "cache_hit": False}


@router.get("/{client_id}/shift-brief")
async def shift_brief(
    client_id: uuid.UUID,
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Sprint 8: last 3 finalized handoff summaries for this client, from any
    caregiver. Returns only the structured summary — never the raw note text.

    Caregivers may access if they have a shift (any status) for this client.
    Coordinators+ get unrestricted agency-scoped access.
    """
    if tenant.role == "caregiver":
        if not await _caregiver_has_shift_for_client(
            db,
            agency_id=tenant.agency_id,
            caregiver_id=tenant.user_id,
            client_id=client_id,
        ):
            raise ResourceNotFoundError("Client not found")
    elif tenant.role not in {"coordinator", "supervisor", "admin"}:
        raise PermissionDeniedError("Insufficient role")

    # Confirm the client lives in the tenant's agency before any inner-join
    # could leak rows from another tenant via shift_id collisions.
    await _get_or_404(db, client_id, tenant.agency_id)

    from app.models.handoff import HandoffSummary
    from app.models.risk_flag import RiskFlag
    from app.models.user import User as _User

    rows = (
        await db.execute(
            select(HandoffSummary, Shift, _User)
            .join(Shift, Shift.id == HandoffSummary.shift_id)
            .join(_User, _User.id == Shift.caregiver_id)
            .where(HandoffSummary.agency_id == tenant.agency_id)
            .where(Shift.client_id == client_id)
            .order_by(HandoffSummary.created_at.desc())
            .limit(3)
        )
    ).all()

    out: list[dict] = []
    for handoff, shift, caregiver in rows:
        confirmed_flags = (
            await db.execute(
                select(RiskFlag)
                .where(RiskFlag.handoff_id == handoff.id)
                .where(RiskFlag.agency_id == tenant.agency_id)
                .where(RiskFlag.status == "confirmed")
            )
        ).scalars().all()
        summary = handoff.edited_summary or handoff.generated_summary or {}
        out.append(
            {
                "handoff_id": str(handoff.id),
                "caregiver_first_name": caregiver.first_name,
                "caregiver_last_initial": (
                    caregiver.last_name[:1] if caregiver.last_name else ""
                ),
                "shift_date": shift.scheduled_start.date().isoformat(),
                "summary_overview": summary.get("summary_overview", "")
                if isinstance(summary, dict)
                else "",
                "notable_changes": summary.get("notable_changes", "")
                if isinstance(summary, dict)
                else "",
                "risk_flags": [
                    {
                        "category": f.category,
                        "severity": f.severity,
                    }
                    for f in confirmed_flags
                ],
            }
        )

    return {"client_id": str(client_id), "entries": out}


@router.get("/{client_id}/timeline")
async def client_timeline(
    client_id: uuid.UUID,
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    days: int = Query(30, ge=1, le=180),
) -> dict:
    """Activity timeline for the client over `days` (default 30).

    Coordinators+ unrestricted; caregivers must have a shift for the client.
    Each entry is one of: shift, flag, continuity_event, coordinator_action.
    """
    from datetime import datetime as _dt, timedelta, timezone as _tz

    from app.models.continuity import ContinuityEvent
    from app.models.coordinator_action import CoordinatorAction
    from app.models.handoff import HandoffSummary
    from app.models.risk_flag import RiskFlag
    from app.models.user import User as _User

    if tenant.role == "caregiver":
        if not await _caregiver_has_shift_for_client(
            db,
            agency_id=tenant.agency_id,
            caregiver_id=tenant.user_id,
            client_id=client_id,
        ):
            raise ResourceNotFoundError("Client not found")
    elif tenant.role not in {"coordinator", "supervisor", "admin"}:
        raise PermissionDeniedError("Insufficient role")

    await _get_or_404(db, client_id, tenant.agency_id)
    cutoff = _dt.now(_tz.utc) - timedelta(days=days)

    # Shifts (with their handoff for summary text + caregiver name)
    shift_rows = (
        await db.execute(
            select(Shift, HandoffSummary, _User)
            .outerjoin(HandoffSummary, HandoffSummary.shift_id == Shift.id)
            .join(_User, _User.id == Shift.caregiver_id)
            .where(Shift.agency_id == tenant.agency_id)
            .where(Shift.client_id == client_id)
            .where(Shift.scheduled_start >= cutoff)
        )
    ).all()

    # Flags
    flag_rows = (
        await db.execute(
            select(RiskFlag, _User)
            .outerjoin(_User, _User.id == RiskFlag.reviewed_by)
            .where(RiskFlag.agency_id == tenant.agency_id)
            .where(RiskFlag.client_id == client_id)
            .where(RiskFlag.created_at >= cutoff)
        )
    ).all()

    # Continuity events
    cont_rows = (
        await db.execute(
            select(ContinuityEvent)
            .where(ContinuityEvent.agency_id == tenant.agency_id)
            .where(ContinuityEvent.client_id == client_id)
            .where(ContinuityEvent.created_at >= cutoff)
        )
    ).scalars().all()

    # Coordinator actions tied to flags or shifts for this client
    coord_action_rows = (
        await db.execute(
            select(CoordinatorAction, _User)
            .join(_User, _User.id == CoordinatorAction.created_by)
            .where(CoordinatorAction.agency_id == tenant.agency_id)
            .where(CoordinatorAction.created_at >= cutoff)
        )
    ).all()

    entries: list[dict] = []

    for shift, handoff, caregiver in shift_rows:
        summary_text = ""
        if handoff is not None:
            summary = handoff.edited_summary or handoff.generated_summary or {}
            if isinstance(summary, dict):
                summary_text = (summary.get("summary_overview") or "")[:200]
        entries.append(
            {
                "date": shift.scheduled_start.isoformat(),
                "type": "shift",
                "caregiver_name": (
                    f"{caregiver.first_name} "
                    f"{caregiver.last_name[:1] if caregiver.last_name else ''}".strip()
                ),
                "caregiver_id": str(caregiver.id),
                "summary": summary_text or "Shift recorded",
                "severity": None,
                "is_continuity_break": False,
                "details_id": str(handoff.id) if handoff else str(shift.id),
                "shift_id": str(shift.id),
            }
        )

    for flag, reviewer in flag_rows:
        entries.append(
            {
                "date": flag.created_at.isoformat(),
                "type": "flag",
                "caregiver_name": (
                    f"{reviewer.first_name}" if reviewer else None
                ),
                "summary": flag.extracted_reason[:200],
                "severity": flag.severity,
                "is_continuity_break": False,
                "details_id": str(flag.id),
                "category": flag.category,
                "status": flag.status,
                "metadata": flag.flag_metadata or {},
            }
        )

    for evt in cont_rows:
        entries.append(
            {
                "date": evt.created_at.isoformat(),
                "type": "continuity_event",
                "caregiver_name": None,
                "summary": evt.description[:200],
                "severity": evt.severity,
                "is_continuity_break": True,
                "details_id": str(evt.id),
                "category": evt.category,
                "status": evt.status,
            }
        )

    # Filter coordinator actions to those tied to this client (via shift/flag).
    flag_id_set = {f.id for (f, _r) in flag_rows}
    shift_id_set = {s.id for (s, _h, _u) in shift_rows}
    for action, actor in coord_action_rows:
        if action.related_object_type == "risk_flag" and action.related_object_id in flag_id_set:
            keep = True
        elif action.related_object_type == "shift" and action.related_object_id in shift_id_set:
            keep = True
        else:
            keep = False
        if not keep:
            continue
        entries.append(
            {
                "date": action.created_at.isoformat(),
                "type": "coordinator_action",
                "caregiver_name": (
                    f"{actor.first_name} {actor.last_name[:1] if actor.last_name else ''}".strip()
                ),
                "summary": (action.note or action.action_type)[:200],
                "severity": None,
                "is_continuity_break": False,
                "details_id": str(action.id),
                "action_type": action.action_type,
            }
        )

    entries.sort(key=lambda e: e["date"])

    # Mark continuity breaks: walk consecutive shift entries and detect
    # caregiver changes from one shift to the next.
    prev_caregiver: str | None = None
    for e in entries:
        if e["type"] == "shift":
            cid = e.get("caregiver_id")
            if prev_caregiver and cid != prev_caregiver:
                e["is_continuity_break"] = True
            prev_caregiver = cid

    return {
        "client_id": str(client_id),
        "days": days,
        "entries": entries,
    }


FAMILY_SUMMARY_SYSTEM_PROMPT = """
You are generating a weekly care update for a family member of a senior care resident.
Write in warm, plain English. No medical jargon. No clinical language.
Focus on: how they seemed emotionally, activities they enjoyed, any positive moments,
things to be aware of (only if significant — do not alarm unnecessarily).
Keep it under 150 words. Sound like it was written by someone who genuinely cares.
Do not mention specific medications by name. Do not include clinical assessments.
Output ONLY the summary text — no preamble, no JSON, no headings.
""".strip()


@router.get("/{client_id}/family-summary")
async def family_summary(
    client_id: uuid.UUID,
    request: Request,
    tenant: TenantContext = Depends(
        require_roles("coordinator", "supervisor", "admin")
    ),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Plain-language weekly summary for a family member.

    Coordinator/supervisor/admin only. Pulls last 7 days of finalized handoff
    summaries for this client and asks Claude to render them as a warm,
    non-clinical update.
    """
    from datetime import datetime as _dt, timedelta, timezone as _tz

    from app.core.config import settings as _settings
    from app.models.handoff import HandoffSummary
    from app.services.ai_pipeline import _call_with_retry  # type: ignore

    await _get_or_404(db, client_id, tenant.agency_id)

    week_end = _dt.now(_tz.utc)
    week_start = week_end - timedelta(days=7)

    handoffs = (
        await db.execute(
            select(HandoffSummary)
            .join(Shift, Shift.id == HandoffSummary.shift_id)
            .where(HandoffSummary.agency_id == tenant.agency_id)
            .where(Shift.client_id == client_id)
            .where(HandoffSummary.created_at >= week_start)
            .order_by(HandoffSummary.created_at.asc())
        )
    ).scalars().all()

    if not handoffs:
        return {
            "summary_text": (
                "No shift activity has been recorded for this client in the past week."
            ),
            "generated_at": week_end.isoformat(),
            "week_start": week_start.date().isoformat(),
            "week_end": week_end.date().isoformat(),
        }

    overview_lines: list[str] = []
    for h in handoffs:
        s = h.edited_summary or h.generated_summary or {}
        if not isinstance(s, dict):
            continue
        date_str = h.created_at.date().isoformat()
        overview_lines.append(
            f"- {date_str}: {s.get('summary_overview', '')} "
            f"{('Notable: ' + s['notable_changes']) if s.get('notable_changes') else ''}"
        )
    notes_blob = "\n".join(overview_lines).strip() or "No detailed notes available."

    user_prompt = (
        "Below are operational shift notes from the past week for one resident. "
        "Write a warm, plain-English weekly update for their family. "
        "Aim for 100-150 words.\n\n"
        f"Notes:\n{notes_blob}"
    )

    summary_text: str
    if not _settings.ANTHROPIC_API_KEY:
        # Fallback: synthesize from the overview lines.
        summary_text = (
            "This week your loved one was cared for during their scheduled "
            "shifts. The team noted activities, mood, and any items the next "
            "caregiver should be aware of. Reach out to the care coordinator "
            "for any specific questions."
        )
    else:
        try:
            summary_text = (
                await _call_with_retry(
                    FAMILY_SUMMARY_SYSTEM_PROMPT, user_prompt, max_tokens=600
                )
            ).strip()
        except Exception:
            summary_text = (
                "This week your loved one was supported through their shifts. "
                "Please reach out to the care team for a more detailed update."
            )

    await record_audit(
        db,
        action="family_summary.generated",
        agency_id=tenant.agency_id,
        actor_user_id=tenant.user_id,
        target_type="client",
        target_id=client_id,
        request=request,
    )
    await db.commit()

    return {
        "summary_text": summary_text,
        "generated_at": week_end.isoformat(),
        "week_start": week_start.date().isoformat(),
        "week_end": week_end.date().isoformat(),
    }
