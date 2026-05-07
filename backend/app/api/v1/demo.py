"""Public AI demo endpoints for the marketing landing page.

Exposes a stripped-down handoff generation flow plus a Whisper-backed
transcription endpoint. Both reuse the production services so visitors see
the real DaliyaFlow output, but neither persists anything to the database.
"""
import logging
import uuid

from fastapi import APIRouter, Depends, File, Request, Response, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings as app_settings
from app.core.rate_limit import LIMITS, limiter
from app.db.session import get_db
from app.services.ai_pipeline import (
    AIOutputValidationError,
    extract_risk_flags,
    generate_handoff_summary,
)
from app.services.audio_service import (
    ALLOWED_AUDIO_MIME_TYPES,
    transcribe_audio,
)
from app.services.audit_service import record_audit

logger = logging.getLogger(__name__)


# Static placeholder IDs — the demo endpoint does not persist to the DB.
_DEMO_SHIFT_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
_DEMO_CLIENT_ID = uuid.UUID("00000000-0000-0000-0000-000000000002")
_DEMO_AGENCY_ID = uuid.UUID("00000000-0000-0000-0000-000000000003")

router = APIRouter(prefix="/demo", tags=["demo"])


class DemoHandoffRequest(BaseModel):
    note: str = Field(min_length=20, max_length=4000)


class DemoFlag(BaseModel):
    category: str
    severity: str
    extracted_reason: str


class DemoHandoffResponse(BaseModel):
    summary_overview: str
    notable_changes: str = ""
    tasks_completed: list[str] = []
    tasks_pending: list[str] = []
    follow_up_items: list[str] = []
    supervisor_attention_needed: bool = False
    risk_flags: list[DemoFlag] = []


@router.post("/handoff", response_model=DemoHandoffResponse)
@limiter.limit(LIMITS["demo_handoff"])
async def demo_handoff(
    request: Request,
    response: Response,
    payload: DemoHandoffRequest,
    db: AsyncSession = Depends(get_db),
) -> DemoHandoffResponse:
    """Public demo endpoint. Rate-limited to 10/hour per IP."""
    await record_audit(
        db,
        action="demo.handoff_generated",
        metadata={"note_length": len(payload.note)},
        request=request,
    )
    await db.commit()
    try:
        handoff = await generate_handoff_summary(
            raw_note=payload.note,
            care_context="(demo — no client context)",
            shift_id=_DEMO_SHIFT_ID,
        )
        flags = await extract_risk_flags(
            raw_note=payload.note,
            handoff_summary=handoff.summary_overview,
            shift_id=_DEMO_SHIFT_ID,
            client_id=_DEMO_CLIENT_ID,
            agency_id=_DEMO_AGENCY_ID,
        )
    except AIOutputValidationError:
        return DemoHandoffResponse(
            summary_overview="Demo unavailable right now. Please try again.",
        )

    return DemoHandoffResponse(
        summary_overview=handoff.summary_overview,
        notable_changes=handoff.notable_changes,
        tasks_completed=handoff.tasks_completed,
        tasks_pending=handoff.tasks_pending,
        follow_up_items=handoff.follow_up_items,
        supervisor_attention_needed=handoff.supervisor_attention_needed,
        risk_flags=[
            DemoFlag(
                category=f.category,
                severity=f.severity,
                extracted_reason=f.extracted_reason,
            )
            for f in flags
        ],
    )


# ─── Voice transcription ─────────────────────────────────────────────────────


class DemoTranscribeResponse(BaseModel):
    transcript: str
    confidence: float
    available: bool = True
    message: str | None = None


@router.post("/transcribe", response_model=DemoTranscribeResponse)
@limiter.limit(LIMITS["demo_transcribe"])
async def demo_transcribe(
    request: Request,
    response: Response,
    audio: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
) -> DemoTranscribeResponse:
    await record_audit(
        db,
        action="demo.transcribe_called",
        request=request,
    )
    await db.commit()
    """Public Whisper transcription for the landing-page demo.

    Returns available=False when openai_api_key is not configured so the
    frontend can render the "Voice demo unavailable" hint instead of a
    blank field. Rate-limited to 5/hour per IP."""
    if not app_settings.openai_api_key:
        return DemoTranscribeResponse(
            transcript="",
            confidence=0.0,
            available=False,
            message="Voice demo unavailable — type a note instead.",
        )

    mime = audio.content_type or "audio/webm"
    if mime not in ALLOWED_AUDIO_MIME_TYPES:
        return DemoTranscribeResponse(
            transcript="",
            confidence=0.0,
            available=False,
            message="Unsupported audio format. Try recording in your browser.",
        )

    bytes_ = await audio.read()
    # Soft cap for the public demo: 6MB ~ 90s of 16kHz mono WebM.
    if len(bytes_) > 6 * 1024 * 1024:
        return DemoTranscribeResponse(
            transcript="",
            confidence=0.0,
            available=False,
            message="Audio is too long for the demo. Try a shorter clip.",
        )

    transcript, confidence = await transcribe_audio(bytes_, mime)
    return DemoTranscribeResponse(
        transcript=transcript or "",
        confidence=float(confidence or 0.0),
        available=True,
    )
