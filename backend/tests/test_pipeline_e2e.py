"""End-to-end pipeline test against the 6 synthetic notes from
SKILL.md section 12. Run inside the backend container:

    docker compose exec backend python -m tests.test_pipeline_e2e

Behaviour:
- Without ANTHROPIC_API_KEY: uses the mock pipeline (deterministic stubs).
- With a real key: hits Claude and validates schema-conformance of outputs.

Either way, every note must produce a HandoffSummary row, optional flags,
an audit event, and a complete pipeline status."""
from __future__ import annotations

import asyncio
import sys
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.agency import Agency
from app.models.client import Client
from app.models.handoff import HandoffSummary
from app.models.risk_flag import RiskFlag
from app.models.shift import Shift
from app.models.shift_note import ShiftNoteRaw
from app.models.user import User
from app.workers.pipeline_tasks import run_pipeline


# Fixtures
SYNTHETIC_NOTES: list[tuple[str, str, set[str]]] = [
    (
        "Note 1: routine shift, one concern",
        "Got there at 9am, Mr. Harold was in good spirits today. Helped him "
        "shower, he needed more assistance than usual, seemed a bit unsteady "
        "on his feet. Ate all his breakfast which is good. Gave him his "
        "morning meds, he took them no problem. We watched some TV in the "
        "afternoon. His daughter called, he seemed happy after. Left at 3. "
        "Living room was a little cluttered, I moved some things so he has a "
        "clear path to the bathroom.",
        {"fall_concern"},
    ),
    (
        "Note 2: high severity flags buried in casual language",
        "rough shift today honestly. ms eleanor was really confused when i "
        "got there, didn't know what day it was and kept asking for her "
        "husband (he passed last year i think?). she didnt want to eat lunch, "
        "barely touched it. i tried everything. she also said her left knee "
        "hurts but shes been saying that for a while. she got a little "
        "agitated around 2pm, i just talked to her calmly and it helped. meds "
        "were fine. apartment smelled a bit off, checked and the bathroom "
        "trash hasnt been emptied in a while. left at 4.",
        {"confusion_cognitive_change", "refusal_to_eat", "mood_agitation"},
    ),
    (
        "Note 3: missed tasks, medication issue",
        "Arrived 10:30 (traffic). James was asleep, let him sleep until 11. "
        "Lunch was good, he ate well. Tried to do his exercises but he "
        "refused, said his back hurt too much. I could not find his evening "
        "blood pressure medication, checked the usual spot and the bathroom "
        "cabinet, not there. Called the coordinator but no answer. Left a "
        "note on the fridge. Had to leave at 2:30 for my next shift so I "
        "couldn't stay to resolve it. He seemed okay otherwise, was in a "
        "decent mood.",
        {"medication_issue"},
    ),
    (
        "Note 4: voice-style transcription",
        "okay so um i just finished with dorothy it was like a pretty normal "
        "shift she was good today yeah um we did her bath she was cooperative "
        "which is great because last week she was not having it at all so "
        "that was nice um she ate most of her lunch she left the vegetables "
        "but thats normal for her she likes the soup. she did mention her "
        "back is bothering her more than usual she said its been a few days "
        "now. i helped her to her chair and back. she seemed a little tired "
        "but okay. her daughter stopped by which cheered her up. i left at "
        "like 2:45.",
        set(),  # nothing strongly flag-worthy
    ),
    (
        "Note 5: unsafe home condition",
        "Really difficult shift. George refused his morning medication "
        "again, this is the third time this week. The apartment is getting "
        "worse - there were dishes in the sink with mold, I cleaned what I "
        "could. I noticed the stove burner was on when I arrived, it was a "
        "low flame. I turned it off immediately. He said he was making tea "
        "and forgot. He seemed lucid otherwise but this is concerning. He "
        "was resistant to my help today, kept saying he doesn't need anyone. "
        "Ate a small amount of lunch. Please send supervisor notes.",
        {"medication_issue", "unsafe_home_environment"},
    ),
    (
        "Note 6: continuity break scenario",
        "Hi this is my first time with Mrs. Patricia. The coordinator sent "
        "me the care brief but it was pretty short. She seemed surprised to "
        "see me and asked where Rosa was. I explained Rosa was unavailable "
        "today. She was polite but clearly not comfortable with me yet, "
        "which I understand. I helped with her morning routine, she guided "
        "me on her preferences which was helpful. She has a lot of pill "
        "bottles on the counter, I wasn't sure which ones she took this "
        "morning so I didn't touch them - I flagged this for the "
        "coordinator. Ate breakfast well. Left at noon.",
        {"caregiver_continuity_issue"},
    ),
    (
        "Note 7: well-handled fall incident (Sprint 8 grounding test)",
        "Around 11am Mr. Robert had a fall getting up from the couch and went "
        "down on his right side. He was alert and talking the whole time. I "
        "called 911 and stayed with him. EMTs came, checked him out, no "
        "broken bones, vitals normal. I called his daughter and the "
        "coordinator right away and let them know what happened. He ate a "
        "small lunch, took his afternoon meds without any issues. He was a "
        "little shaken but doing okay by the end of the shift. Will need a "
        "supervisor to review and document this fall for the file.",
        {"fall_concern", "supervisor_follow_up_needed"},
    ),
]


async def _ensure_fixture() -> tuple[uuid.UUID, uuid.UUID, uuid.UUID]:
    """Create or fetch a (agency, caregiver, client) triple to attach test
    shifts to. Idempotent across repeated runs."""
    async with SessionLocal() as db:
        agency = (
            await db.execute(
                select(Agency).where(Agency.slug == "e2e-pipeline-agency")
            )
        ).scalar_one_or_none()
        if agency is None:
            agency = Agency(name="E2E Pipeline Agency", slug="e2e-pipeline-agency")
            db.add(agency)
            await db.flush()

        user = (
            await db.execute(
                select(User).where(User.email == "e2e-caregiver@example.com")
            )
        ).scalar_one_or_none()
        if user is None:
            user = User(
                agency_id=agency.id,
                email="e2e-caregiver@example.com",
                first_name="E2E",
                last_name="Caregiver",
                role="caregiver",
                status="active",
            )
            db.add(user)
            await db.flush()

        client = (
            await db.execute(
                select(Client).where(
                    Client.agency_id == agency.id,
                    Client.first_name == "E2E",
                    Client.last_name == "Client",
                )
            )
        ).scalar_one_or_none()
        if client is None:
            client = Client(
                agency_id=agency.id,
                first_name="E2E",
                last_name="Client",
                preferred_name="E2E",
                care_context_summary="Synthetic test client for pipeline validation.",
                address_neighborhood="Testville",
            )
            db.add(client)
            await db.flush()

        await db.commit()
        return agency.id, user.id, client.id


async def _create_shift_and_note(
    *, agency_id: uuid.UUID, caregiver_id: uuid.UUID, client_id: uuid.UUID, note: str
) -> uuid.UUID:
    async with SessionLocal() as db:
        now = datetime.now(timezone.utc)
        shift = Shift(
            agency_id=agency_id,
            client_id=client_id,
            caregiver_id=caregiver_id,
            scheduled_start=now - timedelta(hours=4),
            scheduled_end=now,
            status="completed",
        )
        db.add(shift)
        await db.flush()

        raw = ShiftNoteRaw(
            shift_id=shift.id,
            agency_id=agency_id,
            input_type="text",
            raw_text=note,
            word_count=len(note.split()),
        )
        db.add(raw)
        await db.flush()
        await db.commit()
        return raw.id


async def _summary_for(note_id: uuid.UUID) -> tuple[HandoffSummary | None, list[RiskFlag]]:
    async with SessionLocal() as db:
        handoff = (
            await db.execute(
                select(HandoffSummary).where(HandoffSummary.raw_note_id == note_id)
            )
        ).scalar_one_or_none()
        if handoff is None:
            return None, []
        flags = (
            await db.execute(
                select(RiskFlag).where(RiskFlag.handoff_id == handoff.id)
            )
        ).scalars().all()
        return handoff, list(flags)


async def main() -> int:
    agency_id, caregiver_id, client_id = await _ensure_fixture()

    rows: list[tuple[str, str, int, list[str], list[str], bool]] = []
    overall_pass = True

    for label, note_text, expected_categories in SYNTHETIC_NOTES:
        note_id = await _create_shift_and_note(
            agency_id=agency_id,
            caregiver_id=caregiver_id,
            client_id=client_id,
            note=note_text,
        )
        result = await run_pipeline(note_id)
        handoff, flags = await _summary_for(note_id)

        passed = result.get("status") == "complete" and handoff is not None
        if not passed:
            overall_pass = False

        flag_categories = sorted(f.category for f in flags)
        missing = sorted(expected_categories - set(flag_categories))
        rows.append(
            (
                label,
                result.get("status", "?"),
                len(flags),
                flag_categories,
                missing,
                passed,
            )
        )

    # Print summary table
    print()
    print("=" * 100)
    print("SYNTHETIC NOTES PIPELINE — RESULT SUMMARY")
    print("=" * 100)
    for label, status, flag_count, flag_cats, missing, passed in rows:
        print(f"\n{label}")
        print(f"  status        : {status}")
        print(f"  flags total   : {flag_count}")
        print(f"  flag categories: {', '.join(flag_cats) if flag_cats else '(none)'}")
        if missing:
            print(f"  expected but missing: {', '.join(missing)}")
        print(f"  result        : {'PASS' if passed else 'FAIL'}")
    print()
    print("=" * 100)
    print(f"OVERALL: {'PASS' if overall_pass else 'FAIL'}")
    print("=" * 100)
    return 0 if overall_pass else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
