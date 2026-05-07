import uuid
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.sanitization import sanitize_text_input


def _sanitize(v: Any) -> Any:
    if isinstance(v, str):
        return sanitize_text_input(v)
    return v


class ClientBase(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    preferred_name: str | None = Field(default=None, max_length=100)
    date_of_birth: date | None = None
    care_context_summary: str | None = Field(default=None, max_length=5000)
    address_neighborhood: str | None = Field(default=None, max_length=200)

    @field_validator(
        "first_name",
        "last_name",
        "preferred_name",
        "care_context_summary",
        "address_neighborhood",
        mode="before",
    )
    @classmethod
    def _strip(cls, v: Any) -> Any:
        return _sanitize(v)


class ClientCreate(ClientBase):
    pass


class ClientUpdate(BaseModel):
    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    last_name: str | None = Field(default=None, min_length=1, max_length=100)
    preferred_name: str | None = Field(default=None, max_length=100)
    date_of_birth: date | None = None
    care_context_summary: str | None = Field(default=None, max_length=5000)
    address_neighborhood: str | None = Field(default=None, max_length=200)
    status: str | None = None

    @field_validator(
        "first_name",
        "last_name",
        "preferred_name",
        "care_context_summary",
        "address_neighborhood",
        mode="before",
    )
    @classmethod
    def _strip(cls, v: Any) -> Any:
        return _sanitize(v)


class ClientRead(ClientBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    agency_id: uuid.UUID
    status: str
    created_at: datetime
    updated_at: datetime
