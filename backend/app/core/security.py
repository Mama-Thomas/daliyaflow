import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt

from app.core.config import settings
from app.core.exceptions import AuthenticationError


# ----- Passwords -----
# Use the bcrypt library directly. passlib 1.7.4 still ships its own bcrypt
# version-detection shim that emits "(trapped) error reading bcrypt version"
# warnings against bcrypt 4.x; calling bcrypt directly avoids the shim and
# is materially the same code path passlib runs internally.

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


# ----- JWT access tokens -----

def create_access_token(
    subject: str | uuid.UUID,
    agency_id: str | uuid.UUID,
    role: str,
    extra_claims: dict[str, Any] | None = None,
    expires_delta: timedelta | None = None,
) -> str:
    expire = datetime.now(timezone.utc) + (
        expires_delta
        or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode: dict[str, Any] = {
        "sub": str(subject),
        "agency_id": str(agency_id),
        "role": role,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "type": "access",
    }
    if extra_claims:
        to_encode.update(extra_claims)
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
    except jwt.ExpiredSignatureError as exc:
        raise AuthenticationError("Invalid or expired access token") from exc
    except jwt.InvalidTokenError as exc:
        raise AuthenticationError("Invalid or expired access token") from exc
    if payload.get("type") != "access":
        raise AuthenticationError("Wrong token type")
    return payload


# ----- Refresh tokens -----
# Strategy: generate an opaque random secret, return it to the client,
# and store only its sha256 hash in the database. On refresh, hash the
# incoming token and look it up. This keeps the DB plaintext-free.

def generate_refresh_token() -> tuple[str, str, datetime]:
    """
    Returns:
        (raw_token, token_hash, expires_at)
    """
    raw = secrets.token_urlsafe(48)
    token_hash = hashlib.sha256(raw.encode()).hexdigest()
    expires_at = datetime.now(timezone.utc) + timedelta(
        days=settings.REFRESH_TOKEN_EXPIRE_DAYS
    )
    return raw, token_hash, expires_at


def hash_refresh_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


# ----- Magic link tokens -----

def generate_magic_link_token() -> tuple[str, str, datetime]:
    """
    Returns:
        (raw_token, token_hash, expires_at)
    """
    raw = secrets.token_urlsafe(40)
    token_hash = hashlib.sha256(raw.encode()).hexdigest()
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=settings.MAGIC_LINK_EXPIRE_MINUTES
    )
    return raw, token_hash, expires_at


def hash_magic_link_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


# ----- Helpers -----

def hash_value(value: str) -> str:
    """Generic sha256 hex digest, used for IP/user-agent fingerprints in audit log."""
    return hashlib.sha256(value.encode()).hexdigest()
