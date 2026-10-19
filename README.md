# DaliyaFlow

**AI shift handoffs and care continuity for senior care teams.**

Caregivers in home care, assisted living, and memory care hand off clients between shifts many times a day, usually through rushed verbal updates or scattered notes. Important changes get lost. DaliyaFlow lets a caregiver speak or type a shift note and turns it into a structured handoff, risk alerts, and a continuity record the next caregiver and the coordinator can trust.

The design comes directly from my nearly six years working as a caregiver.

## Demo

> **Watch the demo:** [DaliyaFlow walkthrough](https://youtu.be/--mQbpzltkg)
>
> The live deployment at daliyaflow.com is offline while I migrate hosting. The demo video shows the full product running in production.

## What it does

**For caregivers**
- Record a voice note or type a shift note; voice is transcribed live with Whisper, then cleaned into a final transcript you can edit
- See a Care Brief before each shift: key things to know, what to watch for, and pending tasks
- Read recent handoffs from other caregivers for the same client
- Multilingual handoff support

**For coordinators and supervisors**
- Priority queue of risk flags across all clients, with severity and supporting evidence
- Automatic detection of repeat patterns (for example, the same risk flagged 3+ times in 14 days)
- Continuity score for every handoff, showing how complete the information passed on was
- Morning digest email and plain-language family summaries

## How the AI pipeline works

1. **Transcribe:** Voice notes go through OpenAI Whisper, with chunked live preview while recording.
2. **Summarize:** Claude generates a structured handoff (overview, notable changes, tasks completed and pending, follow-ups, whether a supervisor needs to look).
3. **Flag risks:** Risk flags must be explicitly supported by the note text, with a server-validated confidence threshold, to guard against hallucinated alerts.
4. **Score and detect patterns:** Each handoff gets a continuity score; repeated flags for the same client escalate into a high-severity pattern alert.

Processing runs asynchronously on Celery workers so caregivers aren't left waiting.

## Architecture

| Layer | Tech |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind, React Query, Zustand |
| Backend | Python 3.11, FastAPI, SQLAlchemy 2.0 (async), Pydantic v2 |
| Data | PostgreSQL 15, Alembic migrations |
| Async jobs | Celery + Redis (worker and beat scheduler) |
| AI | Anthropic Claude API, OpenAI Whisper |
| Infra | Docker, AWS ECS Fargate, RDS, S3, CloudFront, GitHub Actions |

## Security and privacy

Care notes are sensitive, so security was built in from the start:
- Short-lived JWT access tokens (15 min) with rotating, hashed refresh tokens
- Passwordless magic-link sign-in with single-use hashed tokens
- Role-based access: caregivers only see clients they're assigned to
- Brute-force lockout, per-route rate limiting, and session timeouts
- Audit log of sign-ins, handoffs, and flag events
- PII scrubbing before anything is sent to error monitoring

## Run it locally

```bash
cp .env.example .env
docker compose -f infrastructure/docker-compose.yml up
docker compose -f infrastructure/docker-compose.yml exec -w /app backend python -m scripts.seed_dev
```

Backend: http://localhost:8000 · Frontend: http://localhost:3000

The seed script creates a demo care organization with caregivers, clients, and shifts, and runs the AI pipeline on synthetic notes. Without API keys, a deterministic mock pipeline is used.

## More detail

- [`FEATURES.md`](FEATURES.md): complete feature list
- [`DALIYAFLOW_SKILL.md`](DALIYAFLOW_SKILL.md): full architecture spec, database schema, API contract, and AI pipeline design
