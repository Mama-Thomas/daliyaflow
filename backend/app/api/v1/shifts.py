import uuid
from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, ConfigDict
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
    ValidationError,
)
from app.db.session import get_db
from app.models.client import Client
from app.models.continuity import ContinuityEvent
from app.models.shift import Shift
from app.models.shift_note import ShiftNoteRaw
from app.models.shift_template import ShiftTemplate
from app.models.user import User
from app.schemas.shift import AtRiskRequest, ShiftCreate, ShiftRead, ShiftUpdate
from app.services.audit_service import record_audit


class RawNoteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    shift_id: uuid.UUID
    input_type: str
    raw_text: str
    transcript_confidence: float | None = None
    original_language: str | None = None
    language_name: str | None = None
    original_text: str | None = None
    translated_text: str | None = None
    created_at: datetime

router = APIRouter(prefix="/shifts", tags=["shifts"])


async def _get_shift_or_404(
    db: AsyncSession, shift_id: uuid.UUID, agency_id: uuid.UUID
) -> Shift:
    shift = await db.get(Shift, shift_id)
    if shift is None or shift.agency_id != agency_id:
        raise ResourceNotFoundError("Shift not found")
    return shift


@router.get("", response_model=list[ShiftRead])
async def list_shifts(
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    on_date: date | None = Query(default=None, alias="date"),
    status: str | None = None,
    caregiver_id: uuid.UUID | None = None,
    client_id: uuid.UUID | None = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> list[ShiftRead]:
    stmt = select(Shift).where(Shift.agency_id == tenant.agency_id)

    # Caregivers can only see their own shifts.
    if tenant.role == "caregiver":
        stmt = stmt.where(Shift.caregiver_id == tenant.user_id)

    if status is not None:
        stmt = stmt.where(Shift.status == status)
    if caregiver_id is not None:
        stmt = stmt.where(Shift.caregiver_id == caregiver_id)
    if client_id is not None:
        stmt = stmt.where(Shift.client_id == client_id)
    if on_date is not None:
        day_start = datetime.combine(on_date, time.min, tzinfo=timezone.utc)
        day_end = datetime.combine(on_date, time.max, tzinfo=timezone.utc)
        stmt = stmt.where(Shift.scheduled_start >= day_start, Shift.scheduled_start <= day_end)

    stmt = stmt.order_by(Shift.scheduled_start.asc()).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return [ShiftRead.model_validate(s) for s in result.scalars().all()]


@router.post("", response_model=ShiftRead, status_code=201)
async def create_shift(
    payload: ShiftCreate,
    request: Request,
    tenant: TenantContext = Depends(
        require_roles("coordinator", "supervisor", "admin")
    ),
    db: AsyncSession = Depends(get_db),
) -> ShiftRead:
    # Tenant-scope validation: client + caregiver must belong to the agency.
    client = await db.get(Client, payload.client_id)
    if client is None or client.agency_id != tenant.agency_id:
        raise ResourceNotFoundError("Client not found")
    caregiver = await db.get(User, payload.caregiver_id)
    if caregiver is None or caregiver.agency_id != tenant.agency_id:
        raise ResourceNotFoundError("Caregiver not found")

    template = None
    template_name = None
    scheduled_start = payload.scheduled_start
    scheduled_end = payload.scheduled_end

    if payload.template_id is not None:
        template = await db.get(ShiftTemplate, payload.template_id)
        if template is None or template.agency_id != tenant.agency_id:
            raise ResourceNotFoundError("Template not found")
        template_name = template.name
        # Compose scheduled times from the template + the date in scheduled_start.
        date_anchor = scheduled_start.date()
        scheduled_start = datetime.combine(
            date_anchor, template.start_time, tzinfo=timezone.utc
        )
        end_date = (
            date_anchor + timedelta(days=1)
            if template.crosses_midnight
            else date_anchor
        )
        scheduled_end = datetime.combine(
            end_date, template.end_time, tzinfo=timezone.utc
        )

    if scheduled_end <= scheduled_start:
        raise ValidationError("scheduled_end must be after scheduled_start.")

    shift = Shift(
        agency_id=tenant.agency_id,
        client_id=payload.client_id,
        caregiver_id=payload.caregiver_id,
        scheduled_start=scheduled_start,
        scheduled_end=scheduled_end,
        notes=payload.notes,
        template_id=template.id if template else None,
        template_name=template_name,
    )
    db.add(shift)
    await db.flush()
    await record_audit(
        db,
        action="shift.created",
        agency_id=tenant.agency_id,
        actor_user_id=tenant.user_id,
        target_type="shift",
        target_id=shift.id,
        metadata={
            "template_id": str(template.id) if template else None,
            "template_name": template_name,
        },
        request=request,
    )
    await db.commit()
    await db.refresh(shift)
    return ShiftRead.model_validate(shift)


@router.get("/{shift_id}", response_model=ShiftRead)
async def get_shift(
    shift_id: uuid.UUID,
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> ShiftRead:
    shift = await _get_shift_or_404(db, shift_id, tenant.agency_id)
    if tenant.role == "caregiver" and shift.caregiver_id != tenant.user_id:
        # Don't reveal existence to caregivers from a sibling shift.
        raise ResourceNotFoundError("Shift not found")
    return ShiftRead.model_validate(shift)


@router.patch("/{shift_id}", response_model=ShiftRead)
async def update_shift(
    shift_id: uuid.UUID,
    payload: ShiftUpdate,
    request: Request,
    tenant: TenantContext = Depends(require_roles("coordinator", "supervisor", "admin")),
    db: AsyncSession = Depends(get_db),
) -> ShiftRead:
    shift = await _get_shift_or_404(db, shift_id, tenant.agency_id)
    changes = payload.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(shift, key, value)
    await record_audit(
        db,
        action="shift.updated",
        agency_id=tenant.agency_id,
        actor_user_id=tenant.user_id,
        target_type="shift",
        target_id=shift.id,
        metadata={"fields": list(changes.keys())},
        request=request,
    )
    await db.commit()
    await db.refresh(shift)
    return ShiftRead.model_validate(shift)


@router.get("/{shift_id}/notes/raw", response_model=RawNoteRead)
async def get_raw_note(
    shift_id: uuid.UUID,
    request: Request,
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> RawNoteRead:
    """Access to the original caregiver shift note.

    Coordinators+ have unrestricted agency-scoped access. Caregivers can
    read the raw note for a shift they were assigned to, or for any shift
    involving a client they have other shifts with — same shared-client
    visibility used for CareCard / shift brief / flag list.
    """
    shift = await _get_shift_or_404(db, shift_id, tenant.agency_id)

    if tenant.role == "caregiver":
        has_access = shift.caregiver_id == tenant.user_id
        if not has_access:
            row = (
                await db.execute(
                    select(Shift.id)
                    .where(Shift.agency_id == tenant.agency_id)
                    .where(Shift.caregiver_id == tenant.user_id)
                    .where(Shift.client_id == shift.client_id)
                    .limit(1)
                )
            ).first()
            has_access = row is not None
        if not has_access:
            # Hide existence rather than 403, matching the CareCard pattern.
            raise ResourceNotFoundError("Note not found")
    elif tenant.role not in {"coordinator", "supervisor", "admin"}:
        raise PermissionDeniedError("Insufficient role")

    note = (
        await db.execute(
            select(ShiftNoteRaw)
            .where(ShiftNoteRaw.shift_id == shift.id)
            .order_by(ShiftNoteRaw.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    if note is None or note.agency_id != tenant.agency_id:
        raise ResourceNotFoundError("Note not found")

    await record_audit(
        db,
        action="note.raw_accessed",
        agency_id=tenant.agency_id,
        actor_user_id=tenant.user_id,
        target_type="shift_note",
        target_id=note.id,
        request=request,
    )
    await db.commit()

    return RawNoteRead.model_validate(note)


@router.post("/{shift_id}/at-risk", response_model=ShiftRead)
async def mark_shift_at_risk(
    shift_id: uuid.UUID,
    payload: AtRiskRequest,
    request: Request,
    tenant: TenantContext = Depends(require_roles("coordinator", "supervisor", "admin")),
    db: AsyncSession = Depends(get_db),
) -> ShiftRead:
    shift = await _get_shift_or_404(db, shift_id, tenant.agency_id)
    shift.status = "at_risk"
    shift.call_out_reason = payload.reason

    db.add(
        ContinuityEvent(
            agency_id=tenant.agency_id,
            client_id=shift.client_id,
            shift_id=shift.id,
            category="shift_at_risk",
            description=payload.reason,
            severity="high",
            status="open",
        )
    )
    await record_audit(
        db,
        action="shift.marked_at_risk",
        agency_id=tenant.agency_id,
        actor_user_id=tenant.user_id,
        target_type="shift",
        target_id=shift.id,
        metadata={"reason": payload.reason[:200]},
        request=request,
    )
    await db.commit()
    await db.refresh(shift)
    return ShiftRead.model_validate(shift)
