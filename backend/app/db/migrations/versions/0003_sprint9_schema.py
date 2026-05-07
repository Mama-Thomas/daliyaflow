"""Sprint 9 schema additions

Revision ID: 0003_sprint9
Revises: 0002_waitlist
Create Date: 2026-05-04 09:00:00

Adds:
- user_invitations table
- shift_templates table + Shift.template_id, Shift.template_name
- HandoffSummary.continuity_score, .score_breakdown
- User.notification_preferences
- WaitlistEntry.challenge_description
- RiskFlag.flag_metadata (for repeat-pattern flag enrichment)
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003_sprint9"
down_revision: Union[str, None] = "0002_waitlist"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # USER INVITATIONS
    op.create_table(
        "user_invitations",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "agency_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("agencies.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("first_name", sa.String(100), nullable=False),
        sa.Column("last_name", sa.String(100), nullable=False),
        sa.Column("role", sa.String(50), nullable=False),
        sa.Column("token_hash", sa.String(255), nullable=False, unique=True),
        sa.Column(
            "invited_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
    )
    op.create_index("idx_invitations_agency", "user_invitations", ["agency_id"])
    op.create_index("idx_invitations_email", "user_invitations", ["email"])

    # SHIFT TEMPLATES
    op.create_table(
        "shift_templates",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "agency_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("agencies.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.Column(
            "crosses_midnight",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column("color", sa.String(20), server_default="blue"),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        sa.Column(
            "display_order", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
    )
    op.create_index(
        "idx_shift_templates_agency", "shift_templates", ["agency_id"]
    )

    # SHIFT additions
    op.add_column(
        "shifts",
        sa.Column(
            "template_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("shift_templates.id"),
            nullable=True,
        ),
    )
    op.add_column(
        "shifts",
        sa.Column("template_name", sa.String(100), nullable=True),
    )

    # HANDOFF score columns
    op.add_column(
        "handoff_summaries",
        sa.Column("continuity_score", sa.Float(), nullable=True),
    )
    op.add_column(
        "handoff_summaries",
        sa.Column("score_breakdown", postgresql.JSONB, nullable=True),
    )

    # USER notification preferences
    op.add_column(
        "users",
        sa.Column(
            "notification_preferences",
            postgresql.JSONB,
            nullable=False,
            server_default=sa.text(
                "'{\"morning_digest\": true, "
                "\"high_flag_alerts\": true, "
                "\"shift_at_risk\": true, "
                "\"escalation\": true}'::jsonb"
            ),
        ),
    )

    # WAITLIST challenge_description
    op.add_column(
        "waitlist_entries",
        sa.Column("challenge_description", sa.Text(), nullable=True),
    )

    # RISK FLAG metadata (for pattern detection enrichment)
    op.add_column(
        "risk_flags",
        sa.Column(
            "flag_metadata",
            postgresql.JSONB,
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )

    # Backfill template_name on existing shifts to make later joins easier.
    # (None of the existing rows have a template; nothing to set.)


def downgrade() -> None:
    op.drop_column("risk_flags", "flag_metadata")
    op.drop_column("waitlist_entries", "challenge_description")
    op.drop_column("users", "notification_preferences")
    op.drop_column("handoff_summaries", "score_breakdown")
    op.drop_column("handoff_summaries", "continuity_score")
    op.drop_column("shifts", "template_name")
    op.drop_column("shifts", "template_id")
    op.drop_index("idx_shift_templates_agency", table_name="shift_templates")
    op.drop_table("shift_templates")
    op.drop_index("idx_invitations_email", table_name="user_invitations")
    op.drop_index("idx_invitations_agency", table_name="user_invitations")
    op.drop_table("user_invitations")
