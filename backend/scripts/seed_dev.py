"""Seed dev/demo environment with a complete agency.

Idempotent — safe to re-run; existing rows are reused. Run inside the backend
container:

    docker compose exec backend python -m scripts.seed_dev
"""
from __future__ import annotations

import asyncio
import sys
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.agency import Agency
from app.models.client import Client
from app.models.continuity import ContinuityEvent
from app.models.shift import Shift
from app.models.shift_note import ShiftNoteRaw
from app.models.user import User
from app.workers.pipeline_tasks import run_pipeline


PASSWORD = "DevPassword123!"

USERS_SPEC = [
    ("admin", "admin@sunrisecare.com", "Avery", "Admin"),
    ("coordinator", "coordinator@sunrisecare.com", "Casey", "Coordinator"),
    ("supervisor", "supervisor@sunrisecare.com", "Sage", "Supervisor"),
    ("caregiver", "caregiver1@sunrisecare.com", "Maria", "Lopez"),
    ("caregiver", "caregiver2@sunrisecare.com", "James", "Patel"),
    ("caregiver", "caregiver3@sunrisecare.com", "Aisha", "Johnson"),
]

CLIENTS_SPEC = [
    {
        "first_name": "Harold",
        "last_name": "Whitman",
        "preferred_name": "Hal",
        "address_neighborhood": "Sunset District",
        "care_context_summary": (
            "82yo male, lives alone in ground-floor apartment. History of mild "
            "balance issues; uses a cane in the bathroom. Loves morning routine "
            "with newspaper and coffee. Diabetic — meds at 9am and 6pm."
        ),
    },
    {
        "first_name": "Eleanor",
        "last_name": "Ramirez",
        "preferred_name": "Eleanor",
        "address_neighborhood": "Inner Richmond",
        "care_context_summary": (
            "78yo female with early-stage dementia. Lost her husband last year. "
            "Responds best to calm voice and routine. Prefers tea over coffee. "
            "Daughter visits weekly."
        ),
    },
    {
        "first_name": "James",
        "last_name": "Cole",
        "preferred_name": "Jim",
        "address_neighborhood": "Glen Park",
        "care_context_summary": (
            "75yo male, recovering from hip replacement. PT exercises mornings. "
            "Blood pressure medication evening. Engaged and chatty. Prefers PB&J "
            "for lunch."
        ),
    },
    {
        "first_name": "Dorothy",
        "last_name": "Nguyen",
        "preferred_name": "Dot",
        "address_neighborhood": "West Portal",
        "care_context_summary": (
            "80yo female, mild arthritis and chronic back pain. Independent in "
            "most ADLs but needs help with shower. Loves the soup at lunch."
        ),
    },
    {
        "first_name": "George",
        "last_name": "Foster",
        "preferred_name": "George",
        "address_neighborhood": "North Beach",
        "care_context_summary": (
            "76yo male, lives alone, growing concern about home safety. Resists "
            "medication assistance. Has a daughter out of state. Likes the "
            "afternoon TV news."
        ),
    },
]

SYNTHETIC_NOTES = [
    (
        "Harold",
        "Got there at 9am, Mr. Harold was in good spirits today. Helped him "
        "shower, he needed more assistance than usual, seemed a bit unsteady "
        "on his feet. Ate all his breakfast which is good. Gave him his "
        "morning meds, he took them no problem. We watched some TV in the "
        "afternoon. His daughter called, he seemed happy after. Left at 3.",
    ),
    (
        "Eleanor",
        "rough shift today honestly. ms eleanor was really confused when i "
        "got there, didn't know what day it was and kept asking for her "
        "husband. she didnt want to eat lunch, barely touched it. she got a "
        "little agitated around 2pm, i just talked to her calmly and it "
        "helped. apartment smelled a bit off, bathroom trash hasnt been "
        "emptied in a while. left at 4.",
    ),
    (
        "James",
        "Arrived 10:30 (traffic). James was asleep, let him sleep until 11. "
        "Lunch was good, he ate well. Tried to do his exercises but he "
        "refused, said his back hurt too much. I could not find his evening "
        "blood pressure medication, checked the usual spot and the bathroom "
        "cabinet, not there. Called the coordinator but no answer.",
    ),
    (
        "Dorothy",
        "okay so um i just finished with dorothy it was a pretty normal "
        "shift she was good today um we did her bath she was cooperative "
        "she ate most of her lunch she left the vegetables. she did mention "
        "her back is bothering her more than usual. i helped her to her "
        "chair and back. her daughter stopped by which cheered her up.",
    ),
    (
        "George",
        "Really difficult shift. George refused his morning medication "
        "again, this is the third time this week. The apartment is getting "
        "worse - dishes in the sink with mold, I cleaned what I could. I "
        "noticed the stove burner was on when I arrived, low flame, turned "
        "it off immediately. He was resistant to my help today.",
    ),
    (
        "Harold",
        "Hi this is my first time covering for Maria. Harold seemed "
        "surprised to see me and asked where Maria was. He was polite but "
        "clearly not comfortable yet. I helped with his morning routine, he "
        "guided me on his preferences which was helpful. Lots of pill "
        "bottles on the counter, I wasn't sure which ones he'd already "
        "taken so I flagged this for the coordinator.",
    ),
]


async def _get_or_create_agency(db) -> Agency:
    agency = (
        await db.execute(select(Agency).where(Agency.slug == "sunrise-home-care"))
    ).scalar_one_or_none()
    if agency is None:
        agency = Agency(
            name="Sunrise Home Care",
            slug="sunrise-home-care",
            timezone="America/Los_Angeles",
        )
        db.add(agency)
        await db.flush()
    # Seed default shift templates (idempotent).
    from app.api.v1.shift_templates import seed_default_templates  # noqa: WPS433

    await seed_default_templates(db, agency.id)
    return agency


async def _get_or_create_user(db, agency_id, role, email, first, last) -> User:
    u = (
        await db.execute(select(User).where(User.email == email))
    ).scalar_one_or_none()
    if u is None:
        u = User(
            agency_id=agency_id,
            email=email,
            first_name=first,
            last_name=last,
            role=role,
            status="active",
            password_hash=hash_password(PASSWORD),
        )
        db.add(u)
        await db.flush()
    return u


async def _get_or_create_client(db, agency_id, spec: dict[str, Any]) -> Client:
    c = (
        await db.execute(
            select(Client)
            .where(Client.agency_id == agency_id)
            .where(Client.first_name == spec["first_name"])
            .where(Client.last_name == spec["last_name"])
        )
    ).scalar_one_or_none()
    if c is None:
        c = Client(agency_id=agency_id, **spec)
        db.add(c)
        await db.flush()
    return c


async def main() -> int:
    async with SessionLocal() as db:
        agency = await _get_or_create_agency(db)
        users: dict[str, User] = {}
        for role, email, first, last in USERS_SPEC:
            u = await _get_or_create_user(db, agency.id, role, email, first, last)
            users[email] = u

        clients: list[Client] = []
        for spec in CLIENTS_SPEC:
            clients.append(await _get_or_create_client(db, agency.id, spec))
        await db.commit()

    caregivers = [
        u for email, u in users.items() if u.role == "caregiver"
    ]

    # Distribution requirements (per latest seed spec):
    #   caregiver1 (Maria):  3+ shifts total, 2 of them dated today
    #   caregiver2 (James):  2+ shifts total, 1 dated today
    #   caregiver3 (Aisha):  1+ shift dated today
    # Past + future shifts round out the dataset for handoff history,
    # continuity scoring, and dashboard widgets.
    now = datetime.now(timezone.utc)
    today_at = lambda h: now.replace(hour=h, minute=0, second=0, microsecond=0)

    shifts_to_seed = [
        # — Past completed (drives handoff history + recent submissions). —
        (clients[3], caregivers[0], now - timedelta(days=2, hours=4), "completed"),
        (clients[4], caregivers[1], now - timedelta(days=1, hours=8), "completed"),
        (clients[2], caregivers[2], now - timedelta(days=1, hours=4), "completed"),
        (clients[2], caregivers[0], now - timedelta(days=3, hours=2), "completed"),
        (clients[0], caregivers[2], now - timedelta(hours=20), "completed"),
        # — Today's shifts. caregiver1 has TWO; caregiver2 and 3 have ONE each. —
        (clients[0], caregivers[0], today_at(8), "in_progress"),
        (clients[1], caregivers[0], today_at(14), "scheduled"),
        (clients[2], caregivers[1], today_at(10), "in_progress"),
        (clients[4], caregivers[2], today_at(18), "scheduled"),
        # — Future scheduled shifts (Shifts page on +1 day, etc.). —
        (clients[3], caregivers[1], now + timedelta(days=1), "scheduled"),
        (clients[1], caregivers[2], now + timedelta(days=1, hours=6), "scheduled"),
    ]

    seeded_shifts: list[Shift] = []
    async with SessionLocal() as db:
        for client, caregiver, start, status_val in shifts_to_seed:
            existing = (
                await db.execute(
                    select(Shift)
                    .where(Shift.agency_id == agency.id)
                    .where(Shift.client_id == client.id)
                    .where(Shift.caregiver_id == caregiver.id)
                    .where(Shift.scheduled_start == start)
                )
            ).scalar_one_or_none()
            if existing is not None:
                seeded_shifts.append(existing)
                continue
            s = Shift(
                agency_id=agency.id,
                client_id=client.id,
                caregiver_id=caregiver.id,
                scheduled_start=start,
                scheduled_end=start + timedelta(hours=4),
                status=status_val,
            )
            db.add(s)
            await db.flush()
            seeded_shifts.append(s)
        await db.commit()

    # Submit 6 handoff notes against the first 6 (mix of past + today).
    note_ids: list[uuid.UUID] = []
    notes_lookup = {n[0]: n[1] for n in SYNTHETIC_NOTES}
    async with SessionLocal() as db:
        for shift in seeded_shifts[:6]:
            client = next(c for c in clients if c.id == shift.client_id)
            note_text = notes_lookup.get(
                client.preferred_name or client.first_name,
                "Routine shift, all went well.",
            )
            already = (
                await db.execute(
                    select(ShiftNoteRaw).where(ShiftNoteRaw.shift_id == shift.id)
                )
            ).scalar_one_or_none()
            if already is not None:
                continue
            note = ShiftNoteRaw(
                shift_id=shift.id,
                agency_id=agency.id,
                input_type="text",
                raw_text=note_text,
                word_count=len(note_text.split()),
            )
            db.add(note)
            await db.flush()
            note_ids.append(note.id)
        await db.commit()

    # Run the pipeline directly so the seed produces real handoffs + flags.
    for nid in note_ids:
        await run_pipeline(nid)

    # Open continuity events
    async with SessionLocal() as db:
        for spec in (
            {
                "client_id": clients[1].id,
                "category": "shift_at_risk",
                "description": "Eleanor's regular caregiver called out for tomorrow's morning shift.",
                "severity": "high",
            },
            {
                "client_id": clients[4].id,
                "category": "supervisor_follow_up_needed",
                "description": "George refused medication for the third time this week — supervisor visit pending.",
                "severity": "high",
            },
        ):
            existing = (
                await db.execute(
                    select(ContinuityEvent)
                    .where(ContinuityEvent.agency_id == agency.id)
                    .where(ContinuityEvent.category == spec["category"])
                    .where(ContinuityEvent.client_id == spec["client_id"])
                )
            ).scalar_one_or_none()
            if existing is not None:
                continue
            db.add(
                ContinuityEvent(
                    agency_id=agency.id,
                    client_id=spec["client_id"],
                    category=spec["category"],
                    description=spec["description"],
                    severity=spec["severity"],
                    status="open",
                )
            )
        await db.commit()

    print("=" * 70)
    print(f"Seed complete. Agency ID: {agency.id}")
    print("=" * 70)
    print(f"  Agency:       {agency.name} ({agency.slug})")
    print(f"  Users:        {len(USERS_SPEC)}  (password: {PASSWORD})")
    print(f"  Clients:      {len(clients)}")
    print(f"  Shifts:       {len(seeded_shifts)}")
    print(f"  Handoffs run: {len(note_ids)}")
    print()
    print("Sign in URLs:")
    print("  Coordinator:  http://localhost:3000/auth/sign-in  (coordinator@sunrisecare.com)")
    print("  Caregiver:    http://localhost:3000/auth/sign-in  (caregiver1@sunrisecare.com)")
    print("=" * 70)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
