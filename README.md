# DaliyaFlow

AI handoffs and care continuity for senior care teams.

DaliyaFlow converts caregiver shift notes into structured handoffs, risk alerts, and continuity intelligence.

## Stack
- **Frontend**: React 18 + TypeScript + Vite + Tailwind + React Query + Zustand
- **Backend**: Python 3.11 + FastAPI + SQLAlchemy 2.0 async + Pydantic v2
- **Database**: PostgreSQL 15
- **Queue**: Celery + Redis
- **AI**: Claude Sonnet (via Anthropic API)
- **Containers**: Docker + Docker Compose

## Local development

```bash
cp .env.example .env
docker compose -f infrastructure/docker-compose.yml up
```

Backend at http://localhost:8000 — frontend at http://localhost:3000.

See `DALIYAFLOW_SKILL.md` for the full architectural specification.
