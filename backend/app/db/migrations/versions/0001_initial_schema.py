"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-05-01 00:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Make sure pgcrypto is available for gen_random_uuid()
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    # AGENCIES
    op.create_table(
        "agencies",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False, unique=True),
        sa.Column("size_range", sa.String(50)),
        sa.Column(
            "timezone", sa.String(100), nullable=False, server_default="America/Los_Angeles"
        ),
        sa.Column("plan", sa.String(50), nullable=False, server_default="pilot"),
        sa.Column(
            "settings",
            postgresql.JSONB,
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
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

    # USERS
    op.create_table(
        "users",
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
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("phone", sa.String(30)),
        sa.Column("first_name", sa.String(100), nullable=False),
        sa.Column("last_name", sa.String(100), nullable=False),
        sa.Column("role", sa.String(50), nullable=False),
        sa.Column("status", sa.String(50), nullable=False, server_default="active"),
        sa.Column(
            "auth_provider", sa.String(50), nullable=False, server_default="email"
        ),
        sa.Column("password_hash", sa.String(255)),
        sa.Column("mfa_enabled", sa.Boolean(), server_default=sa.false()),
        sa.Column("last_login_at", sa.DateTime(timezone=True)),
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
        sa.CheckConstraint(
            "role IN ('caregiver','coordinator','supervisor','admin')",
            name="ck_users_role",
        ),
        sa.CheckConstraint(
            "status IN ('active','inactive','pending','suspended')",
            name="ck_users_status",
        ),
    )
    op.create_index("idx_users_agency", "users", ["agency_id"])
    op.create_index("idx_users_email", "users", ["email"])

    # REFRESH TOKENS
    op.create_table(
        "refresh_tokens",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token_hash", sa.String(255), nullable=False, unique=True),
        sa.Column(
            "device_info",
            postgresql.JSONB,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("ip_address_hash", sa.String(64)),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
    )
    op.create_index("idx_refresh_tokens_user", "refresh_tokens", ["user_id"])

    # MAGIC LINK TOKENS
    op.create_table(
        "magic_link_tokens",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token_hash", sa.String(255), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True)),
        sa.Column("ip_address_hash", sa.String(64)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
    )

    # CLIENTS
    op.create_table(
        "clients",
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
        sa.Column("first_name", sa.String(100), nullable=False),
        sa.Column("last_name", sa.String(100), nullable=False),
        sa.Column("preferred_name", sa.String(100)),
        sa.Column("date_of_birth", sa.Date()),
        sa.Column("care_context_summary", sa.Text()),
        sa.Column("address_neighborhood", sa.String(200)),
        sa.Column("status", sa.String(50), nullable=False, server_default="active"),
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
    op.create_index("idx_clients_agency", "clients", ["agency_id"])

    # SHIFTS
    op.create_table(
        "shifts",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "agency_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("agencies.id"),
            nullable=False,
        ),
        sa.Column(
            "client_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("clients.id"),
            nullable=False,
        ),
        sa.Column(
            "caregiver_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("scheduled_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("scheduled_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("actual_start", sa.DateTime(timezone=True)),
        sa.Column("actual_end", sa.DateTime(timezone=True)),
        sa.Column(
            "status", sa.String(50), nullable=False, server_default="scheduled"
        ),
        sa.Column(
            "replacement_caregiver_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
        ),
        sa.Column("call_out_reason", sa.Text()),
        sa.Column("notes", sa.Text()),
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
        sa.CheckConstraint(
            "status IN ('scheduled','in_progress','completed','missed','at_risk','covered')",
            name="ck_shifts_status",
        ),
    )
    op.create_index("idx_shifts_agency", "shifts", ["agency_id"])
    op.create_index("idx_shifts_client", "shifts", ["client_id"])
    op.create_index("idx_shifts_caregiver", "shifts", ["caregiver_id"])
    op.create_index("idx_shifts_scheduled_start", "shifts", ["scheduled_start"])

    # SHIFT NOTES RAW
    op.create_table(
        "shift_notes_raw",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "shift_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("shifts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("agency_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("input_type", sa.String(20), nullable=False),
        sa.Column("raw_text", sa.Text(), nullable=False),
        sa.Column("audio_s3_key", sa.String(500)),
        sa.Column("transcript_confidence", sa.Float()),
        sa.Column("word_count", sa.Integer()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.CheckConstraint(
            "input_type IN ('text','voice')", name="ck_notes_input_type"
        ),
    )
    op.create_index("idx_notes_shift", "shift_notes_raw", ["shift_id"])

    # HANDOFF SUMMARIES
    op.create_table(
        "handoff_summaries",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "shift_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("shifts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("agency_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "raw_note_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("shift_notes_raw.id"),
        ),
        sa.Column("generated_summary", postgresql.JSONB, nullable=False),
        sa.Column("edited_summary", postgresql.JSONB),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("model_used", sa.String(100)),
        sa.Column("generation_latency_ms", sa.Integer()),
        sa.Column("caregiver_accepted", sa.Boolean(), server_default=sa.false()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column("finalized_at", sa.DateTime(timezone=True)),
    )
    op.create_index("idx_handoffs_shift", "handoff_summaries", ["shift_id"])
    op.create_index("idx_handoffs_agency", "handoff_summaries", ["agency_id"])

    # RISK FLAGS
    op.create_table(
        "risk_flags",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "shift_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("shifts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "handoff_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("handoff_summaries.id"),
        ),
        sa.Column(
            "client_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("clients.id"),
            nullable=False,
        ),
        sa.Column("agency_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("category", sa.String(100), nullable=False),
        sa.Column("severity", sa.String(20), nullable=False),
        sa.Column("extracted_reason", sa.Text(), nullable=False),
        sa.Column(
            "status", sa.String(50), nullable=False, server_default="suggested"
        ),
        sa.Column(
            "reviewed_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")
        ),
        sa.Column("reviewed_at", sa.DateTime(timezone=True)),
        sa.Column(
            "escalated_to", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")
        ),
        sa.Column("resolved_at", sa.DateTime(timezone=True)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.CheckConstraint(
            "severity IN ('low','medium','high')", name="ck_flags_severity"
        ),
        sa.CheckConstraint(
            "status IN ('suggested','confirmed','dismissed','escalated','resolved')",
            name="ck_flags_status",
        ),
    )
    op.create_index("idx_flags_agency", "risk_flags", ["agency_id"])
    op.create_index("idx_flags_client", "risk_flags", ["client_id"])
    op.create_index("idx_flags_status", "risk_flags", ["status"])
    op.create_index("idx_flags_severity", "risk_flags", ["severity"])

    # CONTINUITY EVENTS
    op.create_table(
        "continuity_events",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("agency_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "client_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("clients.id"),
            nullable=False,
        ),
        sa.Column(
            "shift_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("shifts.id")
        ),
        sa.Column("category", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column(
            "severity", sa.String(20), nullable=False, server_default="medium"
        ),
        sa.Column("status", sa.String(50), nullable=False, server_default="open"),
        sa.Column(
            "resolved_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")
        ),
        sa.Column("resolved_at", sa.DateTime(timezone=True)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.CheckConstraint(
            "status IN ('open','in_progress','resolved')", name="ck_continuity_status"
        ),
    )
    op.create_index("idx_continuity_agency", "continuity_events", ["agency_id"])
    op.create_index("idx_continuity_client", "continuity_events", ["client_id"])

    # COORDINATOR ACTIONS
    op.create_table(
        "coordinator_actions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("agency_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("related_object_type", sa.String(100), nullable=False),
        sa.Column("related_object_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("action_type", sa.String(100), nullable=False),
        sa.Column("note", sa.Text()),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
    )
    op.create_index(
        "idx_coordinator_actions_agency", "coordinator_actions", ["agency_id"]
    )
    op.create_index(
        "idx_coordinator_actions_related",
        "coordinator_actions",
        ["related_object_type", "related_object_id"],
    )

    # AUDIT EVENTS
    op.create_table(
        "audit_events",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("agency_id", postgresql.UUID(as_uuid=True)),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True)),
        sa.Column("action", sa.String(200), nullable=False),
        sa.Column("target_type", sa.String(100)),
        sa.Column("target_id", postgresql.UUID(as_uuid=True)),
        sa.Column(
            "metadata_json",
            postgresql.JSONB,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("ip_address_hash", sa.String(64)),
        sa.Column("user_agent_hash", sa.String(64)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
    )
    op.create_index("idx_audit_agency", "audit_events", ["agency_id"])
    op.create_index("idx_audit_actor", "audit_events", ["actor_user_id"])
    op.create_index("idx_audit_created", "audit_events", ["created_at"])


def downgrade() -> None:
    op.drop_table("audit_events")
    op.drop_table("coordinator_actions")
    op.drop_table("continuity_events")
    op.drop_table("risk_flags")
    op.drop_table("handoff_summaries")
    op.drop_table("shift_notes_raw")
    op.drop_table("shifts")
    op.drop_table("clients")
    op.drop_table("magic_link_tokens")
    op.drop_table("refresh_tokens")
    op.drop_table("users")
    op.drop_table("agencies")
