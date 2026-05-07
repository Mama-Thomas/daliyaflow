"""Shift template CRUD.

Templates encode an agency's standard shift windows (AM/Evening/NOC). Coordinators
pick one when creating a shift; defaults are seeded at agency creation. Hard cap
of 10 templates per agency.
"""
from __future__ import annotations

import uuid
from datetime import datetime, time, timezone

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
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
from app.models.shift import Shift
from app.models.shift_template import ShiftTemplate
from app.schemas.shift import (
    ShiftTemplateCreate,
    ShiftTemplateRead,
    ShiftTemplateUpdate,
)
from app.services.audit_service import record_audit

router = APIRouter(prefix="/shift-templates", tags=["shift-templates"])

MAX_TEMPLATES_PER_AGENCY = 10


DEFAULT_SHIFT_TEMPLATES: list[dict] = [
    {
        "name": "AM Shift",
        "start_time": time(6, 0),
        "end_time": time(14, 0),
        "crosses_midnight": False,
        "color": "blue",
        "display_order": 1,
    },
    {
        "name": "Evening Shift",
        "start_time": time(14, 0),
        "end_time": time(22, 0),
        "crosses_midnight": False,
        "color": "purple",
        "display_order": 2,
    },
    {
        "name": "NOC Shift",
        "start_time": time(22, 0),
        "end_time": time(6, 0),
        "crosses_midnight": True,
        "color": "navy",
        "display_order": 3,
    },
]


async def seed_default_templates(
    db: AsyncSession, agency_id: uuid.UUID
) -> list[ShiftTemplate]:
    """Insert the three default templates for a new agency. Idempotent —
    skips templates whose name already exists for the agency."""
    existing_names = set(
        (
            await db.execute(
                select(ShiftTemplate.name).where(
                    ShiftTemplate.agency_id == agency_id
                )
            )
        )
        .scalars()
        .all()
    )
    created: list[ShiftTemplate] = []
    for tpl in DEFAULT_SHIFT_TEMPLATES:
        if tpl["name"] in existing_names:
            continue
        record = ShiftTemplate(agency_id=agency_id, **tpl)
        db.add(record)
        created.append(record)
    if created:
        await db.flush()
    return created


@router.get("", response_model=list[ShiftTemplateRead])
async def list_templates(
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> list[ShiftTemplateRead]:
    rows = (
        await db.execute(
            select(ShiftTemplate)
            .where(ShiftTemplate.agency_id == tenant.agency_id)
            .where(ShiftTemplate.is_active.is_(True))
            .order_by(ShiftTemplate.display_order.asc(), ShiftTemplate.name.asc())
        )
    ).scalars().all()
    return [ShiftTemplateRead.model_validate(r) for r in rows]


@router.post("", response_model=ShiftTemplateRead, status_code=201)
async def create_template(
    payload: ShiftTemplateCreate,
    request: Request,
    tenant: TenantContext = Depends(
        require_roles("coordinator", "supervisor", "admin")
    ),
    db: AsyncSession = Depends(get_db),
) -> ShiftTemplateRead:
    count = (
        await db.execute(
            select(func.count(ShiftTemplate.id))
            .where(ShiftTemplate.agency_id == tenant.agency_id)
            .where(ShiftTemplate.is_active.is_(True))
        )
    ).scalar_one()
    if int(count) >= MAX_TEMPLATES_PER_AGENCY:
        raise ValidationError(
            f"Up to {MAX_TEMPLATES_PER_AGENCY} active templates allowed."
        )

    record = ShiftTemplate(
        agency_id=tenant.agency_id,
        name=payload.name,
        start_time=payload.start_time,
        end_time=payload.end_time,
        crosses_midnight=payload.crosses_midnight,
        color=payload.color,
        display_order=payload.display_order,
    )
    db.add(record)
    await db.flush()
    await record_audit(
        db,
        action="shift_template.created",
        agency_id=tenant.agency_id,
        actor_user_id=tenant.user_id,
        target_type="shift_template",
        target_id=record.id,
        request=request,
    )
    await db.commit()
    await db.refresh(record)
    return ShiftTemplateRead.model_validate(record)


@router.patch("/{template_id}", response_model=ShiftTemplateRead)
async def update_template(
    template_id: uuid.UUID,
    payload: ShiftTemplateUpdate,
    request: Request,
    tenant: TenantContext = Depends(
        require_roles("coordinator", "supervisor", "admin")
    ),
    db: AsyncSession = Depends(get_db),
) -> ShiftTemplateRead:
    record = await db.get(ShiftTemplate, template_id)
    if record is None or record.agency_id != tenant.agency_id:
        raise ResourceNotFoundError("Template not found")

    changes = payload.model_dump(exclude_unset=True)
    for k, v in changes.items():
        setattr(record, k, v)

    await record_audit(
        db,
        action="shift_template.updated",
        agency_id=tenant.agency_id,
        actor_user_id=tenant.user_id,
        target_type="shift_template",
        target_id=record.id,
        metadata={"fields": list(changes.keys())},
        request=request,
    )
    await db.commit()
    await db.refresh(record)
    return ShiftTemplateRead.model_validate(record)


@router.delete("/{template_id}", status_code=204)
async def delete_template(
    template_id: uuid.UUID,
    request: Request,
    tenant: TenantContext = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    record = await db.get(ShiftTemplate, template_id)
    if record is None or record.agency_id != tenant.agency_id:
        raise ResourceNotFoundError("Template not found")

    # Block hard deletion if any future shift still references this template.
    future_shift = (
        await db.execute(
            select(Shift.id)
            .where(Shift.template_id == record.id)
            .where(Shift.scheduled_start >= datetime.now(timezone.utc))
            .limit(1)
        )
    ).first()
    if future_shift is not None:
        raise PermissionDeniedError(
            "Cannot delete a template with future shifts. Deactivate it instead."
        )

    record.is_active = False
    await record_audit(
        db,
        action="shift_template.deleted",
        agency_id=tenant.agency_id,
        actor_user_id=tenant.user_id,
        target_type="shift_template",
        target_id=record.id,
        request=request,
    )
    await db.commit()
    return None
