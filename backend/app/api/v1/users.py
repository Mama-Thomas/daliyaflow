import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import (
    TenantContext,
    get_current_user,
    get_tenant_context,
    require_roles,
)
from app.core.exceptions import (
    PermissionDeniedError,
    ResourceNotFoundError,
)
from app.core.rate_limit import LIMITS, limiter
from app.db.session import get_db
from app.models.agency import Agency
from app.models.user import User
from app.schemas.auth import UserPublic
from app.services.audit_service import record_audit

router = APIRouter(tags=["users"])


# ---------- Schemas ----------


class UserUpdate(BaseModel):
    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    last_name: str | None = Field(default=None, min_length=1, max_length=100)
    notification_preferences: dict | None = None


class AgencyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    timezone: str | None = Field(default=None, min_length=1, max_length=100)


class AgencyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    timezone: str
    plan: str


# ---------- Endpoints ----------


@router.patch("/users/me", response_model=UserPublic)
async def update_me(
    payload: UserUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserPublic:
    changes = payload.model_dump(exclude_unset=True)
    if "notification_preferences" in changes and changes["notification_preferences"]:
        # Merge into existing prefs so partial updates don't blow away other keys.
        merged = dict(current_user.notification_preferences or {})
        merged.update(changes["notification_preferences"])
        changes["notification_preferences"] = merged
    for key, value in changes.items():
        setattr(current_user, key, value)
    await record_audit(
        db,
        action="user.profile_updated",
        agency_id=current_user.agency_id,
        actor_user_id=current_user.id,
        target_type="user",
        target_id=current_user.id,
        metadata={"fields": list(changes.keys())},
        request=request,
    )
    await db.commit()
    await db.refresh(current_user)
    return UserPublic.model_validate(current_user)


@router.get("/agencies/me", response_model=AgencyRead)
async def get_my_agency(
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> AgencyRead:
    """Any authenticated user can read the name + timezone of their own
    organization. Used by the sidebar to display the org label."""
    agency = await db.get(Agency, tenant.agency_id)
    if agency is None:
        raise ResourceNotFoundError("Organization not found")
    return AgencyRead.model_validate(agency)


@router.patch("/agencies/{agency_id}", response_model=AgencyRead)
async def update_agency(
    agency_id: uuid.UUID,
    payload: AgencyUpdate,
    request: Request,
    tenant: TenantContext = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
) -> AgencyRead:
    if agency_id != tenant.agency_id:
        # Cross-tenant access — never reveal existence.
        raise ResourceNotFoundError("Agency not found")

    agency = await db.get(Agency, agency_id)
    if agency is None:
        raise ResourceNotFoundError("Agency not found")

    changes = payload.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(agency, key, value)
    await record_audit(
        db,
        action="agency.updated",
        agency_id=tenant.agency_id,
        actor_user_id=tenant.user_id,
        target_type="agency",
        target_id=agency.id,
        metadata={"fields": list(changes.keys())},
        request=request,
    )
    await db.commit()
    await db.refresh(agency)
    return AgencyRead.model_validate(agency)


# ---------- Sessions ----------


class SessionRead(BaseModel):
    id: uuid.UUID
    device_info: dict
    created_at: datetime
    expires_at: datetime
    is_current: bool = False


class CaregiverScoreSummary(BaseModel):
    monthly_average: float | None
    last_month_average: float | None
    handoff_count_this_month: int


@router.get("/users/me/handoff-score", response_model=CaregiverScoreSummary)
async def my_handoff_score(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CaregiverScoreSummary:
    """Caregiver's average handoff continuity score for the current and prior month."""
    from datetime import datetime as _dt, timezone as _tz, timedelta

    from sqlalchemy import func as _func

    from app.models.handoff import HandoffSummary
    from app.models.shift import Shift

    now = _dt.now(_tz.utc)
    this_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if this_month_start.month == 1:
        last_month_start = this_month_start.replace(
            year=this_month_start.year - 1, month=12
        )
    else:
        last_month_start = this_month_start.replace(
            month=this_month_start.month - 1
        )

    rows = (
        await db.execute(
            select(HandoffSummary.continuity_score, HandoffSummary.created_at)
            .join(Shift, Shift.id == HandoffSummary.shift_id)
            .where(Shift.caregiver_id == current_user.id)
            .where(HandoffSummary.continuity_score.is_not(None))
            .where(HandoffSummary.created_at >= last_month_start)
        )
    ).all()

    this_month = [
        float(s) for (s, ts) in rows if ts and ts >= this_month_start
    ]
    last_month = [
        float(s)
        for (s, ts) in rows
        if ts and last_month_start <= ts < this_month_start
    ]

    return CaregiverScoreSummary(
        monthly_average=(
            round(sum(this_month) / len(this_month), 3) if this_month else None
        ),
        last_month_average=(
            round(sum(last_month) / len(last_month), 3) if last_month else None
        ),
        handoff_count_this_month=len(this_month),
    )


@router.get("/auth/sessions", response_model=list[SessionRead])
async def list_sessions(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[SessionRead]:
    """Active (non-revoked, non-expired) refresh tokens for the current user."""
    from datetime import timezone as _tz

    from app.models.refresh_token import RefreshToken

    rows = (
        await db.execute(
            select(RefreshToken)
            .where(RefreshToken.user_id == current_user.id)
            .where(RefreshToken.revoked_at.is_(None))
            .where(RefreshToken.expires_at > datetime.now(_tz.utc))
            .order_by(RefreshToken.created_at.desc())
        )
    ).scalars().all()

    return [
        SessionRead(
            id=row.id,
            device_info=row.device_info or {},
            created_at=row.created_at,
            expires_at=row.expires_at,
            is_current=False,
        )
        for row in rows
    ]


@router.delete("/auth/sessions/all", status_code=204)
async def revoke_all_sessions(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Revoke every active refresh token for the current user."""
    from datetime import timezone as _tz

    from app.models.refresh_token import RefreshToken

    rows = (
        await db.execute(
            select(RefreshToken)
            .where(RefreshToken.user_id == current_user.id)
            .where(RefreshToken.revoked_at.is_(None))
        )
    ).scalars().all()
    now = datetime.now(_tz.utc)
    for row in rows:
        row.revoked_at = now
    await record_audit(
        db,
        action="user.sessions_revoked_all",
        agency_id=current_user.agency_id,
        actor_user_id=current_user.id,
        target_type="user",
        target_id=current_user.id,
        metadata={"revoked_count": len(rows)},
        request=request,
    )
    await db.commit()
    return None


@router.delete("/auth/sessions/{token_id}", status_code=204)
@limiter.limit(LIMITS["auth_sessions_delete"])
async def revoke_session(
    token_id: uuid.UUID,
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from datetime import timezone as _tz

    from app.models.refresh_token import RefreshToken

    record = await db.get(RefreshToken, token_id)
    if record is None or record.user_id != current_user.id:
        raise ResourceNotFoundError("Session not found")
    if record.revoked_at is None:
        record.revoked_at = datetime.now(_tz.utc)
    await record_audit(
        db,
        action="user.session_revoked",
        agency_id=current_user.agency_id,
        actor_user_id=current_user.id,
        target_type="refresh_token",
        target_id=record.id,
        request=request,
    )
    await db.commit()
    return None
