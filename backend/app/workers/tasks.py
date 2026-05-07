"""Celery worker entrypoint and tasks."""
import asyncio
import logging
import uuid

import sentry_sdk
from celery import Celery, Task
from celery.schedules import crontab

from app.core.config import settings

logger = logging.getLogger(__name__)


celery_app = Celery(
    "daliyaflow",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_default_queue="default",
    task_soft_time_limit=110,
    task_time_limit=120,
    beat_schedule={
        # 6:30 in UTC. Per-agency timezone fanout happens in the dispatcher
        # task — we only fire one cron entry from beat and let it filter.
        "send-morning-digests": {
            "task": "daliyaflow.send_morning_digests",
            "schedule": crontab(minute=30, hour="*"),
        },
    },
)


if settings.SENTRY_DSN:
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.ENVIRONMENT,
        traces_sample_rate=0.1,
        send_default_pii=False,
    )


class BaseTask(Task):
    """Shared base task with structured failure logging + Sentry capture."""

    autoretry_for = ()
    retry_backoff = True
    retry_jitter = True
    max_retries = 1

    def on_failure(self, exc, task_id, args, kwargs, einfo):  # type: ignore[override]
        logger.exception(
            "Celery task failed task=%s id=%s args=%s",
            self.name,
            task_id,
            args,
        )
        if settings.SENTRY_DSN:
            sentry_sdk.capture_exception(exc)
        super().on_failure(exc, task_id, args, kwargs, einfo)

    def on_success(self, retval, task_id, args, kwargs):  # type: ignore[override]
        logger.info("Celery task ok task=%s id=%s", self.name, task_id)
        super().on_success(retval, task_id, args, kwargs)


@celery_app.task(name="daliyaflow.health_ping", base=BaseTask)
def health_ping() -> str:
    return "ok"


@celery_app.task(name="daliyaflow.add", base=BaseTask)
def add(a: int, b: int) -> int:
    """Trivial smoke task to confirm the worker round-trips."""
    return a + b


@celery_app.task(
    name="daliyaflow.process_shift_note",
    base=BaseTask,
    bind=True,
    time_limit=120,
    soft_time_limit=110,
)
def process_shift_note(self, note_id: str) -> dict:  # noqa: ARG001
    from app.workers.pipeline_tasks import run_pipeline

    try:
        note_uuid = uuid.UUID(note_id)
    except ValueError as exc:
        raise ValueError(f"Bad note_id: {note_id}") from exc
    return asyncio.run(run_pipeline(note_uuid))


@celery_app.task(name="daliyaflow.send_morning_digests", base=BaseTask)
def send_morning_digests() -> dict:
    """Beat-driven dispatcher.

    Runs every hour at :30 in UTC. For each agency, checks if it is currently
    6:30am in the agency's local timezone and, if so, computes + sends digests
    to coordinators with morning_digest=True. This avoids needing per-agency
    beat entries — beat only fires one task and we filter by tz inside.
    """
    return asyncio.run(_run_digest_dispatcher())


async def _run_digest_dispatcher() -> dict:
    from datetime import datetime as _dt
    from zoneinfo import ZoneInfo

    from app.db.session import SessionLocal
    from app.models.agency import Agency
    from app.services.digest_service import (
        generate_agency_digest,
        recipients_for_digest,
    )
    from app.services.email_service import send_morning_digest

    sent = 0
    skipped = 0
    async with SessionLocal() as db:
        from sqlalchemy import select as _select

        agencies = (await db.execute(_select(Agency))).scalars().all()
        for agency in agencies:
            try:
                tz = ZoneInfo(agency.timezone or "UTC")
            except Exception:
                tz = ZoneInfo("UTC")
            now_local = _dt.now(tz)
            # Trigger only between 6:30 and 6:34 local time so we never miss
            # the slot, and never double-send within the same UTC :30 minute.
            if not (now_local.hour == 6 and now_local.minute == 30):
                skipped += 1
                continue

            digest = await generate_agency_digest(db, agency.id)
            if digest is None:
                continue
            recipients = await recipients_for_digest(db, agency.id)
            for r in recipients:
                try:
                    send_morning_digest(
                        email=r.email,
                        organization_name=digest.organization_name,
                        today=digest.today,
                        yesterday_stats=digest.yesterday_stats,
                        today_outlook=digest.today_outlook,
                        top_clients=digest.top_clients,
                    )
                    sent += 1
                except Exception:
                    logger.exception(
                        "digest_email_failed", extra={"to": r.email}
                    )
    return {"sent": sent, "agencies_skipped": skipped}


@celery_app.task(
    name="daliyaflow.prewarm_carecards",
    base=BaseTask,
    time_limit=600,
    soft_time_limit=570,
)
def prewarm_carecards(user_id: str, agency_id: str, role: str) -> dict:
    """Fire-and-forget cache warmer. Called after a successful login.

    Generates and caches CareCards for clients the user is authorised to
    see. Skips clients whose cache entry is less than 1 hour old. Failures
    on individual clients log a warning and continue — the task as a whole
    must never raise.
    """
    return asyncio.run(_run_prewarm_carecards(user_id, agency_id, role))


async def _run_prewarm_carecards(
    user_id_s: str, agency_id_s: str, role: str
) -> dict:
    from datetime import datetime as _dt, timedelta, timezone as _tz

    from sqlalchemy import select as _select

    from app.core.cache import get_carecard, set_carecard
    from app.db.session import SessionLocal
    from app.models.client import Client
    from app.models.shift import Shift
    from app.services.continuity_service import build_carecard

    REFRESH_THRESHOLD = timedelta(hours=1)
    DELAY_BETWEEN_SECONDS = 0.5

    try:
        user_uuid = uuid.UUID(user_id_s)
        agency_uuid = uuid.UUID(agency_id_s)
    except ValueError:
        logger.warning(
            "prewarm_carecards_bad_id user=%s agency=%s", user_id_s, agency_id_s
        )
        return {"warmed": 0, "skipped": 0, "failed": 0}

    async with SessionLocal() as db:
        if role in {"coordinator", "supervisor", "admin"}:
            client_ids = (
                await db.execute(
                    _select(Client.id)
                    .where(Client.agency_id == agency_uuid)
                    .where(Client.status == "active")
                )
            ).scalars().all()
        elif role == "caregiver":
            client_ids = (
                await db.execute(
                    _select(Shift.client_id)
                    .where(Shift.agency_id == agency_uuid)
                    .where(Shift.caregiver_id == user_uuid)
                    .distinct()
                )
            ).scalars().all()
        else:
            return {"warmed": 0, "skipped": 0, "failed": 0}

        warmed = 0
        skipped = 0
        failed = 0
        now = _dt.now(_tz.utc)

        for client_id in client_ids:
            try:
                cached = await get_carecard(client_id)
                if cached is not None:
                    gen_at_s = cached.get("generated_at")
                    try:
                        gen_at = _dt.fromisoformat(gen_at_s) if gen_at_s else None
                    except (TypeError, ValueError):
                        gen_at = None
                    if gen_at is not None:
                        if gen_at.tzinfo is None:
                            gen_at = gen_at.replace(tzinfo=_tz.utc)
                        if now - gen_at < REFRESH_THRESHOLD:
                            skipped += 1
                            continue

                card, generated_at = await build_carecard(
                    db, client_id=client_id, agency_id=agency_uuid
                )
                payload = {
                    "client_id": str(client_id),
                    "generated_at": generated_at.isoformat(),
                    "card": card.model_dump(),
                }
                await set_carecard(client_id, payload)
                warmed += 1
                await asyncio.sleep(DELAY_BETWEEN_SECONDS)
            except Exception as exc:
                failed += 1
                logger.warning(
                    "carecard_prewarm_client_failed client=%s err=%s",
                    client_id,
                    str(exc)[:200],
                )

        logger.info(
            "Pre-warmed %d carecards for user %s role %s "
            "(skipped=%d failed=%d total=%d)",
            warmed,
            user_id_s,
            role,
            skipped,
            failed,
            len(client_ids),
        )
        return {
            "warmed": warmed,
            "skipped": skipped,
            "failed": failed,
            "total": len(client_ids),
        }
