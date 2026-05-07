"""Audio upload + transcription service.

Storage: S3 when AWS creds are configured, local FS fallback at /app/.local-audio
otherwise. Transcription: OpenAI Whisper (whisper-1) via the openai SDK. When
OPENAI_API_KEY is empty the function returns ("", 0.0) so the pipeline keeps
running with whatever raw_text stub is on file."""
from __future__ import annotations

import io
import logging
import mimetypes
import uuid
from pathlib import Path

import boto3
import openai
from botocore.exceptions import BotoCoreError, ClientError

from app.core.config import settings
from app.core.exceptions import ValidationError

logger = logging.getLogger(__name__)


ALLOWED_AUDIO_MIME_TYPES = {
    "audio/webm",
    "audio/mp4",
    "audio/wav",
    "audio/x-wav",
    "audio/ogg",
    "audio/mpeg",
}

LOCAL_AUDIO_ROOT = Path("/app/.local-audio")


def _ext_for(mime: str) -> str:
    guessed = mimetypes.guess_extension(mime) or ""
    if guessed.startswith("."):
        guessed = guessed[1:]
    return guessed or "bin"


def _is_aws_configured() -> bool:
    return bool(settings.AWS_ACCESS_KEY_ID and settings.AWS_SECRET_ACCESS_KEY and settings.AUDIO_BUCKET)


def _s3_client():
    return boto3.client(
        "s3",
        region_name=settings.AWS_REGION,
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID or None,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY or None,
    )


def validate_audio_file(file_bytes: bytes, mime_type: str) -> None:
    """Raise ValidationError on bad mime / oversize. Caller has already received bytes."""
    if mime_type not in ALLOWED_AUDIO_MIME_TYPES:
        raise ValidationError(
            f"Audio MIME '{mime_type}' is not allowed.", field="audio"
        )
    size_mb = len(file_bytes) / (1024 * 1024)
    if size_mb > settings.MAX_AUDIO_SIZE_MB:
        raise ValidationError(
            f"Audio exceeds {settings.MAX_AUDIO_SIZE_MB}MB limit.", field="audio"
        )


def _build_key(agency_id: uuid.UUID, shift_id: uuid.UUID, mime_type: str) -> str:
    ext = _ext_for(mime_type)
    return f"agencies/{agency_id}/audio/{shift_id}/{uuid.uuid4()}.{ext}"


def upload_audio(
    *, file_bytes: bytes, agency_id: uuid.UUID, shift_id: uuid.UUID, mime_type: str
) -> str:
    """Returns the storage key (relative). Caller stores it on the note row."""
    validate_audio_file(file_bytes, mime_type)
    key = _build_key(agency_id, shift_id, mime_type)

    if _is_aws_configured():
        try:
            _s3_client().put_object(
                Bucket=settings.AUDIO_BUCKET,
                Key=key,
                Body=file_bytes,
                ContentType=mime_type,
                ServerSideEncryption="AES256",
            )
        except (BotoCoreError, ClientError) as exc:
            logger.exception("S3 upload failed")
            raise ValidationError("Failed to store audio.") from exc
        return key

    # Local FS fallback
    target = LOCAL_AUDIO_ROOT / key
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(file_bytes)
    logger.info("Stored audio locally at %s (no AWS creds)", target)
    return key


def generate_presigned_url(s3_key: str) -> str:
    """Return a short-lived URL the caller can use to fetch the audio."""
    if _is_aws_configured():
        try:
            return _s3_client().generate_presigned_url(
                "get_object",
                Params={"Bucket": settings.AUDIO_BUCKET, "Key": s3_key},
                ExpiresIn=settings.AUDIO_URL_EXPIRE_SECONDS,
            )
        except (BotoCoreError, ClientError) as exc:
            logger.exception("S3 presign failed")
            raise ValidationError("Failed to issue audio URL.") from exc

    # Local FS fallback returns a file:// URL — only meaningful inside the
    # backend container; call sites should handle the dev case separately.
    path = LOCAL_AUDIO_ROOT / s3_key
    return f"file://{path}"


def is_local_storage() -> bool:
    return not _is_aws_configured()


# ---------- Audio download (for transcription) ----------

def download_audio(s3_key: str) -> bytes | None:
    """Fetch the audio bytes from S3 or local FS. Returns None on failure."""
    if _is_aws_configured():
        try:
            obj = _s3_client().get_object(
                Bucket=settings.AUDIO_BUCKET, Key=s3_key
            )
            return obj["Body"].read()
        except (BotoCoreError, ClientError):
            logger.exception("S3 download failed", extra={"s3_key": s3_key})
            return None

    path = LOCAL_AUDIO_ROOT / s3_key
    if not path.exists():
        logger.warning("local_audio_missing", extra={"s3_key": s3_key})
        return None
    return path.read_bytes()


def mime_type_for_key(s3_key: str) -> str:
    """Best-effort MIME guess based on the storage key extension."""
    ext = s3_key.rsplit(".", 1)[-1].lower() if "." in s3_key else "webm"
    return {
        "webm": "audio/webm",
        "mp4": "audio/mp4",
        "m4a": "audio/mp4",
        "wav": "audio/wav",
        "ogg": "audio/ogg",
        "mp3": "audio/mpeg",
    }.get(ext, "audio/webm")


# ---------- Transcription (OpenAI Whisper) ----------

_EXT_FOR_MIME = {
    "audio/webm": "webm",
    "audio/mp4":  "mp4",
    "audio/wav":  "wav",
    "audio/x-wav": "wav",
    "audio/ogg":  "ogg",
    "audio/mpeg": "mp3",
}


async def transcribe_audio(
    audio_bytes: bytes, mime_type: str = "audio/webm"
) -> tuple[str, float]:
    """Transcribe audio using OpenAI Whisper API.

    Returns (transcript_text, confidence_score). When openai_api_key is not
    set or the API call fails, returns ("", 0.0) so the pipeline can continue
    with whatever raw_text stub is on file."""
    if not settings.openai_api_key:
        logger.warning("openai_api_key not set, returning empty transcript")
        return "", 0.0

    try:
        client = openai.AsyncOpenAI(api_key=settings.openai_api_key)

        ext = _EXT_FOR_MIME.get(mime_type, "webm")
        audio_file = io.BytesIO(audio_bytes)
        audio_file.name = f"audio.{ext}"

        response = await client.audio.transcriptions.create(
            model=settings.openai_whisper_model,
            file=audio_file,
            response_format="verbose_json",
        )

        transcript = response.text or ""
        # whisper-1 verbose_json returns per-segment avg_logprob; use the mean
        # as a 0-1 confidence proxy. Default 0.85 when segment data is absent.
        confidence = 0.85
        segments = getattr(response, "segments", None)
        if segments:
            avg_logprob = sum(s.avg_logprob for s in segments) / len(segments)
            confidence = min(1.0, max(0.0, 1.0 + avg_logprob))

        return transcript, confidence

    except openai.APIError as exc:
        logger.error("Whisper API error: %s", exc)
        return "", 0.0
    except Exception as exc:  # noqa: BLE001
        logger.exception("Transcription failed: %s", exc)
        return "", 0.0
