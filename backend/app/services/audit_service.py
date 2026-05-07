import uuid
from typing import Any

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_value
from app.models.audit_event import AuditEvent


# Catalogue of action strings the platform fires. Recording an event not in
# this list is fine (record_audit is permissive); the catalogue exists so the
# tooling and product surface have a single source of truth.
AUDITABLE_EVENTS: frozenset[str] = frozenset({
    "user.login",
    "user.login_failed",
    "user.logout",
    "user.magic_link_requested",
    "user.profile_updated",
    "user.session_revoked",
    "user.sessions_revoked_all",
    "user.invite_sent",
    "user.invite_accepted",
    "user.password_reset_requested",
    "user.created",
    "user.deactivated",
    "user.role_changed",
    "session.expired_inactivity",
    "session.all_revoked",
    "client.created",
    "client.updated",
    "shift.created",
    "shift.updated",
    "handoff.note_submitted",
    "handoff.finalized",
    "handoff.edited",
    "audio.uploaded",
    "flag.confirmed",
    "flag.dismissed",
    "flag.escalated",
    "flag.resolved",
    "flag.updated",
    "flag.manually_created",
    "flag.pattern_detected",
    "coordinator.action_logged",
    "agency.updated",
    "waitlist.entry_created",
    "demo.handoff_generated",
    "demo.transcribe_called",
    "family_summary.generated",
})


async def record_audit(
    db: AsyncSession,
    *,
    action: str,
    agency_id: uuid.UUID | None = None,
    actor_user_id: uuid.UUID | None = None,
    target_type: str | None = None,
    target_id: uuid.UUID | None = None,
    metadata: dict[str, Any] | None = None,
    request: Request | None = None,
) -> None:
    """Insert a single audit row. Never raise to caller — auditing must not break flow."""
    ip_hash: str | None = None
    ua_hash: str | None = None
    if request is not None:
        client_host = request.client.host if request.client else None
        if client_host:
            ip_hash = hash_value(client_host)
        ua = request.headers.get("user-agent")
        if ua:
            ua_hash = hash_value(ua)

    event = AuditEvent(
        agency_id=agency_id,
        actor_user_id=actor_user_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        metadata_json=metadata or {},
        ip_address_hash=ip_hash,
        user_agent_hash=ua_hash,
    )
    db.add(event)
    # Caller commits in the same transaction.
