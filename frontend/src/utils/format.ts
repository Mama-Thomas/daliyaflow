// All times are stored in UTC and displayed in Pacific time. The browser's
// local timezone is intentionally ignored — coordinators and caregivers
// reading the same handoff should see the same wall-clock time regardless
// of where they're sitting. PST/PDT switching is handled automatically by
// the IANA database via 'America/Los_Angeles'.
export const DISPLAY_TIME_ZONE = 'America/Los_Angeles';

function ptHour(date: Date): number {
  // Use Intl to extract the hour in Pacific time without a shifting
  // user-locale dependency.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DISPLAY_TIME_ZONE,
    hour12: false,
    hour: 'numeric',
  }).formatToParts(date);
  const h = parts.find((p) => p.type === 'hour')?.value ?? '0';
  // 'en-US' with hour12: false sometimes yields '24' for midnight; clamp.
  const n = Number.parseInt(h, 10);
  return Number.isFinite(n) ? n % 24 : 0;
}

export function timeOfDayGreeting(date = new Date()): string {
  const h = ptHour(date);
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function formatTimeRange(startISO: string, endISO: string): string {
  const start = new Date(startISO);
  const end = new Date(endISO);
  const fmt = (d: Date) =>
    d.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: DISPLAY_TIME_ZONE,
    });
  return `${fmt(start)} — ${fmt(end)}`;
}

export function relativeTime(iso: string, now = new Date()): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, now.getTime() - then);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}

export function clientShortName(first: string, last: string): string {
  return `${first} ${last?.[0] ?? ''}${last ? '.' : ''}`.trim();
}

export function formatCategory(c: string): string {
  return c
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

export function todayISODate(): string {
  // Internal date-key for talking to the API. Intentionally UTC — the
  // backend filters shifts by UTC day. Display formatting elsewhere uses
  // DISPLAY_TIME_ZONE.
  return new Date().toISOString().slice(0, 10);
}

/**
 * Today's date in Pacific time as a YYYY-MM-DD string. Use this when
 * defaulting a `<input type="date">` field that the user thinks of as
 * a Pacific calendar date — not for talking to the backend.
 */
export function todayPtIsoDate(d = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: DISPLAY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${day}`;
}

export function fullDate(d = new Date()): string {
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: DISPLAY_TIME_ZONE,
  });
}

/**
 * Compute the IANA "longOffset" string (e.g. "-07:00", "-08:00") that
 * America/Los_Angeles uses at the given wall-clock moment. Used to
 * convert PT-typed inputs into a correct UTC instant.
 *
 * The trick: build a "naïve UTC" Date with the same calendar year/month/
 * day/hour/minute the user typed, then ask Intl what offset PT has at
 * that real-time instant. For any non-DST-transition moment the offset
 * we get back is the same one that applies to the PT wall time the user
 * meant. (DST transitions are ambiguous by definition; we accept
 * whichever side Intl picks.)
 */
function ptOffsetForWallTime(yyyymmdd: string, hhmm: string): string {
  const naiveUtc = new Date(`${yyyymmdd}T${hhmm}:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DISPLAY_TIME_ZONE,
    timeZoneName: 'longOffset',
  }).formatToParts(naiveUtc);
  const tz = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-08:00';
  const m = tz.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  return m ? `${m[1]}${m[2]}:${m[3] ?? '00'}` : '-08:00';
}

/**
 * Convert a (date string, time string) pair entered in Pacific time into
 * a UTC ISO timestamp suitable for posting to the backend. Handles
 * PST/PDT correctly via the IANA database.
 *
 *   ptWallTimeToUtcIso('2026-08-15', '09:00') → '2026-08-15T16:00:00.000Z' (PDT)
 *   ptWallTimeToUtcIso('2026-12-15', '09:00') → '2026-12-15T17:00:00.000Z' (PST)
 */
export function ptWallTimeToUtcIso(yyyymmdd: string, hhmm: string): string {
  const offset = ptOffsetForWallTime(yyyymmdd, hhmm);
  return new Date(`${yyyymmdd}T${hhmm}:00${offset}`).toISOString();
}

/**
 * Format a YYYY-MM-DD date string for display without a timezone shift.
 *
 * `new Date('2026-05-07')` parses as UTC midnight, so a naive
 * `toLocaleDateString({ timeZone: 'America/Los_Angeles' })` would render
 * "May 6, 2026" because UTC midnight is 5 PM the previous day in PT. This
 * helper anchors the date at noon UTC, which still falls on the same
 * calendar date in any US timezone.
 */
export function formatYmdAsDate(yyyymmdd: string): string {
  const d = new Date(`${yyyymmdd}T12:00:00Z`);
  return d.toLocaleDateString(undefined, {
    timeZone: DISPLAY_TIME_ZONE,
  });
}
