import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.sanitization import sanitize_text_input


class NoteSubmitText(BaseModel):
    input_type: Literal["text"] = "text"
    raw_text: str = Field(min_length=10, max_length=10_000)
    original_language: str | None = Field(default=None, max_length=10)
    language_name: str | None = Field(default=None, max_length=50)
    original_text: str | None = Field(default=None, max_length=10_000)
    translated_text: str | None = Field(default=None, max_length=10_000)

    @field_validator("raw_text", mode="before")
    @classmethod
    def _sanitize(cls, v: Any) -> Any:
        if isinstance(v, str):
            return sanitize_text_input(v)
        return v

    @field_validator("original_text", "translated_text", mode="before")
    @classmethod
    def _sanitize_optional(cls, v: Any) -> Any:
        if isinstance(v, str):
            return sanitize_text_input(v)
        return v


class NoteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    shift_id: uuid.UUID
    input_type: str
    raw_text: str
    audio_s3_key: str | None
    word_count: int | None
    original_language: str | None = None
    language_name: str | None = None
    original_text: str | None = None
    translated_text: str | None = None
    created_at: datetime


class TranslateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=10_000)
    source_language: str | None = Field(default=None, max_length=10)

    @field_validator("text", mode="before")
    @classmethod
    def _sanitize(cls, v: Any) -> Any:
        if isinstance(v, str):
            return sanitize_text_input(v)
        return v


class TranslateResponse(BaseModel):
    original_text: str
    detected_language: str
    language_name: str
    translated_text: str
    confidence: float


class NoteSubmitResponse(BaseModel):
    note_id: uuid.UUID
    shift_id: uuid.UUID
    status: Literal["processing"] = "processing"
    message: str = "Generating handoff..."


class HandoffStatusResponse(BaseModel):
    status: Literal["pending", "processing", "complete", "failed"]
    handoff_id: uuid.UUID | None = None
    handoff_summary: dict[str, Any] | None = None
    suggested_flags: list[dict[str, Any]] = Field(default_factory=list)
    continuity_score: float | None = None
    score_breakdown: dict[str, Any] | None = None
    message: str | None = None
