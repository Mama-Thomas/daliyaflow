import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.sanitization import sanitize_text_input


RiskSeverity = Literal["low", "medium", "high"]
RiskStatus = Literal["suggested", "confirmed", "dismissed", "escalated", "resolved"]


class RiskFlagRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    shift_id: uuid.UUID
    handoff_id: uuid.UUID | None
    client_id: uuid.UUID
    agency_id: uuid.UUID
    category: str
    severity: RiskSeverity
    extracted_reason: str
    status: RiskStatus
    reviewed_by: uuid.UUID | None
    reviewed_at: datetime | None
    escalated_to: uuid.UUID | None
    resolved_at: datetime | None
    created_at: datetime
    # Populated when the requester is a caregiver — the caregiver alerts
    # page renders client name and origin ("Your note" vs "From [name]").
    caregiver_first_name: str | None = None
    client_preferred_name: str | None = None
    client_last_initial: str | None = None
    is_own_note: bool | None = None


class RiskFlagCreate(BaseModel):
    shift_id: uuid.UUID
    category: str = Field(min_length=1, max_length=100)
    severity: RiskSeverity
    extracted_reason: str = Field(min_length=1, max_length=2000)

    @field_validator("extracted_reason", mode="before")
    @classmethod
    def _sanitize_reason(cls, v: Any) -> Any:
        if isinstance(v, str):
            return sanitize_text_input(v)
        return v


class RiskFlagUpdate(BaseModel):
    status: Literal["confirmed", "dismissed", "escalated", "resolved"] | None = None
    note: str | None = Field(default=None, max_length=2000)

    @field_validator("note", mode="before")
    @classmethod
    def _sanitize_note(cls, v: Any) -> Any:
        if isinstance(v, str):
            return sanitize_text_input(v)
        return v
