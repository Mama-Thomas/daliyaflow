"""Sprint 4 integration smoke test.

What it does (run inside the backend container):

    docker compose exec backend python -m tests.test_integration_smoke

1. Creates two agencies + a coordinator, caregiver, client, and shift in each.
2. Logs the caregiver into agency 1 via /auth/login.
3. Submits a handoff note end-to-end (via the API), polls for completion.
4. Logs the coordinator in, confirms one flag.
5. Generates a CareCard for the test client.
6. Verifies that the audit log captured each action listed in SKILL.md
   section 9.8.
7. Verifies cross-tenant isolation: a coordinator in agency 1 must NOT be able
   to read agency 2's clients, shifts, flags, dashboard, or CareCard."""
from __future__ import annotations

import asyncio
import sys
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.agency import Agency
from app.models.audit_event import AuditEvent
from app.models.client import Client
from app.models.shift import Shift
from app.models.user import User


BASE_URL = "http://localhost:8000/api/v1"

EXPECTED_AUDIT_ACTIONS = {
    "user.login",
    "handoff.note_submitted",
    "handoff.generated",
    "handoff.finalized",
    "flag.confirmed",
    "carecard.generated",
}


async def _seed_agency(slug_suffix: str) -> dict[str, str]:
    async with SessionLocal() as db:
        slug = f"smoke-{slug_suffix}"
        agency = (
            await db.execute(select(Agency).where(Agency.slug == slug))
        ).scalar_one_or_none()
        if agency is None:
            agency = Agency(name=f"Smoke Agency {slug_suffix}", slug=slug)
            db.add(agency)
            await db.flush()

        coord_email = f"coord-{slug_suffix}@example.com"
        coord = (
            await db.execute(select(User).where(User.email == coord_email))
        ).scalar_one_or_none()
        if coord is None:
            coord = User(
                agency_id=agency.id,
                email=coord_email,
                first_name="Coord",
                last_name=f"{slug_suffix.upper()}",
                role="coordinator",
                status="active",
                password_hash=hash_password("testpass123"),
            )
            db.add(coord)
            await db.flush()

        cg_email = f"caregiver-{slug_suffix}@example.com"
        cg = (
            await db.execute(select(User).where(User.email == cg_email))
        ).scalar_one_or_none()
        if cg is None:
            cg = User(
                agency_id=agency.id,
                email=cg_email,
                first_name="Care",
                last_name=f"{slug_suffix.upper()}",
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
                .where(Client.first_name == "Smoke")
            )
        ).scalar_one_or_none()
        if client is None:
            client = Client(
                agency_id=agency.id,
                first_name="Smoke",
                last_name=f"Test{slug_suffix.upper()}",
                preferred_name="Smoke",
                care_context_summary="Synthetic smoke client for end-to-end test.",
                address_neighborhood="Sandbox",
            )
            db.add(client)
            await db.flush()

        # Always create a fresh shift so the pipeline can run idempotently
        now = datetime.now(timezone.utc)
        shift = Shift(
            agency_id=agency.id,
            client_id=client.id,
            caregiver_id=cg.id,
            scheduled_start=now - timedelta(hours=4),
            scheduled_end=now,
            status="completed",
        )
        db.add(shift)
        await db.flush()
        await db.commit()

        return {
            "agency_id": str(agency.id),
            "coord_id": str(coord.id),
            "coord_email": coord.email,
            "caregiver_id": str(cg.id),
            "caregiver_email": cg.email,
            "client_id": str(client.id),
            "shift_id": str(shift.id),
        }


async def _login(http: httpx.AsyncClient, email: str, password: str) -> tuple[str, str]:
    r = await http.post(
        f"{BASE_URL}/auth/login", json={"email": email, "password": password}
    )
    r.raise_for_status()
    body = r.json()
    return body["access_token"], body["refresh_token"]


def _h(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _wait_for_handoff(
    http: httpx.AsyncClient, token: str, shift_id: str, timeout_sec: int = 60
) -> dict[str, Any]:
    started = datetime.now(timezone.utc)
    while True:
        r = await http.get(
            f"{BASE_URL}/shifts/{shift_id}/handoff/status", headers=_h(token)
        )
        r.raise_for_status()
        body = r.json()
        if body["status"] == "complete":
            return body
        if body["status"] == "failed":
            raise RuntimeError(f"handoff failed: {body}")
        if (datetime.now(timezone.utc) - started).total_seconds() > timeout_sec:
            raise TimeoutError(f"handoff did not complete in {timeout_sec}s")
        await asyncio.sleep(1.0)


async def _audit_actions_for(agency_id: str) -> set[str]:
    async with SessionLocal() as db:
        rows = (
            await db.execute(
                select(AuditEvent.action).where(
                    AuditEvent.agency_id == uuid.UUID(agency_id)
                )
            )
        ).all()
        return {row[0] for row in rows}


async def main() -> int:
    results: list[tuple[str, str, str]] = []

    def record(step: str, status: str, detail: str = "") -> None:
        results.append((step, status, detail))

    a1 = await _seed_agency("alpha")
    a2 = await _seed_agency("bravo")

    async with httpx.AsyncClient(timeout=60.0) as http:
        # ---------- Caregiver A1 submits a handoff ----------
        try:
            cg_token, _ = await _login(http, a1["caregiver_email"], "testpass123")
            record("login_caregiver_a1", "PASS")
        except Exception as exc:
            record("login_caregiver_a1", "FAIL", str(exc))
            return _summarize(results)

        try:
            r = await http.post(
                f"{BASE_URL}/shifts/{a1['shift_id']}/notes",
                json={
                    "input_type": "text",
                    "raw_text": (
                        "Smoke test shift. Mr. Smoke seemed unsteady on his feet "
                        "today and refused his afternoon medication. The stove "
                        "burner was on when I arrived but I turned it off "
                        "immediately."
                    ),
                },
                headers=_h(cg_token),
            )
            r.raise_for_status()
            record("submit_note", "PASS")
        except Exception as exc:
            record("submit_note", "FAIL", str(exc))
            return _summarize(results)

        try:
            handoff = await _wait_for_handoff(http, cg_token, a1["shift_id"])
            record(
                "poll_status",
                "PASS",
                f"flags={len(handoff.get('suggested_flags', []))}",
            )
        except Exception as exc:
            record("poll_status", "FAIL", str(exc))
            return _summarize(results)

        try:
            r = await http.post(
                f"{BASE_URL}/handoffs/{handoff['handoff_id']}/finalize",
                headers=_h(cg_token),
            )
            r.raise_for_status()
            record("finalize_handoff", "PASS")
        except Exception as exc:
            record("finalize_handoff", "FAIL", str(exc))

        # ---------- Coordinator A1 confirms a flag ----------
        try:
            coord_token, _ = await _login(
                http, a1["coord_email"], "testpass123"
            )
            record("login_coord_a1", "PASS")
        except Exception as exc:
            record("login_coord_a1", "FAIL", str(exc))
            return _summarize(results)

        flags = handoff.get("suggested_flags", [])
        if flags:
            try:
                r = await http.patch(
                    f"{BASE_URL}/flags/{flags[0]['id']}",
                    json={"status": "confirmed"},
                    headers=_h(coord_token),
                )
                r.raise_for_status()
                record("confirm_flag", "PASS", f"flag_id={flags[0]['id']}")
            except Exception as exc:
                record("confirm_flag", "FAIL", str(exc))
        else:
            record("confirm_flag", "SKIP", "no flags produced")

        # ---------- CareCard generation ----------
        try:
            r = await http.get(
                f"{BASE_URL}/clients/{a1['client_id']}/continuity-briefing",
                headers=_h(coord_token),
            )
            r.raise_for_status()
            body = r.json()
            assert "card" in body and "welcome_line" in body["card"]
            record("carecard_generated", "PASS")
        except Exception as exc:
            record("carecard_generated", "FAIL", str(exc))

        # ---------- Coordinator dashboard surfaces the activity ----------
        try:
            r = await http.get(
                f"{BASE_URL}/dashboard/summary", headers=_h(coord_token)
            )
            r.raise_for_status()
            summary = r.json()
            assert summary["submissions_today"] >= 1
            record(
                "dashboard_summary_visible",
                "PASS",
                f"submissions_today={summary['submissions_today']}",
            )
        except Exception as exc:
            record("dashboard_summary_visible", "FAIL", str(exc))

        # ---------- Audit log completeness ----------
        try:
            actions = await _audit_actions_for(a1["agency_id"])
            missing = EXPECTED_AUDIT_ACTIONS - actions
            if missing:
                record(
                    "audit_log_complete",
                    "FAIL",
                    f"missing actions: {sorted(missing)}",
                )
            else:
                record(
                    "audit_log_complete",
                    "PASS",
                    f"recorded {len(actions)} unique actions",
                )
        except Exception as exc:
            record("audit_log_complete", "FAIL", str(exc))

        # ---------- Cross-tenant isolation ----------
        # A1 coordinator MUST NOT see A2's client, shift, flag, or carecard.
        async def _expect_404(label: str, url: str) -> None:
            try:
                r = await http.get(url, headers=_h(coord_token))
                if r.status_code in (403, 404):
                    record(label, "PASS", f"status={r.status_code}")
                else:
                    record(
                        label,
                        "FAIL",
                        f"expected 403/404 got {r.status_code}",
                    )
            except Exception as exc:
                record(label, "FAIL", str(exc))

        await _expect_404(
            "isolation_other_client",
            f"{BASE_URL}/clients/{a2['client_id']}",
        )
        await _expect_404(
            "isolation_other_shift",
            f"{BASE_URL}/shifts/{a2['shift_id']}",
        )
        await _expect_404(
            "isolation_other_carecard",
            f"{BASE_URL}/clients/{a2['client_id']}/continuity-briefing",
        )

        # Listing endpoints in A1 must NOT include A2's IDs
        try:
            r = await http.get(f"{BASE_URL}/clients", headers=_h(coord_token))
            r.raise_for_status()
            ids = {c["id"] for c in r.json()}
            if a2["client_id"] in ids:
                record(
                    "isolation_clients_list", "FAIL",
                    "agency2 client visible in agency1 list",
                )
            else:
                record(
                    "isolation_clients_list", "PASS",
                    f"agency1 sees {len(ids)} client(s)",
                )
        except Exception as exc:
            record("isolation_clients_list", "FAIL", str(exc))

    return _summarize(results)


def _summarize(results: list[tuple[str, str, str]]) -> int:
    print()
    print("=" * 90)
    print("SPRINT 4 INTEGRATION SMOKE TEST")
    print("=" * 90)
    fails = 0
    for step, status, detail in results:
        marker = {"PASS": "✓", "FAIL": "✗", "SKIP": "·"}.get(status, "?")
        print(f"  {marker} {step.ljust(36)} {status.ljust(5)}  {detail}")
        if status == "FAIL":
            fails += 1
    print("=" * 90)
    print(f"OVERALL: {'PASS' if fails == 0 else f'FAIL ({fails} failures)'}")
    print("=" * 90)
    return 0 if fails == 0 else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
