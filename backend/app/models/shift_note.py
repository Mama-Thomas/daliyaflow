import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UUIDPKMixin


class ShiftNoteRaw(Base, UUIDPKMixin):
    __tablename__ = "shift_notes_raw"
    __table_args__ = (
        CheckConstraint("input_type IN ('text','voice')", name="ck_notes_input_type"),
        Index("idx_notes_shift", "shift_id"),
    )

    shift_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("shifts.id", ondelete="CASCADE"),
        nullable=False,
    )
    agency_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    input_type: Mapped[str] = mapped_column(String(20), nullable=False)
    raw_text: Mapped[str] = mapped_column(Text, nullable=False)
    audio_s3_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    transcript_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    word_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    original_language: Mapped[str | None] = mapped_column(String(10), nullable=True)
    language_name: Mapped[str | None] = mapped_column(String(50), nullable=True)
    original_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    translated_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
