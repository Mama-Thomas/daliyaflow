import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import (
    TenantContext,
    require_roles,
)
from app.core.exceptions import ResourceNotFoundError
from app.db.session import get_db
from app.models.continuity import ContinuityEvent
from app.services.audit_service import record_audit

router = APIRouter(prefix="/continuity", tags=["continuity"])


class ContinuityResolve(BaseModel):
    status: str = Field(default="resolved")
    note: str | None = Field(default=None, max_length=2000)


@router.get("/events")
async def list_events(
    tenant: TenantContext = Depends(
        require_roles("coordinator", "supervisor", "admin")
    ),
    db: AsyncSession = Depends(get_db),
    status: str | None = None,
    severity: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list[dict]:
    stmt = select(ContinuityEvent).where(
        ContinuityEvent.agency_id == tenant.agency_id
    )
    if status:
        stmt = stmt.where(ContinuityEvent.status == status)
    if severity:
        stmt = stmt.where(ContinuityEvent.severity == severity)
    stmt = (
        stmt.order_by(ContinuityEvent.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [
        {
            "id": str(e.id),
            "client_id": str(e.client_id),
            "shift_id": str(e.shift_id) if e.shift_id else None,
            "category": e.category,
            "description": e.description,
            "severity": e.severity,
            "status": e.status,
            "resolved_by": str(e.resolved_by) if e.resolved_by else None,
            "resolved_at": e.resolved_at.isoformat() if e.resolved_at else None,
            "created_at": e.created_at.isoformat(),
        }
        for e in rows
    ]


@router.patch("/events/{event_id}")
async def update_event(
    event_id: uuid.UUID,
    payload: ContinuityResolve,
    request: Request,
    tenant: TenantContext = Depends(
        require_roles("coordinator", "supervisor", "admin")
    ),
    db: AsyncSession = Depends(get_db),
) -> dict:
    event = await db.get(ContinuityEvent, event_id)
    if event is None or event.agency_id != tenant.agency_id:
        raise ResourceNotFoundError("Continuity event not found")
    if payload.status in ("open", "in_progress", "resolved"):
        event.status = payload.status
    if payload.status == "resolved":
        event.resolved_by = tenant.user_id
        event.resolved_at = datetime.now(timezone.utc)

    await record_audit(
        db,
        action=f"continuity.{event.status}",
        agency_id=tenant.agency_id,
        actor_user_id=tenant.user_id,
        target_type="continuity_event",
        target_id=event.id,
        metadata={"status": event.status},
        request=request,
    )
    await db.commit()
    await db.refresh(event)
    return {
        "id": str(event.id),
        "status": event.status,
        "resolved_at": event.resolved_at.isoformat() if event.resolved_at else None,
    }
