"""Async pipeline orchestration. Pure asyncio logic, no Celery decorators.
The Celery task wrapper lives in app.workers.tasks."""
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select

from app.core.cache import invalidate_carecard
from app.core.config import settings
from app.db.session import SessionLocal
from app.models.client import Client
from app.models.handoff import HandoffSummary
from app.models.risk_flag import RiskFlag
from app.models.shift import Shift
from app.models.shift_note import ShiftNoteRaw
from app.services.ai_pipeline import (
    AIOutputValidationError,
    extract_risk_flags,
    generate_handoff_summary,
)
from app.services.audio_service import (
    download_audio,
    mime_type_for_key,
    transcribe_audio,
)
from app.services.audit_service import record_audit
from app.services.continuity_score import (
    calculate_continuity_score,
    serializable_breakdown,
)
from app.services.pattern_service import check_flag_patterns

logger = logging.getLogger(__name__)


async def run_pipeline(note_id: uuid.UUID) -> dict:
    async with SessionLocal() as db:
        note = await db.get(ShiftNoteRaw, note_id)
        if note is None:
            return {"status": "failed", "reason": "note_not_found"}

        shift = await db.get(Shift, note.shift_id)
        if shift is None or shift.agency_id != note.agency_id:
            return {"status": "failed", "reason": "tenant_mismatch"}

        client = await db.get(Client, shift.client_id)
        if client is None or client.agency_id != note.agency_id:
            return {"status": "failed", "reason": "tenant_mismatch"}

        # Idempotency: if a handoff already exists for this raw note, skip.
        existing = (
            await db.execute(
                select(HandoffSummary).where(
                    HandoffSummary.raw_note_id == note.id
                )
            )
        ).scalar_one_or_none()
        if existing is not None:
            return {"status": "complete", "handoff_id": str(existing.id)}

        # Voice transcription happens before generation if needed.
        if (
            note.input_type == "voice"
            and note.audio_s3_key
            and (not note.raw_text or note.raw_text.strip().startswith("("))
        ):
            audio_bytes = download_audio(note.audio_s3_key)
            if audio_bytes:
                mime_type = mime_type_for_key(note.audio_s3_key)
                text, confidence = await transcribe_audio(
                    audio_bytes, mime_type=mime_type
                )
                if text:
                    note.raw_text = text
                    note.transcript_confidence = confidence
                    await db.flush()
                else:
                    logger.warning(
                        "transcribe_empty_continuing_with_stub",
                        extra={"note_id": str(note.id)},
                    )
            else:
                logger.warning(
                    "transcribe_audio_unavailable_continuing_with_stub",
                    extra={"note_id": str(note.id)},
                )

        started = datetime.now(timezone.utc)
        try:
            handoff = await generate_handoff_summary(
                raw_note=note.raw_text,
                care_context=client.care_context_summary or "",
                shift_id=shift.id,
            )
        except AIOutputValidationError as exc:
            logger.error(
                "Handoff generation failed for note_id=%s: %s", note.id, exc
            )
            await record_audit(
                db,
                action="handoff.generation_failed",
                agency_id=note.agency_id,
                target_type="shift_note",
                target_id=note.id,
                metadata={"error": str(exc)[:500]},
            )
            await db.commit()
            return {"status": "failed", "reason": "handoff_generation_failed"}

        latency_ms = int(
            (datetime.now(timezone.utc) - started).total_seconds() * 1000
        )

        score, breakdown = calculate_continuity_score(handoff, note.raw_text)
        handoff_row = HandoffSummary(
            shift_id=shift.id,
            agency_id=note.agency_id,
            raw_note_id=note.id,
            generated_summary=handoff.model_dump(),
            model_used=settings.ANTHROPIC_MODEL,
            generation_latency_ms=latency_ms,
            continuity_score=score,
            score_breakdown=serializable_breakdown(breakdown),
        )
        db.add(handoff_row)
        await db.flush()

        flags = await extract_risk_flags(
            raw_note=note.raw_text,
            handoff_summary=handoff.summary_overview,
            shift_id=shift.id,
            client_id=client.id,
            agency_id=note.agency_id,
        )

        pattern_alerts = []
        for f in flags:
            db.add(
                RiskFlag(
                    shift_id=shift.id,
                    handoff_id=handoff_row.id,
                    client_id=client.id,
                    agency_id=note.agency_id,
                    category=f.category,
                    severity=f.severity,
                    extracted_reason=f.extracted_reason,
                    status="suggested",
                )
            )
        await db.flush()

        # After all flags persist, evaluate patterns category-by-category.
        seen_categories: set[str] = set()
        for f in flags:
            if f.category in seen_categories:
                continue
            seen_categories.add(f.category)
            alert = await check_flag_patterns(
                db,
                client_id=client.id,
                agency_id=note.agency_id,
                new_flag_category=f.category,
                shift_id=shift.id,
                handoff_id=handoff_row.id,
            )
            if alert is not None:
                pattern_alerts.append(alert)

        await record_audit(
            db,
            action="handoff.generated",
            agency_id=note.agency_id,
            target_type="handoff_summary",
            target_id=handoff_row.id,
            metadata={
                "shift_id": str(shift.id),
                "flag_count": len(flags),
                "model": settings.ANTHROPIC_MODEL,
                "latency_ms": latency_ms,
            },
        )
        await db.commit()
        await invalidate_carecard(client.id)
        return {
            "status": "complete",
            "handoff_id": str(handoff_row.id),
            "flag_count": len(flags),
        }
