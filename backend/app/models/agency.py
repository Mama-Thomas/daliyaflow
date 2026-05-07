from typing import Any

from sqlalchemy import String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import BaseModel


class Agency(BaseModel):
    __tablename__ = "agencies"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    size_range: Mapped[str | None] = mapped_column(String(50), nullable=True)
    timezone: Mapped[str] = mapped_column(
        String(100), nullable=False, default="America/Los_Angeles"
    )
    plan: Mapped[str] = mapped_column(String(50), nullable=False, default="pilot")
    settings: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
