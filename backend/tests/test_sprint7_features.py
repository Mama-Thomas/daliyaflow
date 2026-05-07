"""Sprint 7 feature tests.

Run inside the backend container:

    docker compose exec backend python -m tests.test_sprint7_features

Tests:
1. test_raw_note_endpoint_coordinator_can_access
2. test_raw_note_endpoint_caregiver_cannot_access
3. test_shift_brief_endpoint_agency_scoped
4. test_waitlist_submission_succeeds
5. test_waitlist_rate_limit
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
from app.models.shift_note import ShiftNoteRaw
from app.models.user import User


BASE_URL = "http://localhost:8000/api/v1"


# ─── Setup helpers ────────────────────────────────────────────────────────────


async def _seed_pair() -> dict:
    """Two agencies, each with a coordinator + caregiver + client + shift +
    raw note. Returns a dict of the resulting IDs and emails."""
    out: dict[str, dict] = {}
    async with SessionLocal() as db:
        for letter in ("a", "b"):
            slug = f"s7-{letter}"
            agency = (
                await db.execute(select(Agency).where(Agency.slug == slug))
            ).scalar_one_or_none()
            if agency is None:
                agency = Agency(name=f"S7 Agency {letter.upper()}", slug=slug)
                db.add(agency)
                await db.flush()

            coord_email = f"s7-coord-{letter}@example.com"
            coord = (
                await db.execute(select(User).where(User.email == coord_email))
            ).scalar_one_or_none()
            if coord is None:
                coord = User(
                    agency_id=agency.id,
                    email=coord_email,
                    first_name="Coord",
                    last_name=letter.upper(),
                    role="coordinator",
                    status="active",
                    password_hash=hash_password("testpass123"),
                )
                db.add(coord)
                await db.flush()

            cg_email = f"s7-cg-{letter}@example.com"
            cg = (
                await db.execute(select(User).where(User.email == cg_email))
            ).scalar_one_or_none()
            if cg is None:
                cg = User(
                    agency_id=agency.id,
                    email=cg_email,
                    first_name="Care",
                    last_name=letter.upper(),
                    role="caregiver",
                    status="active",
                    password_hash=hash_password("testpass123"),
                )
                db.add(cg)
                await db.flush()

            client = (
                await db.execute(
                    select(Client)
                    .where(Client.agency_id == agency.id)
                    .where(Client.first_name == "S7Client")
                )
            ).scalar_one_or_none()
            if client is None:
                client = Client(
                    agency_id=agency.id,
                    first_name="S7Client",
                    last_name=letter.upper(),
                    preferred_name=f"Client{letter.upper()}",
                    address_neighborhood="Sandbox",
                )
                db.add(client)
                await db.flush()

            now = datetime.now(timezone.utc)
            shift = Shift(
                agency_id=agency.id,
                client_id=client.id,
                caregiver_id=cg.id,
                scheduled_start=now - timedelta(hours=2),
                scheduled_end=now,
                status="completed",
            )
            db.add(shift)
            await db.flush()

            note = ShiftNoteRaw(
                shift_id=shift.id,
                agency_id=agency.id,
                input_type="text",
                raw_text=(
                    f"Sprint 7 test note for agency {letter}. "
                    "Client was in good spirits, ate lunch, took meds without issue."
                ),
                word_count=20,
            )
            db.add(note)
            await db.flush()
            await db.commit()

            out[letter] = {
                "agency_id": str(agency.id),
                "coord_email": coord.email,
                "caregiver_email": cg.email,
                "shift_id": str(shift.id),
                "client_id": str(client.id),
                "note_id": str(note.id),
            }
    return out


_TOKEN_CACHE: dict[str, str] = {}


async def _login(http: httpx.AsyncClient, email: str, password: str) -> str:
    """Cached login. Auth login is 5/min — back off and retry once on 429
    so sustained reruns of the suite don't false-fail."""
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


async def test_raw_note_endpoint_coordinator_can_access(
    http: httpx.AsyncClient, ctx: dict
) -> tuple[str, bool, str]:
    tok = await _login(http, ctx["a"]["coord_email"], "testpass123")
    r = await http.get(
        f"{BASE_URL}/shifts/{ctx['a']['shift_id']}/notes/raw", headers=_hdr(tok)
    )
    ok = r.status_code == 200 and "raw_text" in r.json()
    return ("raw_note_endpoint_coordinator_can_access", ok, f"status={r.status_code}")


async def test_raw_note_endpoint_caregiver_cannot_access(
    http: httpx.AsyncClient, ctx: dict
) -> tuple[str, bool, str]:
    tok = await _login(http, ctx["a"]["caregiver_email"], "testpass123")
    r = await http.get(
        f"{BASE_URL}/shifts/{ctx['a']['shift_id']}/notes/raw", headers=_hdr(tok)
    )
    # require_roles(coordinator+) returns 403 for caregivers
    ok = r.status_code == 403
    return ("raw_note_endpoint_caregiver_cannot_access", ok, f"status={r.status_code}")


async def test_shift_brief_endpoint_agency_scoped(
    http: httpx.AsyncClient, ctx: dict
) -> tuple[str, bool, str]:
    """Coordinator A's shift brief must NEVER include agency B's clients."""
    tok = await _login(http, ctx["a"]["coord_email"], "testpass123")
    r = await http.get(f"{BASE_URL}/dashboard/shift-brief", headers=_hdr(tok))
    if r.status_code != 200:
        return (
            "shift_brief_endpoint_agency_scoped",
            False,
            f"status={r.status_code}",
        )
    body = r.json()
    other_client = ctx["b"]["client_id"]
    leaked = any(c["client_id"] == other_client for c in body.get("clients", []))
    return (
        "shift_brief_endpoint_agency_scoped",
        not leaked,
        f"clients={len(body.get('clients', []))}, leaked_b_client={leaked}",
    )


async def test_waitlist_submission_succeeds(
    http: httpx.AsyncClient, ctx: dict
) -> tuple[str, bool, str]:
    # Use a unique email to avoid collisions across runs.
    suffix = uuid.uuid4().hex[:8]
    payload = {
        "name": "Sprint Seven Tester",
        "agency_name": "S7 Test Agency",
        "email": f"s7-waitlist+{suffix}@example.com",
    }
    r = await http.post(f"{BASE_URL}/waitlist", json=payload)
    ok = r.status_code == 201 and "thank you" in r.json().get("message", "").lower()
    return ("waitlist_submission_succeeds", ok, f"status={r.status_code}")


async def test_waitlist_rate_limit(
    http: httpx.AsyncClient, ctx: dict
) -> tuple[str, bool, str]:
    """3/hour limit per IP. Submit 3 successfully, then expect 429 on the 4th."""
    suffix = uuid.uuid4().hex[:6]
    statuses: list[int] = []
    for i in range(4):
        r = await http.post(
            f"{BASE_URL}/waitlist",
            json={
                "name": f"Rate Test {i}",
                "agency_name": "Rate Test Agency",
                "email": f"rate-{suffix}-{i}@example.com",
            },
        )
        statuses.append(r.status_code)
    # Some of the first 3 may already have been used by the previous test
    # depending on rate window state — we just require the 4th call to be a 429.
    last_was_429 = statuses[-1] == 429
    return (
        "waitlist_rate_limit",
        last_was_429,
        f"statuses={statuses}",
    )


# ─── Runner ───────────────────────────────────────────────────────────────────


async def _clear_rate_limits() -> None:
    """Wipe slowapi rate-limit keys so reruns aren't blocked by stale quotas.

    Only touches `LIMITER/*` keys — application data is left untouched."""
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
    print("SPRINT 7 FEATURE TESTS")
    print("=" * 90)

    await _clear_rate_limits()
    ctx = await _seed_pair()
    failures = 0
    async with httpx.AsyncClient(timeout=30) as http:
        for fn in (
            test_raw_note_endpoint_coordinator_can_access,
            test_raw_note_endpoint_caregiver_cannot_access,
            test_shift_brief_endpoint_agency_scoped,
            test_waitlist_submission_succeeds,
            test_waitlist_rate_limit,
        ):
            try:
                name, ok, detail = await fn(http, ctx)
            except Exception as exc:  # noqa: BLE001
                print(f"  ✗ {fn.__name__:55s} EXC    {type(exc).__name__}: {exc}")
                failures += 1
                continue
            mark = "✓" if ok else "✗"
            print(f"  {mark} {name:55s} {'PASS' if ok else 'FAIL':6s} {detail}")
            if not ok:
                failures += 1

    print("=" * 90)
    print("OVERALL:", "PASS" if failures == 0 else f"FAIL ({failures} failures)")
    print("=" * 90)
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
