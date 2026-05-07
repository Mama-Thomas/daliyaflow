import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request, Response, status  # noqa: F401
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.brute_force import (
    is_locked as brute_force_is_locked,
    record_failure as brute_force_record_failure,
    reset as brute_force_reset,
)
from app.core.config import settings
from app.core.dependencies import get_current_user
from app.core.exceptions import AuthenticationError, ValidationError
from app.core.rate_limit import LIMITS, limiter
from app.core.security import (
    create_access_token,
    generate_magic_link_token,
    generate_refresh_token,
    hash_magic_link_token,
    hash_refresh_token,
    verify_password,
)
from app.db.session import get_db
from app.models.magic_link import MagicLinkToken
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    LogoutRequest,
    MagicLinkRequest,
    MagicLinkVerifyRequest,
    MessageResponse,
    RefreshRequest,
    TokenPair,
    UserPublic,
)
from app.services.audit_service import record_audit
from app.services.email_service import send_magic_link

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


# ----- Helpers -----

async def _issue_token_pair(
    db: AsyncSession, user: User, request: Request
) -> tuple[str, str]:
    """Create + persist a refresh token, return (access_token, refresh_token)."""
    access = create_access_token(
        subject=user.id, agency_id=user.agency_id, role=user.role
    )
    raw, token_hash, expires_at = generate_refresh_token()
    record = RefreshToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=expires_at,
        device_info={
            "user_agent": (request.headers.get("user-agent") or "")[:255],
        },
    )
    db.add(record)
    return access, raw


# ----- Endpoints -----

_GENERIC_LOGIN_FAILURE = "Invalid email or password"
_LOCKOUT_MESSAGE = "Too many attempts. Try again in 15 minutes."


@router.post("/login", response_model=LoginResponse)
@limiter.limit(LIMITS["auth_login"])
async def login(
    request: Request,
    response: Response,
    payload: LoginRequest,
    db: AsyncSession = Depends(get_db),
) -> LoginResponse:
    email = payload.email.lower()

    if await brute_force_is_locked(email):
        raise AuthenticationError(_LOCKOUT_MESSAGE)

    user = (
        await db.execute(select(User).where(User.email == email))
    ).scalar_one_or_none()

    if user is None or not verify_password(payload.password, user.password_hash or ""):
        locked_now = await brute_force_record_failure(email)
        await record_audit(
            db,
            action="user.login_failed",
            metadata={"email_attempted": email, "locked": locked_now},
            request=request,
        )
        await db.commit()
        if locked_now:
            raise AuthenticationError(_LOCKOUT_MESSAGE)
        raise AuthenticationError(_GENERIC_LOGIN_FAILURE)

    if user.status != "active":
        raise AuthenticationError("Account is not active")

    await brute_force_reset(email)
    user.last_login_at = datetime.now(timezone.utc)
    access, refresh = await _issue_token_pair(db, user, request)

    await record_audit(
        db,
        action="user.login",
        agency_id=user.agency_id,
        actor_user_id=user.id,
        target_type="user",
        target_id=user.id,
        request=request,
    )
    await db.commit()
    await db.refresh(user)

    _dispatch_carecard_prewarm(user.id, user.agency_id, user.role)

    return LoginResponse(
        access_token=access,
        refresh_token=refresh,
        user=UserPublic.model_validate(user),
    )


def _dispatch_carecard_prewarm(user_id, agency_id, role: str) -> None:
    """Fire-and-forget — never propagate failures back to the login response."""
    if not agency_id or not role:
        return
    try:
        from app.workers.tasks import prewarm_carecards  # noqa: WPS433

        prewarm_carecards.delay(str(user_id), str(agency_id), role)
    except Exception as exc:
        logger.warning("carecard_prewarm_dispatch_failed: %s", exc)


@router.post("/magic-link", response_model=MessageResponse)
@limiter.limit(LIMITS["auth_magic_link"])
async def request_magic_link(
    request: Request,
    response: Response,
    payload: MagicLinkRequest,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """
    Always responds with the same message regardless of email existence
    to avoid user enumeration.
    """
    email = payload.email.lower()
    if await brute_force_is_locked(email):
        # Mirror the success-shaped response so we don't leak the lockout state.
        return MessageResponse(
            message="If that email is registered, a sign-in link has been sent."
        )

    user = (
        await db.execute(select(User).where(User.email == email))
    ).scalar_one_or_none()

    if user is not None and user.status == "active":
        raw, token_hash, expires_at = generate_magic_link_token()
        record = MagicLinkToken(
            user_id=user.id, token_hash=token_hash, expires_at=expires_at
        )
        db.add(record)
        await record_audit(
            db,
            action="user.magic_link_requested",
            agency_id=user.agency_id,
            actor_user_id=user.id,
            target_type="user",
            target_id=user.id,
            request=request,
        )
        await db.commit()

        send_magic_link(
            email=user.email,
            token=raw,
            user_name=user.first_name,
        )

    return MessageResponse(message="If that email is registered, a sign-in link has been sent.")


@router.post("/magic-link/verify", response_model=LoginResponse)
@limiter.limit(LIMITS["auth_magic_link_verify"])
async def verify_magic_link(
    payload: MagicLinkVerifyRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> LoginResponse:
    token_hash = hash_magic_link_token(payload.token)
    now = datetime.now(timezone.utc)

    record = (
        await db.execute(
            select(MagicLinkToken).where(MagicLinkToken.token_hash == token_hash)
        )
    ).scalar_one_or_none()

    if record is None or record.used_at is not None or record.expires_at < now:
        raise AuthenticationError("Magic link is invalid or expired")

    user = await db.get(User, record.user_id)
    if user is None or user.status != "active":
        raise AuthenticationError("Account is not active")

    record.used_at = now
    user.last_login_at = now
    access, refresh = await _issue_token_pair(db, user, request)

    await record_audit(
        db,
        action="user.login",
        agency_id=user.agency_id,
        actor_user_id=user.id,
        target_type="user",
        target_id=user.id,
        metadata={"method": "magic_link"},
        request=request,
    )
    await db.commit()
    await db.refresh(user)

    _dispatch_carecard_prewarm(user.id, user.agency_id, user.role)

    return LoginResponse(
        access_token=access,
        refresh_token=refresh,
        user=UserPublic.model_validate(user),
    )


@router.post("/refresh", response_model=TokenPair)
async def refresh_token(
    payload: RefreshRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> TokenPair:
    token_hash = hash_refresh_token(payload.refresh_token)
    now = datetime.now(timezone.utc)

    record = (
        await db.execute(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        )
    ).scalar_one_or_none()

    if (
        record is None
        or record.revoked_at is not None
        or record.expires_at < now
    ):
        raise AuthenticationError("Refresh token is invalid or expired")

    user = await db.get(User, record.user_id)
    if user is None or user.status != "active":
        raise AuthenticationError("Account is not active")

    # Rotate: revoke old, mint new pair
    record.revoked_at = now
    access, new_refresh = await _issue_token_pair(db, user, request)
    await db.commit()

    return TokenPair(access_token=access, refresh_token=new_refresh)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def logout(
    payload: LogoutRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    token_hash = hash_refresh_token(payload.refresh_token)
    record = (
        await db.execute(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        )
    ).scalar_one_or_none()

    if record is not None and record.user_id == current_user.id and record.revoked_at is None:
        record.revoked_at = datetime.now(timezone.utc)

    await record_audit(
        db,
        action="user.logout",
        agency_id=current_user.agency_id,
        actor_user_id=current_user.id,
        target_type="user",
        target_id=current_user.id,
        request=request,
    )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=UserPublic)
async def me(current_user: User = Depends(get_current_user)) -> UserPublic:
    return UserPublic.model_validate(current_user)
