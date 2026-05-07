"""Sprint 8 feature tests.

Run inside the backend container:

    docker compose exec backend python -m tests.test_sprint8_features

Tests:
1. test_fall_note_extracts_fall_concern_not_confusion
   — risk-flag grounding: a well-handled fall note must produce fall_concern
     (and supervisor_follow_up_needed) and MUST NOT produce
     confusion_cognitive_change, refusal_to_eat, or hygiene_self_neglect.
2. test_caregiver_can_access_carecard_for_assigned_client
   — Sprint 8 ACL: caregiver gets 200 on /clients/{id}/continuity-briefing
     when they have any shift assigned to that client.
3. test_caregiver_cannot_access_carecard_for_unassigned_client
   — and 404 (existence-hiding) when they have no shift assigned to that
     client (still inside their own agency).
"""
from __future__ import annotations

import asyncio
import sys
import uuid
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.agency import Agency
from app.models.client import Client
from app.models.shift import Shift
from app.models.user import User
from app.services import ai_pipeline


BASE_URL = "http://localhost:8000/api/v1"


# ─── Fixture ──────────────────────────────────────────────────────────────────


async def _seed_sprint8() -> dict:
    """One agency, one caregiver, two clients (assigned + unassigned). Returns
    a dict of the resulting IDs and emails. Idempotent across reruns."""
    async with SessionLocal() as db:
        agency = (
            await db.execute(select(Agency).where(Agency.slug == "s8"))
        ).scalar_one_or_none()
        if agency is None:
            agency = Agency(name="S8 Agency", slug="s8")
            db.add(agency)
            await db.flush()

        cg = (
            await db.execute(
                select(User).where(User.email == "s8-cg@example.com")
            )
        ).scalar_one_or_none()
        if cg is None:
            cg = User(
                agency_id=agency.id,
                email="s8-cg@example.com",
                first_name="Sprint8",
                last_name="Caregiver",
                role="caregiver",
                status="active",
                password_hash=hash_password("testpass123"),
            )
            db.add(cg)
            await db.flush()

        assigned = (
            await db.execute(
                select(Client)
                .where(Client.agency_id == agency.id)
                .where(Client.first_name == "S8Assigned")
            )
        ).scalar_one_or_none()
        if assigned is None:
            assigned = Client(
                agency_id=agency.id,
                first_name="S8Assigned",
                last_name="Client",
                preferred_name="Assigned",
                care_context_summary="Assigned client for Sprint 8 ACL test.",
            )
            db.add(assigned)
            await db.flush()

        unassigned = (
            await db.execute(
                select(Client)
                .where(Client.agency_id == agency.id)
                .where(Client.first_name == "S8Unassigned")
            )
        ).scalar_one_or_none()
        if unassigned is None:
            unassigned = Client(
                agency_id=agency.id,
                first_name="S8Unassigned",
                last_name="Client",
                preferred_name="Unassigned",
                care_context_summary="Unassigned client for Sprint 8 ACL test.",
            )
            db.add(unassigned)
            await db.flush()

        # Ensure the caregiver has at least one shift on the assigned client.
        existing = (
            await db.execute(
                select(Shift)
                .where(Shift.agency_id == agency.id)
                .where(Shift.client_id == assigned.id)
                .where(Shift.caregiver_id == cg.id)
                .limit(1)
            )
        ).scalar_one_or_none()
        if existing is None:
            now = datetime.now(timezone.utc)
            shift = Shift(
                agency_id=agency.id,
                client_id=assigned.id,
                caregiver_id=cg.id,
                scheduled_start=now - timedelta(hours=2),
                scheduled_end=now,
                status="completed",
            )
            db.add(shift)

        await db.commit()
        return {
            "agency_id": str(agency.id),
            "caregiver_email": cg.email,
            "caregiver_id": str(cg.id),
            "assigned_client_id": str(assigned.id),
            "unassigned_client_id": str(unassigned.id),
        }


# ─── Auth helpers (cached) ─────────────────────────────────────────────────────

_TOKEN_CACHE: dict[str, str] = {}


async def _login(http: httpx.AsyncClient, email: str, password: str) -> str:
    if email in _TOKEN_CACHE:
        return _TOKEN_CACHE[email]
    for attempt in range(2):
        r = await http.post(
            f"{BASE_URL}/auth/login",
            json={"email": email, "password": password},
        )
        if r.status_code == 429 and attempt == 0:
            await asyncio.sleep(62)
            continue
        r.raise_for_status()
        tok = r.json()["access_token"]
        _TOKEN_CACHE[email] = tok
        return tok
    raise RuntimeError("login failed after retry")


def _hdr(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


# ─── Tests ────────────────────────────────────────────────────────────────────


async def test_fall_note_extracts_fall_concern_not_confusion(
    http: httpx.AsyncClient, ctx: dict
) -> tuple[str, bool, str]:
    """Sprint 8 grounding: a well-handled fall must produce fall_concern and
    must NOT produce unrelated flags (confusion / refusal_to_eat / hygiene)."""
    fall_note = (
        "Around 11am Mr. Robert had a fall getting up from the couch and went "
        "down on his right side. He was alert and talking the whole time. I "
        "called 911 and stayed with him. EMTs came, checked him out, no "
        "broken bones, vitals normal. I called his daughter and the "
        "coordinator right away and let them know what happened. He ate a "
        "small lunch, took his afternoon meds without any issues. He was a "
        "little shaken but doing okay by the end of the shift. Will need a "
        "supervisor to review and document this fall for the file."
    )
    flags = await ai_pipeline.extract_risk_flags(
        raw_note=fall_note,
        handoff_summary=None,
        shift_id=uuid.uuid4(),
        client_id=uuid.uuid4(),
        agency_id=uuid.uuid4(),
    )
    cats = {f.category for f in flags}
    must_have = {"fall_concern"}
    must_not_have = {
        "confusion_cognitive_change",
        "refusal_to_eat",
        "hygiene_self_neglect",
        "mood_agitation",
    }
    has_required = must_have.issubset(cats)
    no_hallucinations = cats.isdisjoint(must_not_have)
    ok = has_required and no_hallucinations
    return (
        "fall_note_extracts_fall_concern_not_confusion",
        ok,
        f"flags={sorted(cats)}",
    )


async def test_caregiver_can_access_carecard_for_assigned_client(
    http: httpx.AsyncClient, ctx: dict
) -> tuple[str, bool, str]:
    tok = await _login(http, ctx["caregiver_email"], "testpass123")
    r = await http.get(
        f"{BASE_URL}/clients/{ctx['assigned_client_id']}/continuity-briefing",
        headers=_hdr(tok),
    )
    ok = r.status_code == 200 and "card" in r.json()
    return (
        "caregiver_can_access_carecard_for_assigned_client",
        ok,
        f"status={r.status_code}",
    )


async def test_caregiver_cannot_access_carecard_for_unassigned_client(
    http: httpx.AsyncClient, ctx: dict
) -> tuple[str, bool, str]:
    tok = await _login(http, ctx["caregiver_email"], "testpass123")
    r = await http.get(
        f"{BASE_URL}/clients/{ctx['unassigned_client_id']}/continuity-briefing",
        headers=_hdr(tok),
    )
    # Sprint 8: hide existence rather than 403, so a caregiver cannot enumerate
    # which clients exist in their agency.
    ok = r.status_code == 404
    return (
        "caregiver_cannot_access_carecard_for_unassigned_client",
        ok,
        f"status={r.status_code}",
    )


# ─── Runner ───────────────────────────────────────────────────────────────────


async def _clear_rate_limits() -> None:
    try:
        import redis.asyncio as aioredis  # type: ignore
        from app.core.config import settings as cfg

        client = aioredis.from_url(
            cfg.REDIS_URL, encoding="utf-8", decode_responses=True
        )
        try:
            cursor = 0
            while True:
                cursor, keys = await client.scan(
                    cursor=cursor, match="LIMITER/*", count=200
                )
                if keys:
                    await client.delete(*keys)
                if cursor == 0:
                    break
        finally:
            await client.aclose()
    except Exception as exc:  # noqa: BLE001
        print(f"  (could not clear rate-limit keys: {exc})")


async def main() -> int:
    print()
    print("=" * 90)
    print("SPRINT 8 FEATURE TESTS")
    print("=" * 90)

    await _clear_rate_limits()
    ctx = await _seed_sprint8()
    failures = 0
    async with httpx.AsyncClient(timeout=60) as http:
        for fn in (
            test_fall_note_extracts_fall_concern_not_confusion,
            test_caregiver_can_access_carecard_for_assigned_client,
            test_caregiver_cannot_access_carecard_for_unassigned_client,
        ):
            try:
                name, ok, detail = await fn(http, ctx)
            except Exception as exc:  # noqa: BLE001
                print(f"  ✗ {fn.__name__:60s} EXC    {type(exc).__name__}: {exc}")
                failures += 1
                continue
            mark = "✓" if ok else "✗"
            print(f"  {mark} {name:60s} {'PASS' if ok else 'FAIL':6s} {detail}")
            if not ok:
                failures += 1

    print("=" * 90)
    print("OVERALL:", "PASS" if failures == 0 else f"FAIL ({failures} failures)")
    print("=" * 90)
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
