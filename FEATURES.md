# DaliyaFlow — Complete Feature List
## Version: Sprint 9
## Generated: 2026-05-04

DaliyaFlow is an AI handoff and care continuity platform for senior care
teams — home care, assisted living, memory care, and adult family homes.
This document is the canonical product surface as of Sprint 9.

> **Terminology note**: User-facing text uses "organization" throughout. Internal
> code identifiers (database columns, models, route segments) continue to use
> `agency_id` / `agencies` for backwards compatibility.

---

### CAREGIVER FEATURES

- **Sign in (password)** — Email + password login, "Sign in failed" inline
  error, no stack traces.
- **Show / hide password toggle (Sprint 9)** — Eye / EyeOff icon button inside
  the password field, toggles `type` between `password` and `text`,
  ARIA-labelled, hover state in primary color.
- **Sign in (magic link)** — One-click email link, single-use, 15-minute
  expiry, anti-enumeration response.
- **Magic Link Sent screen** — Animated envelope, email echoed back, 60s
  resend countdown.
- **Session timeout (Sprint 9)** — 60-minute inactivity timeout for caregivers;
  warning modal at 55 minutes with "Stay signed in" button (calls /auth/refresh).
  Server-side session revocation on hard timeout. Activity tracked on every
  authenticated API call via Zustand store.
- **Timeout sign-in banner (Sprint 9)** — Sign-in page shows
  "You were signed out after inactivity" when redirected with `?reason=timeout`.
- **Caregiver home (Today)** — Greeting + date, stat strip (shifts today,
  submitted, open flags), today's shifts list, recent submissions block.
- **Quick actions** — Plus button surfaces a quick-actions sheet with
  "Start handoff for [client]" CTAs and ghost links.
- **Shift list** — Browse all assigned shifts, scoped to current caregiver.
- **Shift detail** — Client preferred name, address neighborhood, schedule,
  care context summary, prior handoff (collapsed), Care Brief (collapsed,
  AI-generated, refreshable), recent notes from other caregivers,
  start handoff CTA.
- **Care Brief (on-demand AI)** — Welcome line, key things to know,
  watch for, pending tasks. Caregiver-accessible only for clients they
  have a shift assigned to.
- **Recent caregiver notes** — Last 3 finalized handoff summaries from any
  caregiver for an assigned client. Shows structured summary only — never
  raw note text. Tap-to-expand reveals notable changes and confirmed risk
  flag chips.
- **Handoff submission (text mode)** — Multi-line note entry with guided
  placeholder, character counter, 10–10,000 char range, autosave to
  localStorage every 10s, draft restore on reload.
- **Handoff submission (voice mode)** — Mic recorder with waveform
  visualization, elapsed timer, browser feature detection.
- **Live chunked transcription** — Every 3 seconds while recording, the
  cumulative audio is sent to a transcribe endpoint and the response is
  rendered word-by-word inside the recorder card with a pulsing
  "Transcribing live..." indicator.
- **Final clean transcript** — When recording stops, the full audio is sent
  for a clean final transcript that replaces the live preview; caregiver
  can edit before generating the handoff.
- **Transcript append** — Re-recording extends the existing transcript
  with a "— continued —" separator instead of replacing it.
  "Clear transcript" ghost button resets after first recording.
- **Whisper-unavailable fallback** — Friendly message + manual textarea
  when transcription is offline.
- **Note quality nudge (Sprint 9)** — Frontend-only `checkNoteQuality()`
  pre-submission check. Detects too-short notes (<30 words), missing task
  language, and missing follow-up language on substantial notes. Renders an
  amber NoteQualityNudge card between the textarea and the button with
  bullet-point issues. Two buttons: "Add more detail" and "Continue anyway"
  — never blocks submission.
- **Handoff review (Step 2)** — Editable AI-generated summary, suggested
  flag chips, manual flag entry, finalize button.
- **Submission success moment** — Calm DahliaBloom CSS animation (8 staggered
  petals + 1 gold accent + primary disc, ~880ms total). Conditional lines for
  high-severity coordinator notification and supervisor review.
- **Caregiver alerts page** — Inbox of escalation + flag updates.
- **Caregiver profile page** — User profile, sign out.
- **Caregiver monthly handoff score (Sprint 9)** — `GET /users/me/handoff-score`
  returns the caregiver's average continuity_score for the current and
  prior month. Designed to surface in profile; trend arrow planned for UI.
- **Prior handoffs list** — Per-client index of finalized handoffs.

---

### COORDINATOR FEATURES

- **Dashboard summary** — Today's submissions count, open flags by severity,
  shifts at risk, average review time (last 7 days), recent coordinator
  actions.
- **Priority queue** — High-severity unreviewed flags + at-risk shifts,
  sorted by recency, capped at 20 items. Pattern flags sort first within
  their severity tier.
- **Shift brief** — Today's clients with new unreviewed flags, sorted by
  highest severity then most recent handoff. Shows continuity break,
  supervisor attention flag, caregivers today.
- **Clients list + filtering** — Searchable, agency-scoped.
- **Client detail page** — Handoff history, latest handoff with continuity
  score (Sprint 9), CareCard preview, raw note (coordinator+ only),
  family summary tab (Sprint 9), timeline tab (Sprint 9).
- **Client care timeline (Sprint 9)** — Visual chronological timeline of
  shifts, flags, continuity events, and coordinator actions over the last
  30 days (configurable up to 180). Vertical layout with dot markers in
  severity colors, continuity-break gap markers when caregiver changes,
  pattern-flag distinct styling. Endpoint: `GET /clients/{id}/timeline`.
- **Family summary (Sprint 9)** — `GET /clients/{id}/family-summary` endpoint
  asks Claude to render the past week of shift overviews as a warm, plain-
  language family-facing update. System prompt forbids medical jargon and
  medication names. Frontend tab with copy-to-clipboard, regenerate, and a
  "Coming soon" Send-via-email placeholder.
- **Flags list + filters** — Status, severity, client, date range filters.
- **Flag detail drawer** — Full reason, confirm/dismiss/escalate/resolve.
- **Pattern alert chip (Sprint 9)** — RiskFlagCard shows
  "Pattern — Xth time in 14 days" chip when `flag_metadata.pattern == "true"`.
- **Coordinator actions log** — Audit trail of every flag confirm/dismiss/
  escalate + free-form notes (rate-limited to 30/min in Sprint 9).
- **Continuity events** — Open / in-progress / resolved continuity
  break tracking.
- **Shifts page (date picker)** — Every shift on a chosen day, scoped to
  agency.
- **Mark shift at risk** — Reason input, status update, audit log entry.
- **Create shift (Sprint 9)** — `CreateShiftModal` with client + caregiver
  selectors, date picker, three template cards (AM / Evening / NOC) with
  selected/hover states, "Custom times" override option. Backend
  `POST /shifts` derives `scheduled_start` / `scheduled_end` from the
  template + the date when `template_id` is provided.
- **Settings page** — Profile editor, organization settings (admin only),
  team management (Sprint 9), notifications panel including
  morning brief toggle (Sprint 9), security panel with active sessions list,
  individual + bulk session revoke.
- **Team management (Sprint 9)** — Within Settings:
  - "Invite team member" card with first / last / email / role inputs;
    coordinators can only invite caregivers, admins can invite caregivers,
    coordinators, and supervisors.
  - Filter chips: All / Active / Pending / Inactive.
  - User list with role chip, status chip, last login, role-change
    dropdown (admin only), Deactivate button (admin only).
  - Pending invitations section with Resend / Cancel ghost buttons.
- **Continuity score on shift submissions (Sprint 9)** — Score pill on
  ShiftSubmissionCard (≥80 green, 60–79 amber, <60 red) with hover tooltip.
- **Continuity score on Latest Handoff (Sprint 9)** — Filled bar in severity
  colors with breakdown tooltip on hover.

---

### SUPERVISOR FEATURES

- **All coordinator features** plus:
- **Escalation inbox** — Flags escalated to supervisor.
- **Flag pattern oversight (Sprint 9)** — Repeat-pattern continuity events
  surface in the supervisor's continuity feed.

---

### ADMIN FEATURES

- **All supervisor + coordinator features** plus:
- **Organization settings** — Update name, timezone (Sprint 9 terminology).
- **User management (Sprint 9)** — `GET /users` lists active + pending users;
  `DELETE /users/{user_id}` deactivates and revokes all sessions;
  `PATCH /users/{user_id}/role` changes role (cannot change own).
  All actions audit-logged.
- **Shift template management (Sprint 9)** — `GET / POST / PATCH /
  DELETE /shift-templates`. Default templates marked "Default" cannot be
  hard-deleted, only deactivated.
- **Danger zone** — Export organization data placeholder.

---

### USER MANAGEMENT FEATURES (Sprint 9)

- **Invitations table** — `user_invitations` row: agency_id, email, name,
  role, token_hash (sha256 of secret), invited_by, expires_at (48h),
  accepted_at, created_at. Indexed on agency_id + email.
- **POST /users/invite** — Admin/coordinator/supervisor; coordinators
  restricted to caregiver role. Generates secure token (40 random url-safe
  bytes), stores hash, sends invitation email. 20/hour rate limit per
  authenticated user. Audit event: `user.invite_sent`.
- **GET /users/invite/{token}** — Public, returns invitation context or
  `{valid: false, reason}` for expired / already_accepted / not_found.
- **POST /users/invite/{token}/accept** — Public. Creates User from
  invitation data with optional password (8-200 chars). Issues access +
  refresh token pair (auto-login). Marks invitation accepted.
  Audit events: `user.created`, `user.invite_accepted`.
- **Resend / cancel invitation** — `POST /users/invite/{id}/resend`
  (regenerates token, extends expiry, re-sends email);
  `DELETE /users/invite/{id}` removes invitation entirely.
- **Invite acceptance screen (`/auth/invite/:token`)** — Reads token from
  URL, calls lookup, renders form with email read-only, name pre-filled
  + editable, optional password with show/hide toggle. On accept:
  redirects to caregiver/coordinator role home.
- **Invitation email** — Branded HTML using existing `_wrap` template.
  Subject: "You've been invited to join [Organization Name] on DaliyaFlow".
  CTA button → `/auth/invite/{token}`. Mentions 48-hour expiry.

---

### SECURITY FEATURES

- **JWT access tokens** — 15-minute expiry, signed HS256.
- **Refresh tokens** — 7-day expiry, sha256-hashed in DB, rotation on use.
- **Magic link tokens** — 15-minute expiry, sha256-hashed.
- **Session timeout (Sprint 9)** — 30 min coordinators+, 60 min caregivers,
  configurable via `settings.session_timeout_minutes`. Frontend tracks
  `lastActivity` in Zustand and bumps on every authenticated API call.
- **Brute force protection (Sprint 9)** — Redis-tracked failed login
  attempts (key: sha256-hash of email). 5 attempts in 10 minutes triggers
  a 15-minute lockout. Lockout returns the same generic message as a normal
  failure to avoid revealing the lockout state. Magic link requests during
  a lockout silently return the success-shaped response.
- **Rate limiting (slowapi)** — Per-route + global fallback `200/minute` by
  IP (or user_id if authenticated):
  - `auth_login`: 5/min
  - `auth_magic_link`: 3/min
  - `auth_magic_link_verify`: 10/min (Sprint 9)
  - `auth_sessions_delete`: 10/min (Sprint 9)
  - `note_text`: 10/min, `note_audio`: 5/min
  - `handoff_finalize`: 10/min
  - `waitlist_submit`: 3/hour, `demo_handoff`: 10/hour, `demo_transcribe`: 5/hour
  - `flag_update`: 30/min (Sprint 9)
  - `coordinator_action_create`: 30/min (Sprint 9)
  - `user_invite`: 20/hour (Sprint 9)
- **429 response shape (Sprint 9)** — `{error: {code, message, retry_after}}`
  with `Retry-After` header.
- **Input validation hardening (Sprint 9)** — Pydantic field length limits
  on `raw_note_text` (10–10,000), `flag_extracted_reason` (≤2000),
  `flag_note` (≤2000), `coordinator_action_note` (≤5000),
  `client_care_context_summary` (≤5000), `user.first_name` /
  `user.last_name` (1–100), `agency.name` (2–255),
  `waitlist_entry.name` / `agency_name` (2–200), email (≤255).
- **Body size limit (Sprint 9)** — Custom `BodySizeLimitMiddleware`
  caps requests at 10MB; 25MB on `/audio` + `/transcribe` paths. 413 with
  JSON error otherwise.
- **Text sanitization (Sprint 9)** — `app/core/sanitization.py`:
  - `sanitize_text_input()` strips null bytes, zero-width chars, control
    chars (excluding `\n` `\t` `\r`), normalises Unicode to NFC, trims.
  - `sanitize_for_log()` truncates and redacts obvious-token patterns
    (`sk-`, `Bearer …`, `token=…`).
  - Applied via Pydantic `field_validator(..., mode="before")` on
    NoteSubmitText, RiskFlagCreate/Update, ClientCreate/Update,
    CoordinatorActionCreate, WaitlistCreate, InviteCreate /
    InviteAcceptRequest.
- **Security headers (Sprint 9 expanded)** — Backend
  `SecurityHeadersMiddleware` sets `Permissions-Policy`,
  `Cross-Origin-Opener-Policy`, `X-Content-Type-Options`,
  `X-Frame-Options`, `Referrer-Policy`. nginx prod config also adds
  `Cross-Origin-Embedder-Policy: require-corp`, tightens CSP to permit
  `media-src 'self' blob:` (mic recording).
- **CORS hardening (Sprint 9)** — Production reads from
  `settings.ALLOWED_ORIGINS` (comma-separated whitelist) when
  `ENVIRONMENT=production`; dev falls back to `CORS_ORIGINS`. Wildcard
  removed.
- **Audit log (Sprint 9 expanded)** — `AUDITABLE_EVENTS` catalogue in
  `app/services/audit_service.py`. New events: `user.invite_sent`,
  `user.invite_accepted`, `user.password_reset_requested`,
  `user.created`, `user.deactivated`, `user.role_changed`,
  `session.expired_inactivity`, `session.all_revoked`, `client.created`,
  `client.updated`, `shift.created`, `shift.updated`,
  `demo.handoff_generated`, `demo.transcribe_called`,
  `flag.pattern_detected`, `family_summary.generated`.
- **PII not stored** — IP + UA hashed before logging in audit events.
- **Tenant isolation** — Every query agency-scoped; cross-agency reads
  return 404.
- **Caregiver ACL on CareCard** — 404 (existence-hiding) when caregiver
  has no shift for the client.
- **Raw note ACL** — Coordinator+ only. Caregivers see structured
  summaries only across other caregivers' notes.

---

### AI PIPELINE FEATURES

- **Handoff summary generation** — Claude Sonnet 4.6 with structured-output
  prompt; fields: summary_overview, notable_changes, tasks_completed,
  tasks_pending, follow_up_items, supervisor_attention_needed,
  supervisor_attention_reason, confidence_score.
- **Risk flag extraction** — Grounded against hallucinations:
  flags require explicit support in the note. Confidence threshold ≥ 0.5
  (server-validated).
- **Continuity score (Sprint 9)** — `app/services/continuity_score.py`
  computes `(score, breakdown)` from the AI summary + raw note. Components:
  note_length (≤0.2), has_overview (0.2), notable_changes (0.15),
  tasks_present (0.15), follow_up (0.15), ai_confidence (0.15).
  Persisted on every HandoffSummary as `continuity_score` (Float) +
  `score_breakdown` (JSONB).
- **Repeat-flag pattern detection (Sprint 9)** —
  `app/services/pattern_service.py`. After flag persistence, counts prior
  flags of the same category for the same client over the last 14 days
  (excluding existing pattern markers). At ≥3 occurrences:
  - Creates a `ContinuityEvent` (category=`repeat_flag_pattern`, severity=high)
  - Inserts a synthetic high-severity RiskFlag with
    `flag_metadata.pattern="true"`, `pattern_count`, `window_days`.
  - Fires audit event `flag.pattern_detected`.
- **Family summary generation (Sprint 9)** — Dedicated system prompt
  rules: warm tone, plain English, no medical jargon, no medication
  names, no clinical assessments, ≤150 words. Falls back to a static
  message when `ANTHROPIC_API_KEY` is missing or the call fails.
- **CareCard service** — Coordinator-callable AI summary built from
  recent notes + client care context.
- **Whisper transcription** — Voice notes transcribed via OpenAI
  Whisper-1 with chunked live preview + final clean replacement.
- **Mock pipeline fallback** — Deterministic stub when API keys are
  missing, used by the synthetic-notes test runner.

---

### SHIFT TEMPLATE FEATURES (Sprint 9)

- **shift_templates table** — id, agency_id, name, start_time, end_time,
  crosses_midnight, color, is_active, display_order, timestamps.
- **Default templates** — Seeded automatically on agency creation:
  - AM Shift — 06:00 – 14:00 (blue)
  - Evening Shift — 14:00 – 22:00 (purple)
  - NOC Shift — 22:00 – 06:00 next day (navy, crosses_midnight=true)
- **Backfill** — `seed_default_templates(db, agency_id)` is idempotent and
  runs from the dev seeder for the existing Sunrise Home Care agency.
- **Per-agency cap** — 10 active templates max; 11th create returns 422.
- **Endpoints**:
  - `GET /shift-templates` — Authenticated agency-scoped list, ordered by
    display_order.
  - `POST /shift-templates` — Coordinator/supervisor/admin.
  - `PATCH /shift-templates/{id}` — Coordinator+.
  - `DELETE /shift-templates/{id}` — Admin only; soft-delete (sets
    `is_active=false`); refuses if any future shift still references it.
- **Shift integration** — `Shift` table gains `template_id` (FK) +
  `template_name` (denormalized for display after a template rename).
  `POST /shifts` accepts `template_id`; when present, derives
  `scheduled_start` / `scheduled_end` from `template.start_time` + date,
  handles `crosses_midnight=true` by adding a day to the end date.
- **CreateShiftModal (frontend)** — Three template cards horizontal/stacked,
  selected state in primary/primary-pale, "Custom times" override card,
  start/end time pickers when custom is chosen.
- **Shift list display** — Color dot before client name; secondary line
  shows "[Template name] · [time range]" when `template_name` is present,
  raw time range otherwise.

---

### PATTERN DETECTION FEATURES (Sprint 9)

- **Threshold**: 3 same-category flags on the same client within 14 days.
- **Suppression**: Skips counting prior pattern markers and won't fire
  twice within the same 14-day window.
- **Persistence**: ContinuityEvent (high severity) + a synthetic RiskFlag
  with metadata.
- **Audit**: `flag.pattern_detected` with category, count, window.
- **Frontend**: Pattern chip on RiskFlagCard, distinct icon on the client
  timeline.

---

### FAMILY COMMUNICATION FEATURES (Sprint 9)

- **Endpoint**: `GET /clients/{client_id}/family-summary` (coordinator+).
- **Inputs**: Last 7 days of finalized handoff overviews + notable changes.
- **Output**: `{summary_text, generated_at, week_start, week_end}`.
- **Audit**: `family_summary.generated`.
- **Frontend tab**: Generate / regenerate, copy to clipboard, "Send via
  email" coming-soon placeholder, AI disclaimer.

---

### MORNING DIGEST FEATURES (Sprint 9)

- **Service**: `app/services/digest_service.py` builds a `DigestData` dict:
  - Yesterday: submissions, new_high_flags, flags_confirmed, flags_dismissed,
    shifts_at_risk.
  - Today: shifts_scheduled, shifts_at_risk, clients_with_high_flags.
  - Top 3 clients needing attention (severity-ranked, recency-tied).
- **Email template**: `_digest_html` renders sections matching ShiftBriefCard
  layout, "Open Dashboard" CTA, footer mentioning the recipient's
  organization.
- **Subject**: `DaliyaFlow Morning Brief — [Organization Name] — [Date]`.
- **Recipients**: Coordinators + supervisors with
  `notification_preferences.morning_digest=true` (default true).
- **Schedule**: Celery beat fires `daliyaflow.send_morning_digests` at
  `:30` of every UTC hour. The dispatcher iterates agencies, computes
  agency-local time via `zoneinfo.ZoneInfo`, and only renders + sends when
  it is 6:30am locally — single beat entry, per-agency timezone fanout.
- **`beat` Docker service**: Added to `docker-compose.yml` alongside the
  worker, runs `celery -A app.workers.tasks beat --scheduler celery.beat
  .PersistentScheduler`.

---

### LANDING PAGE FEATURES

- **NavBar** — Logo, primary nav, auth CTA.
- **Hero** — Headline + subhead, CTAs, **founder line (Sprint 9)**:
  "Built by someone who has been there." with subline "Our founder spent
  years as a caregiver before building this." Realistic in-app mockup
  illustration on the right.
- **Problem section** — Three pain points.
- **Solution section** — Three pillars.
- **Demo section** — Live AI demo:
  - Text mode: three vivid sample notes (routine / medication /
    cognitive).
  - Voice mode: collapsible "See example script" hint with the Dorothy
    read-aloud script.
  - Live chunked transcription mirrors the caregiver flow.
  - Whisper-unavailable banner falls back to text mode.
- **Features grid** — Six product pillars.
- **Social proof (Sprint 9)** — `EARLY FEEDBACK` section between Features
  and Request Access. White card with `--color-forest-pale` left border
  4px, primary-color quote marks. Placeholder testimonial:
  "The handoff summaries actually capture what matters. Our morning
  coordinator review went from 45 minutes to under 10." Attribution:
  "Senior care organization, Pacific Northwest (Pilot)".
- **Request Access form** — Lead capture with rate limit (3/hour/IP).
  Sprint 9 added a fourth field: textarea
  "What's your biggest challenge with shift handoffs right now?"
  (max 500 chars, optional). Stored in `waitlist_entries.challenge_description`.
- **Footer** — Copy: "AI handoffs and care continuity for senior care teams",
  build-with-care credit, copyright.
- **Public route gating** — PublicOnlyRoute redirects signed-in users
  to their role home; unauthenticated users see the landing page.

---

### INFRASTRUCTURE FEATURES

- **Docker Compose dev** — postgres 15, redis 7, backend (uvicorn reload),
  worker (celery), beat (celery beat — Sprint 9), frontend (vite).
- **Health checks** — `/health` returns DB + Redis status + service
  metadata.
- **Request ID middleware** — Every response gets `X-Request-ID` (provided
  or generated UUID4); request elapsed time emitted on log line.
- **Security headers middleware (Sprint 9)** — In-process header injection
  in addition to nginx-level headers, so dev sees the same posture as prod.
- **Body size limit middleware (Sprint 9)** — 10MB default, 25MB for audio.
- **Migrations** — Alembic (`0001_initial`, `0002_waitlist`,
  `0003_sprint9` adding user_invitations, shift_templates, score columns,
  notification_preferences, challenge_description, flag_metadata).
- **Seed script** — `scripts/seed_dev.py` provisions Sunrise Home Care,
  users, clients, shifts, default shift templates (Sprint 9), runs the AI
  pipeline against synthetic notes.
- **Email** — Console / SES pluggable, magic link / flag escalation /
  invitation / morning digest templates.
- **Audio** — Boto3 S3 upload with presigned URL pattern; size cap and
  mime allow-list.
- **Sentry** — Optional via `SENTRY_DSN`; before-send scrub for PII.

---

### TEST + QA FEATURES

- **Synthetic notes pipeline test** (`tests/test_pipeline_e2e.py`) —
  7 synthetic notes cycled through `run_pipeline` end-to-end.
- **Integration smoke test** (`tests/test_integration_smoke.py`) —
  13 checks covering login → submit → poll → finalize → confirm flag
  → carecard → dashboard → audit log → cross-tenant isolation.
- **Security suite** (`tests/security/run_all.py`) — 23 checks across
  tenant, RBAC, prompt injection, audio.
- **Sprint 7 features** (`tests/test_sprint7_features.py`) — 5 tests
  covering raw-note ACL, shift-brief agency scoping, waitlist + rate
  limit.
- **Sprint 8 features** (`tests/test_sprint8_features.py`) — 3 tests
  covering risk-flag grounding for fall notes, caregiver CareCard ACL.
- **Sprint 9 features (`tests/test_sprint9_features.py`)** — 13 tests:
  - test_default_templates_created_on_agency_creation
  - test_shift_created_from_template_has_correct_times
  - test_noc_shift_crosses_midnight_correctly
  - test_coordinator_cannot_exceed_10_templates
  - test_invitation_flow_end_to_end
  - test_caregiver_cannot_self_register
  - test_expired_invitation_rejected
  - test_brute_force_lockout_after_5_attempts
  - test_session_timeout_revokes_tokens (config check)
  - test_repeat_flag_pattern_detected_after_3
  - test_continuity_score_calculated_on_generation
  - test_sanitization_removes_null_bytes
  - test_sanitization_removes_zero_width_chars
- **Frontend type check** — `npx tsc --noEmit` clean across all pages,
  components, hooks, api modules.

---

### PLANNED / DEFERRED FEATURES

- Production deploy to ECS Fargate (compose.prod.yml is a placeholder).
- httpOnly-cookie storage for refresh tokens (currently localStorage).
- Real email send (SMTP / SES live) — currently console-based for dev.
- Family portal (read-only family-facing access) — Sprint 9 builds the
  data layer + coordinator UI; consumer access deferred.
- Family summary "Send via email" — placeholder button, integration
  deferred to Sprint 10.
- Full GitHub Actions CI/CD workflow.
- Mobile push notifications.
- Analytics dashboard for AI flag accuracy / coordinator response time.
- Bulk client + shift import.
- Caregiver monthly handoff score widget on profile (endpoint live;
  UI surface still planned).
- Drag-to-reorder for shift templates (display_order is wired; UI control
  is a manual number input today).
- Real testimonials replacing the social-proof placeholder.
- "Resend invitation token returned" — invitation resend regenerates the
  token but does not currently surface the new URL to the inviter; relies
  on email delivery.
