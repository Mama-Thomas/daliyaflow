import uuid
from dataclasses import dataclass
from typing import Iterable

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthenticationError, PermissionDeniedError
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.user import User

bearer_scheme = HTTPBearer(auto_error=False)


@dataclass
class TenantContext:
    agency_id: uuid.UUID
    user_id: uuid.UUID
    role: str

    def assert_role(self, allowed: Iterable[str]) -> None:
        if self.role not in allowed:
            raise PermissionDeniedError(
                f"Role '{self.role}' is not authorized for this action"
            )


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None or not credentials.credentials:
        raise AuthenticationError("Missing access token")
    payload = decode_access_token(credentials.credentials)

    user_id = payload.get("sub")
    if not user_id:
        raise AuthenticationError("Token missing subject")
    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError as exc:
        raise AuthenticationError("Invalid token subject") from exc

    user = await db.get(User, user_uuid)
    if user is None or user.status != "active":
        raise AuthenticationError("User not found or inactive")

    # Defence in depth: token claims must agree with DB record
    if str(user.agency_id) != payload.get("agency_id"):
        raise AuthenticationError("Token tenant mismatch")
    if user.role != payload.get("role"):
        raise AuthenticationError("Token role mismatch")

    request.state.user_id = str(user.id)
    request.state.agency_id = str(user.agency_id)
    return user


async def get_tenant_context(
    current_user: User = Depends(get_current_user),
) -> TenantContext:
    return TenantContext(
        agency_id=current_user.agency_id,
        user_id=current_user.id,
        role=current_user.role,
    )


def require_roles(*roles: str):
    """RBAC dependency: pass through if the user has one of the listed roles."""

    async def _dep(
        tenant: TenantContext = Depends(get_tenant_context),
    ) -> TenantContext:
        tenant.assert_role(roles)
        return tenant

    return _dep
