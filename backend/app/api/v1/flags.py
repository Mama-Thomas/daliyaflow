import uuid
from datetime import date, datetime, time, timezone

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import (
    TenantContext,
    get_tenant_context,
    require_roles,
)
from app.core.exceptions import (
    PermissionDeniedError,
    ResourceNotFoundError,
)
from app.core.rate_limit import LIMITS, limiter
from app.db.session import get_db
from app.models.coordinator_action import CoordinatorAction
from app.models.risk_flag import RiskFlag
from app.models.shift import Shift
from app.schemas.risk_flag import (
    RiskFlagCreate,
    RiskFlagRead,
    RiskFlagUpdate,
)
from app.services.audit_service import record_audit
from app.services.email_service import send_flag_escalation_notification

router = APIRouter(prefix="/flags", tags=["flags"])


async def _get_flag_or_404(
    db: AsyncSession, flag_id: uuid.UUID, agency_id: uuid.UUID
) -> RiskFlag:
    flag = await db.get(RiskFlag, flag_id)
    if flag is None or flag.agency_id != agency_id:
        raise ResourceNotFoundError("Flag not found")
    return flag


def _audit_action_for(status_value: str) -> str:
    return {
        "confirmed": "flag.confirmed",
        "dismissed": "flag.dismissed",
        "escalated": "flag.escalated",
        "resolved": "flag.resolved",
    }.get(status_value, "flag.updated")


@router.get("", response_model=list[RiskFlagRead])
async def list_flags(
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    status_value: str | None = Query(default=None, alias="status"),
    severity: str | None = None,
    client_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list[RiskFlagRead]:
    stmt = select(RiskFlag).where(RiskFlag.agency_id == tenant.agency_id)

    if tenant.role == "caregiver":
        # Caregivers see flags for any client they have shifts with —
        # shared-client visibility, not just their own shifts.
        shared_client_ids = (
            await db.execute(
                select(Shift.client_id)
                .where(Shift.agency_id == tenant.agency_id)
                .where(Shift.caregiver_id == tenant.user_id)
                .distinct()
            )
        ).scalars().all()
        if not shared_client_ids:
            return []
        stmt = stmt.where(RiskFlag.client_id.in_(shared_client_ids))

    if status_value:
        stmt = stmt.where(RiskFlag.status == status_value)
    if severity:
        stmt = stmt.where(RiskFlag.severity == severity)
    if client_id:
        stmt = stmt.where(RiskFlag.client_id == client_id)
    if date_from:
        stmt = stmt.where(
            RiskFlag.created_at
            >= datetime.combine(date_from, time.min, tzinfo=timezone.utc)
        )
    if date_to:
        stmt = stmt.where(
            RiskFlag.created_at
            <= datetime.combine(date_to, time.max, tzinfo=timezone.utc)
        )

    stmt = stmt.order_by(RiskFlag.created_at.desc()).limit(limit).offset(offset)
    flags = (await db.execute(stmt)).scalars().all()

    if tenant.role != "caregiver":
        return [RiskFlagRead.model_validate(f) for f in flags]

    # Enrich caregiver responses with client name + flag origin.
    from app.models.client import Client as _Client
    from app.models.user import User as _User

    shift_ids = {f.shift_id for f in flags}
    client_ids = {f.client_id for f in flags}
    shifts_by_id: dict[uuid.UUID, Shift] = {}
    if shift_ids:
        shifts_by_id = {
            s.id: s
            for s in (
                await db.execute(select(Shift).where(Shift.id.in_(shift_ids)))
            ).scalars().all()
        }
    caregiver_ids = {
        s.caregiver_id for s in shifts_by_id.values() if s.caregiver_id
    }
    caregivers_by_id: dict[uuid.UUID, _User] = {}
    if caregiver_ids:
        caregivers_by_id = {
            u.id: u
            for u in (
                await db.execute(select(_User).where(_User.id.in_(caregiver_ids)))
            ).scalars().all()
        }
    clients_by_id: dict[uuid.UUID, _Client] = {}
    if client_ids:
        clients_by_id = {
            c.id: c
            for c in (
                await db.execute(
                    select(_Client).where(_Client.id.in_(client_ids))
                )
            ).scalars().all()
        }

    enriched: list[RiskFlagRead] = []
    for f in flags:
        shift = shifts_by_id.get(f.shift_id)
        caregiver = caregivers_by_id.get(shift.caregiver_id) if shift else None
        client = clients_by_id.get(f.client_id)
        item = RiskFlagRead.model_validate(f)
        item.caregiver_first_name = caregiver.first_name if caregiver else None
        item.client_preferred_name = (
            client.preferred_name or client.first_name if client else None
        )
        item.client_last_initial = (
            client.last_name[:1] if client and client.last_name else None
        )
        item.is_own_note = bool(shift and shift.caregiver_id == tenant.user_id)
        enriched.append(item)
    return enriched


@router.get("/{flag_id}", response_model=RiskFlagRead)
async def get_flag(
    flag_id: uuid.UUID,
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> RiskFlagRead:
    flag = await _get_flag_or_404(db, flag_id, tenant.agency_id)
    if tenant.role == "caregiver":
        shift = await db.get(Shift, flag.shift_id)
        if shift is None or shift.caregiver_id != tenant.user_id:
            raise ResourceNotFoundError("Flag not found")
    return RiskFlagRead.model_validate(flag)


@router.patch("/{flag_id}", response_model=RiskFlagRead)
@limiter.limit(LIMITS["flag_update"])
async def update_flag(
    flag_id: uuid.UUID,
    payload: RiskFlagUpdate,
    request: Request,
    response: Response,
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> RiskFlagRead:
    flag = await _get_flag_or_404(db, flag_id, tenant.agency_id)

    if tenant.role == "caregiver":
        shift = await db.get(Shift, flag.shift_id)
        if shift is None or shift.caregiver_id != tenant.user_id:
            raise PermissionDeniedError("You can only act on flags from your own shifts.")
        if payload.status == "escalated":
            raise PermissionDeniedError("Caregivers cannot escalate flags.")

    now = datetime.now(timezone.utc)
    if payload.status:
        flag.status = payload.status
        flag.reviewed_by = tenant.user_id
        flag.reviewed_at = now
        if payload.status == "resolved":
            flag.resolved_at = now

    # Always log a coordinator action for status changes — feeds the
    # dashboard avg-review-time stat. The note is optional.
    if payload.status or payload.note:
        db.add(
            CoordinatorAction(
                agency_id=tenant.agency_id,
                related_object_type="risk_flag",
                related_object_id=flag.id,
                action_type=payload.status or "flag_reviewed",
                note=payload.note,
                created_by=tenant.user_id,
            )
        )

    await record_audit(
        db,
        action=_audit_action_for(payload.status or "update"),
        agency_id=tenant.agency_id,
        actor_user_id=tenant.user_id,
        target_type="risk_flag",
        target_id=flag.id,
        metadata={"new_status": payload.status} if payload.status else None,
        request=request,
    )
    await db.commit()
    await db.refresh(flag)

    if payload.status == "escalated":
        await _send_escalation_email(db, flag)

    return RiskFlagRead.model_validate(flag)


async def _send_escalation_email(db: AsyncSession, flag: RiskFlag) -> None:
    """Best-effort escalation notification. Never raises into the caller."""
    try:
        from app.models.client import Client
        from app.models.shift import Shift
        from app.models.user import User as _User

        client_obj = await db.get(Client, flag.client_id)
        shift_obj = await db.get(Shift, flag.shift_id)
        caregiver_obj = (
            await db.get(_User, shift_obj.caregiver_id) if shift_obj else None
        )
        coordinators = (
            await db.execute(
                select(_User)
                .where(_User.agency_id == flag.agency_id)
                .where(_User.role.in_(["coordinator", "supervisor"]))
                .where(_User.status == "active")
            )
        ).scalars().all()

        client_label = (
            f"{client_obj.preferred_name or client_obj.first_name} "
            f"{client_obj.last_name[:1] if client_obj.last_name else ''}".strip()
            if client_obj
            else "Client"
        )
        caregiver_label = (
            f"{caregiver_obj.first_name} {caregiver_obj.last_name[:1] if caregiver_obj.last_name else ''}".strip()
            if caregiver_obj
            else "Caregiver"
        )
        shift_time = (
            shift_obj.scheduled_start.strftime("%a %b %d, %I:%M %p")
            if shift_obj
            else ""
        )
        for coord in coordinators:
            send_flag_escalation_notification(
                coordinator_email=coord.email,
                coordinator_name=coord.first_name,
                client_name=client_label,
                flag_category=flag.category.replace("_", " ").title(),
                caregiver_name=caregiver_label,
                shift_time=shift_time,
            )
    except Exception:
        # Never break the API on an email failure.
        import logging as _logging

        _logging.getLogger(__name__).exception("flag_escalation_email_failed")


@router.post("", response_model=RiskFlagRead, status_code=201)
async def create_flag(
    payload: RiskFlagCreate,
    request: Request,
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> RiskFlagRead:
    shift = await db.get(Shift, payload.shift_id)
    if shift is None or shift.agency_id != tenant.agency_id:
        raise ResourceNotFoundError("Shift not found")
    if tenant.role == "caregiver" and shift.caregiver_id != tenant.user_id:
        raise PermissionDeniedError("Caregivers can only flag their own shifts.")

    flag = RiskFlag(
        shift_id=shift.id,
        client_id=shift.client_id,
        agency_id=tenant.agency_id,
        category=payload.category,
        severity=payload.severity,
        extracted_reason=payload.extracted_reason,
        status="confirmed",  # manually-entered flags are inherently confirmed
        reviewed_by=tenant.user_id,
        reviewed_at=datetime.now(timezone.utc),
    )
    db.add(flag)
    await db.flush()
    await record_audit(
        db,
        action="flag.manually_created",
        agency_id=tenant.agency_id,
        actor_user_id=tenant.user_id,
        target_type="risk_flag",
        target_id=flag.id,
        metadata={"category": flag.category, "severity": flag.severity},
        request=request,
    )
    await db.commit()
    await db.refresh(flag)
    return RiskFlagRead.model_validate(flag)
