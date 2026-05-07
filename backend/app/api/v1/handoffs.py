"""Handoff submission + status endpoints (mounted under /shifts/{id}/...)."""
import logging
import uuid
from datetime import datetime, timezone

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    Request,
    Response,
    UploadFile,
    status,
)
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.dependencies import (
    TenantContext,
    get_tenant_context,
    require_roles,
)
from app.core.exceptions import (
    PermissionDeniedError,
    ResourceNotFoundError,
    ValidationError,
)
from app.core.rate_limit import LIMITS, limiter
from app.db.session import get_db
from app.models.handoff import HandoffSummary
from app.models.risk_flag import RiskFlag
from app.models.shift import Shift
from app.models.shift_note import ShiftNoteRaw
from app.schemas.shift_note import (
    HandoffStatusResponse,
    NoteSubmitResponse,
    NoteSubmitText,
)
from app.services.audio_service import (
    ALLOWED_AUDIO_MIME_TYPES,
    transcribe_audio,
    upload_audio,
)
from app.services.audit_service import record_audit

logger = logging.getLogger(__name__)
router = APIRouter(tags=["handoffs"])


async def _shift_for_caregiver(
    db: AsyncSession, shift_id: uuid.UUID, tenant: TenantContext
) -> Shift:
    shift = await db.get(Shift, shift_id)
    if shift is None or shift.agency_id != tenant.agency_id:
        raise ResourceNotFoundError("Shift not found")
    if tenant.role == "caregiver" and shift.caregiver_id != tenant.user_id:
        raise PermissionDeniedError("You can only submit notes for your own shifts.")
    return shift


def _sanitize_text(raw: str) -> str:
    cleaned = raw.replace("\x00", "").strip()
    if len(cleaned) > settings.MAX_NOTE_LENGTH:
        raise ValidationError("Note is too long.", field="raw_text")
    return cleaned


async def _persist_and_dispatch_note(
    *,
    db: AsyncSession,
    shift,
    tenant: TenantContext,
    text_to_store: str,
    input_type: str,
    audio_key: str | None,
    request: Request,
) -> NoteSubmitResponse:
    note = ShiftNoteRaw(
        shift_id=shift.id,
        agency_id=tenant.agency_id,
        input_type=input_type,
        raw_text=text_to_store,
        audio_s3_key=audio_key,
        word_count=len(text_to_store.split()),
    )
    db.add(note)
    await db.flush()

    await record_audit(
        db,
        action="handoff.note_submitted",
        agency_id=tenant.agency_id,
        actor_user_id=tenant.user_id,
        target_type="shift_note",
        target_id=note.id,
        metadata={"input_type": input_type, "word_count": note.word_count},
        request=request,
    )
    await db.commit()
    await db.refresh(note)

    try:
        from app.workers.tasks import process_shift_note  # noqa: WPS433

        process_shift_note.delay(str(note.id))
    except Exception as exc:
        logger.warning("Could not dispatch process_shift_note task: %s", exc)

    return NoteSubmitResponse(note_id=note.id, shift_id=shift.id)


@router.post(
    "/shifts/{shift_id}/notes",
    response_model=NoteSubmitResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
@limiter.limit(LIMITS["note_text"])
async def submit_note_text(
    request: Request,
    response: Response,
    shift_id: uuid.UUID,
    payload: NoteSubmitText,
    tenant: TenantContext = Depends(
        require_roles("caregiver", "coordinator", "supervisor", "admin")
    ),
    db: AsyncSession = Depends(get_db),
) -> NoteSubmitResponse:
    shift = await _shift_for_caregiver(db, shift_id, tenant)
    text_to_store = _sanitize_text(payload.raw_text)
    if len(text_to_store) < 20:
        raise ValidationError(
            "Please write at least 20 characters describing the shift.",
            field="raw_text",
        )
    return await _persist_and_dispatch_note(
        db=db,
        shift=shift,
        tenant=tenant,
        text_to_store=text_to_store,
        input_type=payload.input_type,
        audio_key=None,
        request=request,
    )


class TranscribeResponse(BaseModel):
    transcript: str
    confidence: float
    available: bool = True
    message: str | None = None


@router.post(
    "/shifts/{shift_id}/notes/transcribe",
    response_model=TranscribeResponse,
)
@limiter.limit(LIMITS["note_transcribe"])
async def transcribe_voice_note(
    request: Request,
    response: Response,
    shift_id: uuid.UUID,
    audio: UploadFile = File(...),
    tenant: TenantContext = Depends(
        require_roles("caregiver", "coordinator", "supervisor", "admin")
    ),
    db: AsyncSession = Depends(get_db),
) -> TranscribeResponse:
    """Whisper-only transcription. Does not persist anything; the caregiver
    UI uses this to populate the editable transcript box before submission."""
    # Same per-shift permission check as the submit endpoint so caregivers
    # can't transcribe audio for someone else's shift.
    await _shift_for_caregiver(db, shift_id, tenant)

    if not settings.openai_api_key:
        return TranscribeResponse(
            transcript="",
            confidence=0.0,
            available=False,
            message="Transcription unavailable — summarize what you said.",
        )

    mime = audio.content_type or "audio/webm"
    if mime not in ALLOWED_AUDIO_MIME_TYPES:
        raise ValidationError("Unsupported audio format.", field="audio")

    bytes_ = await audio.read()
    if len(bytes_) > settings.MAX_AUDIO_SIZE_MB * 1024 * 1024:
        raise ValidationError(
            f"Audio exceeds {settings.MAX_AUDIO_SIZE_MB}MB limit.",
            field="audio",
        )

    transcript, confidence = await transcribe_audio(bytes_, mime)
    return TranscribeResponse(
        transcript=transcript or "",
        confidence=float(confidence or 0.0),
        available=True,
    )


@router.post(
    "/shifts/{shift_id}/notes/audio",
    response_model=NoteSubmitResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
@limiter.limit(LIMITS["note_audio"])
async def submit_note_audio(
    request: Request,
    response: Response,
    shift_id: uuid.UUID,
    audio: UploadFile = File(...),
    raw_text: str | None = Form(default=None),
    tenant: TenantContext = Depends(
        require_roles("caregiver", "coordinator", "supervisor", "admin")
    ),
    db: AsyncSession = Depends(get_db),
) -> NoteSubmitResponse:
    shift = await _shift_for_caregiver(db, shift_id, tenant)

    bytes_ = await audio.read()
    audio_key = upload_audio(
        file_bytes=bytes_,
        agency_id=tenant.agency_id,
        shift_id=shift.id,
        mime_type=audio.content_type or "audio/webm",
    )

    text_to_store = _sanitize_text(raw_text or "(Voice transcript pending)")
    if len(text_to_store) < 20:
        # The transcript stub is fine to keep below the threshold for voice.
        text_to_store = "(Voice transcript pending)"

    await record_audit(
        db,
        action="audio.uploaded",
        agency_id=tenant.agency_id,
        actor_user_id=tenant.user_id,
        target_type="shift",
        target_id=shift.id,
        request=request,
    )

    return await _persist_and_dispatch_note(
        db=db,
        shift=shift,
        tenant=tenant,
        text_to_store=text_to_store,
        input_type="voice",
        audio_key=audio_key,
        request=request,
    )


@router.get(
    "/shifts/{shift_id}/handoff/status", response_model=HandoffStatusResponse
)
async def handoff_status(
    shift_id: uuid.UUID,
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> HandoffStatusResponse:
    shift = await db.get(Shift, shift_id)
    if shift is None or shift.agency_id != tenant.agency_id:
        raise ResourceNotFoundError("Shift not found")
    if tenant.role == "caregiver" and shift.caregiver_id != tenant.user_id:
        raise ResourceNotFoundError("Shift not found")

    handoff = (
        await db.execute(
            select(HandoffSummary)
            .where(HandoffSummary.shift_id == shift_id)
            .order_by(HandoffSummary.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    if handoff is None:
        # Either no note yet, or pipeline still running.
        most_recent_note = (
            await db.execute(
                select(ShiftNoteRaw)
                .where(ShiftNoteRaw.shift_id == shift_id)
                .order_by(ShiftNoteRaw.created_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        if most_recent_note is None:
            return HandoffStatusResponse(status="pending")
        return HandoffStatusResponse(status="processing")

    flags = (
        await db.execute(
            select(RiskFlag)
            .where(RiskFlag.shift_id == shift_id)
            .order_by(RiskFlag.created_at.asc())
        )
    ).scalars().all()

    return HandoffStatusResponse(
        status="complete",
        handoff_id=handoff.id,
        handoff_summary=handoff.edited_summary or handoff.generated_summary,
        continuity_score=handoff.continuity_score,
        score_breakdown=handoff.score_breakdown,
        suggested_flags=[
            {
                "id": str(f.id),
                "category": f.category,
                "severity": f.severity,
                "extracted_reason": f.extracted_reason,
                "status": f.status,
            }
            for f in flags
        ],
    )


class SharedSubmissionEntry(BaseModel):
    handoff_id: uuid.UUID
    shift_id: uuid.UUID
    client_id: uuid.UUID
    client_preferred_name: str | None
    client_last_initial: str | None
    caregiver_id: uuid.UUID
    caregiver_first_name: str
    is_own_submission: bool
    summary_overview: str
    finalized_at: datetime | None
    created_at: datetime


@router.get(
    "/caregiver/shared-submissions",
    response_model=list[SharedSubmissionEntry],
)
async def caregiver_shared_submissions(
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    limit: int = 5,
) -> list[SharedSubmissionEntry]:
    """Last N handoff submissions for any client this caregiver has a shift
    with, regardless of who submitted. Lets caregivers see what other
    caregivers on shared clients have submitted."""
    if tenant.role not in ("caregiver", "admin"):
        raise PermissionDeniedError("Caregiver-only endpoint.")

    from app.models.client import Client as _Client
    from app.models.user import User as _User

    shared_client_ids = (
        await db.execute(
            select(Shift.client_id)
            .where(Shift.agency_id == tenant.agency_id)
            .where(Shift.caregiver_id == tenant.user_id)
            .distinct()
        )
    ).scalars().all()
    if not shared_client_ids:
        return []

    rows = (
        await db.execute(
            select(HandoffSummary, Shift, _Client, _User)
            .join(Shift, Shift.id == HandoffSummary.shift_id)
            .join(_Client, _Client.id == Shift.client_id)
            .join(_User, _User.id == Shift.caregiver_id)
            .where(HandoffSummary.agency_id == tenant.agency_id)
            .where(Shift.client_id.in_(shared_client_ids))
            .order_by(HandoffSummary.created_at.desc())
            .limit(max(1, min(limit, 25)))
        )
    ).all()

    out: list[SharedSubmissionEntry] = []
    for handoff, shift, client, caregiver in rows:
        summary_payload = handoff.edited_summary or handoff.generated_summary or {}
        overview = ""
        if isinstance(summary_payload, dict):
            overview = str(summary_payload.get("summary_overview") or "")
        out.append(
            SharedSubmissionEntry(
                handoff_id=handoff.id,
                shift_id=shift.id,
                client_id=client.id,
                client_preferred_name=client.preferred_name or client.first_name,
                client_last_initial=client.last_name[:1] if client.last_name else None,
                caregiver_id=caregiver.id,
                caregiver_first_name=caregiver.first_name,
                is_own_submission=caregiver.id == tenant.user_id,
                summary_overview=overview,
                finalized_at=handoff.finalized_at,
                created_at=handoff.created_at,
            )
        )
    return out


@router.post("/handoffs/{handoff_id}/finalize", response_model=HandoffStatusResponse)
@limiter.limit(LIMITS["handoff_finalize"])
async def finalize_handoff(
    request: Request,
    response: Response,
    handoff_id: uuid.UUID,
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> HandoffStatusResponse:
    handoff = await db.get(HandoffSummary, handoff_id)
    if handoff is None or handoff.agency_id != tenant.agency_id:
        raise ResourceNotFoundError("Handoff not found")
    shift = await db.get(Shift, handoff.shift_id)
    if shift is None:
        raise ResourceNotFoundError("Shift not found")
    if tenant.role == "caregiver" and shift.caregiver_id != tenant.user_id:
        raise PermissionDeniedError("Cannot finalise another caregiver's handoff.")

    handoff.caregiver_accepted = True
    handoff.finalized_at = datetime.now(timezone.utc)
    await record_audit(
        db,
        action="handoff.finalized",
        agency_id=tenant.agency_id,
        actor_user_id=tenant.user_id,
        target_type="handoff_summary",
        target_id=handoff.id,
        request=request,
    )
    await db.commit()
    await db.refresh(handoff)

    flags = (
        await db.execute(
            select(RiskFlag).where(RiskFlag.handoff_id == handoff.id)
        )
    ).scalars().all()
    return HandoffStatusResponse(
        status="complete",
        handoff_id=handoff.id,
        handoff_summary=handoff.edited_summary or handoff.generated_summary,
        continuity_score=handoff.continuity_score,
        score_breakdown=handoff.score_breakdown,
        suggested_flags=[
            {
                "id": str(f.id),
                "category": f.category,
                "severity": f.severity,
                "extracted_reason": f.extracted_reason,
                "status": f.status,
            }
            for f in flags
        ],
    )
