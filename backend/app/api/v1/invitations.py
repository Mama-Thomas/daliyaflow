"""User invitation flow.

POST /users/invite          — admin or coordinator invites a teammate
GET  /users/invite/{token}  — public, returns invitation details
POST /users/invite/{token}/accept — public, creates user + signs them in
GET  /users                 — admin/coordinator: list agency users + pending
DELETE /users/{user_id}     — admin: deactivate
PATCH /users/{user_id}/role — admin: change role (cannot change own)
"""
from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
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
    ValidationError,
)
from app.core.rate_limit import LIMITS, limiter
from app.core.sanitization import sanitize_text_input
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_password,
)
from app.db.session import get_db
from app.models.agency import Agency
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.models.user_invitation import UserInvitation
from app.services.audit_service import record_audit
from app.services.email_service import send_invitation

router = APIRouter(tags=["invitations"])

INVITATION_TTL_HOURS = 48
ROLES_VALID = ("caregiver", "coordinator", "supervisor")


# --------------------------- Schemas -----------------------------------


class InviteCreate(BaseModel):
    email: EmailStr
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    role: Literal["caregiver", "coordinator", "supervisor"]

    @field_validator("first_name", "last_name", mode="before")
    @classmethod
    def _strip(cls, v: Any) -> Any:
        if isinstance(v, str):
            return sanitize_text_input(v)
        return v


class InviteResponse(BaseModel):
    invitation_id: uuid.UUID
    expires_at: datetime


class InvitationLookup(BaseModel):
    valid: bool
    email: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    organization_name: str | None = None
    role: str | None = None
    reason: str | None = None


class InviteAcceptRequest(BaseModel):
    password: str | None = Field(default=None, min_length=8, max_length=200)
    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    last_name: str | None = Field(default=None, min_length=1, max_length=100)

    @field_validator("first_name", "last_name", mode="before")
    @classmethod
    def _strip(cls, v: Any) -> Any:
        if isinstance(v, str):
            return sanitize_text_input(v)
        return v


class UserSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    first_name: str
    last_name: str
    role: str
    status: str
    last_login_at: datetime | None = None
    is_invitation: bool = False
    invitation_expires_at: datetime | None = None


class RoleUpdate(BaseModel):
    role: Literal["caregiver", "coordinator", "supervisor", "admin"]


# --------------------------- Helpers -----------------------------------


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def _gen_invitation_token() -> tuple[str, str, datetime]:
    raw = secrets.token_urlsafe(40)
    return (
        raw,
        _hash_token(raw),
        datetime.now(timezone.utc) + timedelta(hours=INVITATION_TTL_HOURS),
    )


# --------------------------- Endpoints ---------------------------------


@router.post("/users/invite", response_model=InviteResponse, status_code=201)
@limiter.limit(LIMITS["user_invite"])
async def create_invitation(
    payload: InviteCreate,
    request: Request,
    response: Response,
    tenant: TenantContext = Depends(
        require_roles("coordinator", "supervisor", "admin")
    ),
    db: AsyncSession = Depends(get_db),
) -> InviteResponse:
    # Coordinators may only invite caregivers; admin/supervisor may invite anyone.
    if tenant.role == "coordinator" and payload.role != "caregiver":
        raise PermissionDeniedError("Coordinators can only invite caregivers.")

    # Already a user in this agency or any agency? Block to avoid duplicate accounts.
    existing = (
        await db.execute(
            select(User).where(User.email == payload.email.lower())
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise ValidationError("A user with that email already exists.", field="email")

    raw, token_hash, expires_at = _gen_invitation_token()
    invitation = UserInvitation(
        agency_id=tenant.agency_id,
        email=payload.email.lower(),
        first_name=payload.first_name,
        last_name=payload.last_name,
        role=payload.role,
        token_hash=token_hash,
        invited_by=tenant.user_id,
        expires_at=expires_at,
    )
    db.add(invitation)
    await db.flush()

    # Look up agency name + inviter name for the email body.
    agency = await db.get(Agency, tenant.agency_id)
    inviter = await db.get(User, tenant.user_id)
    inviter_label = (
        f"{inviter.first_name} {inviter.last_name}".strip()
        if inviter
        else "A coordinator"
    )

    await record_audit(
        db,
        action="user.invite_sent",
        agency_id=tenant.agency_id,
        actor_user_id=tenant.user_id,
        target_type="user_invitation",
        target_id=invitation.id,
        metadata={"email": payload.email.lower(), "role": payload.role},
        request=request,
    )
    await db.commit()
    await db.refresh(invitation)

    try:
        send_invitation(
            email=invitation.email,
            first_name=invitation.first_name,
            invited_by_name=inviter_label,
            organization_name=agency.name if agency else "DaliyaFlow",
            role=invitation.role,
            token=raw,
        )
    except Exception:
        import logging as _logging

        _logging.getLogger(__name__).exception("invitation_email_failed")

    return InviteResponse(
        invitation_id=invitation.id, expires_at=invitation.expires_at
    )


@router.get("/users/invite/{token}", response_model=InvitationLookup)
async def lookup_invitation(
    token: str,
    db: AsyncSession = Depends(get_db),
) -> InvitationLookup:
    """Public endpoint — no auth. Returns invitation context for the
    acceptance form, or a generic invalid response."""
    if not token or len(token) < 10 or len(token) > 200:
        return InvitationLookup(valid=False, reason="not_found")
    token_hash = _hash_token(token)

    invitation = (
        await db.execute(
            select(UserInvitation).where(UserInvitation.token_hash == token_hash)
        )
    ).scalar_one_or_none()
    if invitation is None:
        return InvitationLookup(valid=False, reason="not_found")
    if invitation.accepted_at is not None:
        return InvitationLookup(valid=False, reason="already_accepted")
    if invitation.expires_at < datetime.now(timezone.utc):
        return InvitationLookup(valid=False, reason="expired")

    agency = await db.get(Agency, invitation.agency_id)
    return InvitationLookup(
        valid=True,
        email=invitation.email,
        first_name=invitation.first_name,
        last_name=invitation.last_name,
        organization_name=agency.name if agency else "DaliyaFlow",
        role=invitation.role,
    )


class InviteAcceptResponse(BaseModel):
    access_token: str
    refresh_token: str
    user: UserSummary


@router.post("/users/invite/{token}/accept", response_model=InviteAcceptResponse)
async def accept_invitation(
    token: str,
    payload: InviteAcceptRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> InviteAcceptResponse:
    token_hash = _hash_token(token)
    invitation = (
        await db.execute(
            select(UserInvitation).where(UserInvitation.token_hash == token_hash)
        )
    ).scalar_one_or_none()
    if invitation is None:
        raise ResourceNotFoundError("Invitation not found")
    if invitation.accepted_at is not None:
        raise ValidationError("Invitation has already been accepted.")
    if invitation.expires_at < datetime.now(timezone.utc):
        raise ValidationError("Invitation has expired.")

    # Did anyone create this email in the meantime?
    existing = (
        await db.execute(
            select(User).where(User.email == invitation.email.lower())
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise ValidationError("An account already exists for this email.")

    user = User(
        agency_id=invitation.agency_id,
        email=invitation.email.lower(),
        first_name=payload.first_name or invitation.first_name,
        last_name=payload.last_name or invitation.last_name,
        role=invitation.role,
        status="active",
        auth_provider="email",
        password_hash=hash_password(payload.password) if payload.password else None,
    )
    db.add(user)
    await db.flush()

    invitation.accepted_at = datetime.now(timezone.utc)

    # Issue tokens so the user is signed in immediately.
    access = create_access_token(
        subject=user.id, agency_id=user.agency_id, role=user.role
    )
    raw_refresh, hashed_refresh, expires_at = generate_refresh_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hashed_refresh,
            expires_at=expires_at,
            device_info={"user_agent": (request.headers.get("user-agent") or "")[:255]},
        )
    )

    await record_audit(
        db,
        action="user.created",
        agency_id=user.agency_id,
        actor_user_id=user.id,
        target_type="user",
        target_id=user.id,
        metadata={"via": "invitation"},
        request=request,
    )
    await record_audit(
        db,
        action="user.invite_accepted",
        agency_id=user.agency_id,
        actor_user_id=user.id,
        target_type="user_invitation",
        target_id=invitation.id,
        request=request,
    )
    await db.commit()
    await db.refresh(user)

    return InviteAcceptResponse(
        access_token=access,
        refresh_token=raw_refresh,
        user=UserSummary.model_validate(user),
    )


# --------------------------- Team management ---------------------------


@router.get("/users", response_model=list[UserSummary])
async def list_agency_users(
    tenant: TenantContext = Depends(
        require_roles("coordinator", "supervisor", "admin")
    ),
    db: AsyncSession = Depends(get_db),
) -> list[UserSummary]:
    rows = (
        await db.execute(
            select(User)
            .where(User.agency_id == tenant.agency_id)
            .order_by(User.created_at.desc())
        )
    ).scalars().all()
    users = [UserSummary.model_validate(u) for u in rows]

    # Append pending invitations as synthesized "pending" users.
    pending = (
        await db.execute(
            select(UserInvitation)
            .where(UserInvitation.agency_id == tenant.agency_id)
            .where(UserInvitation.accepted_at.is_(None))
            .where(UserInvitation.expires_at > datetime.now(timezone.utc))
            .order_by(UserInvitation.created_at.desc())
        )
    ).scalars().all()
    for inv in pending:
        users.append(
            UserSummary(
                id=inv.id,
                email=inv.email,
                first_name=inv.first_name,
                last_name=inv.last_name,
                role=inv.role,
                status="pending",
                last_login_at=None,
                is_invitation=True,
                invitation_expires_at=inv.expires_at,
            )
        )
    return users


@router.delete("/users/{user_id}", status_code=204)
async def deactivate_user(
    user_id: uuid.UUID,
    request: Request,
    tenant: TenantContext = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    user = await db.get(User, user_id)
    if user is None or user.agency_id != tenant.agency_id:
        raise ResourceNotFoundError("User not found")
    if user.id == tenant.user_id:
        raise PermissionDeniedError("You cannot deactivate yourself.")

    user.status = "inactive"
    # Revoke every active refresh token so the deactivated user is signed out.
    rows = (
        await db.execute(
            select(RefreshToken)
            .where(RefreshToken.user_id == user.id)
            .where(RefreshToken.revoked_at.is_(None))
        )
    ).scalars().all()
    now = datetime.now(timezone.utc)
    for row in rows:
        row.revoked_at = now

    await record_audit(
        db,
        action="user.deactivated",
        agency_id=tenant.agency_id,
        actor_user_id=tenant.user_id,
        target_type="user",
        target_id=user.id,
        metadata={"sessions_revoked": len(rows)},
        request=request,
    )
    await db.commit()
    return None


@router.patch("/users/{user_id}/role", response_model=UserSummary)
async def update_user_role(
    user_id: uuid.UUID,
    payload: RoleUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    tenant: TenantContext = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
) -> UserSummary:
    user = await db.get(User, user_id)
    if user is None or user.agency_id != tenant.agency_id:
        raise ResourceNotFoundError("User not found")
    if user.id == current_user.id:
        raise PermissionDeniedError("You cannot change your own role.")

    old_role = user.role
    user.role = payload.role

    await record_audit(
        db,
        action="user.role_changed",
        agency_id=tenant.agency_id,
        actor_user_id=tenant.user_id,
        target_type="user",
        target_id=user.id,
        metadata={"old_role": old_role, "new_role": payload.role},
        request=request,
    )
    await db.commit()
    await db.refresh(user)
    return UserSummary.model_validate(user)


# --------------------------- Resend / cancel ---------------------------


@router.post("/users/invite/{invitation_id}/resend", status_code=204)
@limiter.limit(LIMITS["user_invite"])
async def resend_invitation(
    invitation_id: uuid.UUID,
    request: Request,
    response: Response,
    tenant: TenantContext = Depends(
        require_roles("coordinator", "supervisor", "admin")
    ),
    db: AsyncSession = Depends(get_db),
):
    invitation = await db.get(UserInvitation, invitation_id)
    if invitation is None or invitation.agency_id != tenant.agency_id:
        raise ResourceNotFoundError("Invitation not found")
    if invitation.accepted_at is not None:
        raise ValidationError("Invitation has already been accepted.")

    raw, token_hash, expires_at = _gen_invitation_token()
    invitation.token_hash = token_hash
    invitation.expires_at = expires_at

    agency = await db.get(Agency, tenant.agency_id)
    inviter = await db.get(User, tenant.user_id)
    inviter_label = (
        f"{inviter.first_name} {inviter.last_name}".strip()
        if inviter
        else "A coordinator"
    )

    await record_audit(
        db,
        action="user.invite_sent",
        agency_id=tenant.agency_id,
        actor_user_id=tenant.user_id,
        target_type="user_invitation",
        target_id=invitation.id,
        metadata={"resend": True},
        request=request,
    )
    await db.commit()

    try:
        send_invitation(
            email=invitation.email,
            first_name=invitation.first_name,
            invited_by_name=inviter_label,
            organization_name=agency.name if agency else "DaliyaFlow",
            role=invitation.role,
            token=raw,
        )
    except Exception:
        pass
    return None


@router.delete("/users/invite/{invitation_id}", status_code=204)
async def cancel_invitation(
    invitation_id: uuid.UUID,
    request: Request,
    tenant: TenantContext = Depends(
        require_roles("coordinator", "supervisor", "admin")
    ),
    db: AsyncSession = Depends(get_db),
):
    invitation = await db.get(UserInvitation, invitation_id)
    if invitation is None or invitation.agency_id != tenant.agency_id:
        raise ResourceNotFoundError("Invitation not found")
    await db.delete(invitation)
    await record_audit(
        db,
        action="user.invite_cancelled",
        agency_id=tenant.agency_id,
        actor_user_id=tenant.user_id,
        target_type="user_invitation",
        target_id=invitation_id,
        request=request,
    )
    await db.commit()
    return None
