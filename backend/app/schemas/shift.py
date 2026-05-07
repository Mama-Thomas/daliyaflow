import uuid
from datetime import datetime, time
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

ShiftStatus = Literal[
    "scheduled", "in_progress", "completed", "missed", "at_risk", "covered"
]


class ShiftBase(BaseModel):
    client_id: uuid.UUID
    caregiver_id: uuid.UUID
    scheduled_start: datetime
    scheduled_end: datetime
    notes: str | None = Field(default=None, max_length=5000)


class ShiftCreate(ShiftBase):
    template_id: uuid.UUID | None = None


# ---------- Shift templates ----------


class ShiftTemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    agency_id: uuid.UUID
    name: str
    start_time: time
    end_time: time
    crosses_midnight: bool
    color: str | None = None
    is_active: bool
    display_order: int
    created_at: datetime
    updated_at: datetime


class ShiftTemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    start_time: time
    end_time: time
    crosses_midnight: bool = False
    color: str = Field(default="blue", max_length=20)
    display_order: int = 0


class ShiftTemplateUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    start_time: time | None = None
    end_time: time | None = None
    crosses_midnight: bool | None = None
    color: str | None = Field(default=None, max_length=20)
    is_active: bool | None = None
    display_order: int | None = None


class ShiftUpdate(BaseModel):
    actual_start: datetime | None = None
    actual_end: datetime | None = None
    status: ShiftStatus | None = None
    call_out_reason: str | None = Field(default=None, max_length=2000)
    replacement_caregiver_id: uuid.UUID | None = None
    notes: str | None = Field(default=None, max_length=5000)


class ShiftStatusUpdate(BaseModel):
    status: ShiftStatus


class AtRiskRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=2000)


class ShiftRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    agency_id: uuid.UUID
    client_id: uuid.UUID
    caregiver_id: uuid.UUID
    scheduled_start: datetime
    scheduled_end: datetime
    actual_start: datetime | None
    actual_end: datetime | None
    status: ShiftStatus
    replacement_caregiver_id: uuid.UUID | None
    call_out_reason: str | None
    notes: str | None
    template_id: uuid.UUID | None = None
    template_name: str | None = None
    created_at: datetime
    updated_at: datetime
