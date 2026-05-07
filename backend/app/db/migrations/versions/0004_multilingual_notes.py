"""Multilingual handoff notes

Revision ID: 0004_multilingual_notes
Revises: 0003_sprint9
Create Date: 2026-05-07 02:00:00

Adds language metadata + original/translated text storage to
shift_notes_raw so caregivers can submit notes in any language.

raw_text continues to be the text the AI pipeline reads (always English
when translation occurred). When the note is non-English, original_text
holds the caregiver's words and translated_text mirrors raw_text.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004_multilingual_notes"
down_revision: Union[str, None] = "0003_sprint9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "shift_notes_raw",
        sa.Column("original_language", sa.String(10), nullable=True),
    )
    op.add_column(
        "shift_notes_raw",
        sa.Column("language_name", sa.String(50), nullable=True),
    )
    op.add_column(
        "shift_notes_raw",
        sa.Column("original_text", sa.Text(), nullable=True),
    )
    op.add_column(
        "shift_notes_raw",
        sa.Column("translated_text", sa.Text(), nullable=True),
    )
    # Backfill existing rows as English so downstream display logic
    # ("show original + translation when original_language != 'en'") has a
    # well-defined starting state.
    op.execute(
        "UPDATE shift_notes_raw SET original_language = 'en' "
        "WHERE original_language IS NULL"
    )


def downgrade() -> None:
    op.drop_column("shift_notes_raw", "translated_text")
    op.drop_column("shift_notes_raw", "original_text")
    op.drop_column("shift_notes_raw", "language_name")
    op.drop_column("shift_notes_raw", "original_language")
