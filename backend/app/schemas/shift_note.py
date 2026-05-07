import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.sanitization import sanitize_text_input


class NoteSubmitText(BaseModel):
    input_type: Literal["text"] = "text"
    raw_text: str = Field(min_length=10, max_length=10_000)

    @field_validator("raw_text", mode="before")
    @classmethod
    def _sanitize(cls, v: Any) -> Any:
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
    created_at: datetime


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
