"""Public waitlist endpoint for the marketing landing page."""
from typing import Any

from fastapi import APIRouter, Request, Response, status
from fastapi.params import Depends
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import LIMITS, limiter
from app.core.sanitization import sanitize_text_input
from app.db.session import get_db
from app.models.waitlist import WaitlistEntry
from app.services.audit_service import record_audit

router = APIRouter(prefix="/waitlist", tags=["waitlist"])


class WaitlistCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    agency_name: str = Field(min_length=2, max_length=200)
    email: EmailStr
    challenge_description: str | None = Field(default=None, max_length=500)

    @field_validator("name", "agency_name", "challenge_description", mode="before")
    @classmethod
    def _strip(cls, v: Any) -> Any:
        if isinstance(v, str):
            return sanitize_text_input(v)
        return v


class WaitlistResponse(BaseModel):
    message: str


@router.post("", response_model=WaitlistResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit(LIMITS["waitlist_submit"])
async def submit_waitlist(
    request: Request,
    response: Response,
    payload: WaitlistCreate,
    db: AsyncSession = Depends(get_db),
) -> WaitlistResponse:
    """
    Public endpoint. Always returns 201 to avoid leaking whether an email
    has already submitted. Rate-limited to 3/hour per IP.
    """
    entry = WaitlistEntry(
        name=payload.name.strip(),
        agency_name=payload.agency_name.strip(),
        email=payload.email.lower(),
        challenge_description=(
            payload.challenge_description.strip()
            if payload.challenge_description
            else None
        ),
    )
    db.add(entry)
    await db.flush()
    await record_audit(
        db,
        action="waitlist.entry_created",
        target_type="waitlist_entry",
        target_id=entry.id,
        request=request,
    )
    await db.commit()
    return WaitlistResponse(
        message="Thank you — we will be in touch within 48 hours."
    )
