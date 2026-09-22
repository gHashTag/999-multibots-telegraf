/**
 * THE GUEST PASS -- PEOPLE THE OWNER LETS INTO THE CLUB BY NAME.
 *
 * Owner, 2026-09-12: give two people, named by their Telegram usernames,
 * access to the digital avatar setup. The setup lives behind the welcome
 * road (value -> how -> CLUB -> connect -> SOUL): nobody reaches the
 * Telegram sign-in and the SOUL slide without a paid month or a grant. Grants so far came from two
 * facts only -- bots in `avatars`, or the keepers list -- and neither
 * describes "a person the owner invited".
 *
 * So: a list of @usernames (or telegram ids). Two sources, merged:
 *   - CLUB_GUESTS in the environment, comma-separated, edited without a
 *     deploy;
 *   - DEFAULT_GUESTS here, so the owner's spoken invitation is in the
 *     repository, reviewable, and survives a lost variable.
 * Names are matched case-insensitively and without the "@"; a name can
 * change, so an id is accepted too and is matched exactly.
 *
 * What the pass gives: the club is open (`granted: 'guest'`), the road
 * starts at the Telegram step. What it does NOT give: the monthly tokens
 * that owners and keepers receive -- an invitation to set up an avatar is
 * not a budget. That is decided in handleClub, not here.
 *
 * Which identity is checked: the @username from the VERIFIED Mini App
 * signature (auth.ts verifiedTelegramUsername), never from the body -- or,
 * when that signature carries no name because the person did not come through
 * the Mini App, the name we ourselves recorded for their ALREADY-VERIFIED id.
 *
 * AN INVITATION WRITTEN AS A NAME WAS UNREADABLE OUTSIDE TELEGRAM.
 *
 * Measured 2026-09-21. An invited guest was on this list from the day it
 * was written and still met the 10 000-star paywall on step 3 of 7 -- because
 * he opened the app in a desktop browser. There `verifiedTelegramUsername`
 * reads `x-telegram-init-data`, that header does not exist outside the Mini
 * App, the name came back null, and a list of names matched nothing. His id
 * was verified the whole time; nobody asked it for a name.
 *
 * So an id is listed beside every name from now on. An id is the one
 * identifier every sign-in path knows, it cannot be renamed away, and it needs
 * no lookup at all. The names stay because the owner invites people by name.
 *
 * WHERE THE IDS LIVE NOW (#2752). This repository is public, and an id is a
 * real person. Two of them sat in the list below because the alternative was
 * worse: CLUB_GUESTS was empty on the render service (measured 2026-09-21,
 * #2744), so deleting them would have put two invited guests back behind the
 * paywall. That is no longer true -- every invited id is in CLUB_GUESTS on
 * vibee-render, verified against production on 2026-09-22 -- so the ids are
 * gone from here, together with the exception that excused them in
 * no-dossier-in-the-agent-tree.test.ts.
 *
 * What stays is the names, and only the names: they are what the owner speaks
 * when he invites someone, and they keep working for a Mini App sign-in even
 * if the variable is ever lost.
 *
 * This is the guest pass, not the whole sweep. The same two ids are still
 * written in one-off money scripts (scripts/money/), in an architecture note
 * and in a player comment -- outside this tree and outside the guard. #2752
 * covers them; this change covers the list that decides who gets in.
 *
 * A PASS CAN END (2026-09-22). Until now an invitation was forever: the only
 * way to take it back was to edit the variable on the right day. The owner
 * wants to let warm people try the club for a while, so an entry may carry an
 * end date after a second "@":
 *
 *     CLUB_GUESTS=anna@2026-09-29,900000011@2026-10-01,samhold
 *
 * `anna@2026-09-29` is a guest until 2026-09-29 00:00 UTC and not a second
 * later -- the date is the moment the pass ends, which is also the date the
 * person is shown ("your invitation ended on 29 September"). A bare entry
 * stays forever, exactly as before. The date is read strictly (YYYY-MM-DD, a
 * real calendar day): an entry whose date cannot be read is SKIPPED and
 * logged by its position in the variable, never by its text (the text is a
 * person), and never stops the others -- a typo must not lock every invited
 * person out, and it must not quietly turn into "forever" either.
 *
 * One person may appear more than once: a bare entry wins (forever), and
 * among dated entries the latest end wins. The decision -- guest, expired,
 * or not on the list -- is made in ONE place, `guestPassFor`, and every
 * membership check reaches it through club-membership.ts `clubAccessFor`.
 */
export const DEFAULT_GUESTS: readonly string[] = [
  'dmtrled',
  'samhold',
  'farishka',
]

export function normalizeGuest(raw: string): string {
  return String(raw ?? '')
    .trim()
    .replace(/^@/, '')
    .toLowerCase()
}

/**
 * A day written as YYYY-MM-DD, as the UTC midnight that starts it -- or null.
 * Strict on purpose: `2026-9-29`, `2026-02-30` and `2026-09-29T10:00` are not
 * days, and a guessed date on a pass is a guessed end of somebody's access.
 */
export function parseDay(raw: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(raw ?? '').trim())
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const t = new Date(Date.UTC(y, mo - 1, d))
  // Date.UTC rolls 2026-02-30 over into March and maps years below 100 onto
  // the 1900s; reading the parts back refuses both.
  if (
    t.getUTCFullYear() !== y ||
    t.getUTCMonth() !== mo - 1 ||
    t.getUTCDate() !== d
  )
    return null
  return t
}

/** One entry of the list: who, and the moment the pass ends (null = never). */
export interface GuestEntry {
  who: string
  ends: Date | null
}

/**
 * Read one entry. `null` = an empty slot (",,"), nothing to say about it;
 * `{ ok: false }` = an entry that cannot be read, with the reason (never the
 * text); `{ ok: true }` = a pass.
 */
export function parseGuestEntry(
  raw: string
): { ok: true; entry: GuestEntry } | { ok: false; why: string } | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  // The LAST "@" separates the date: a leading "@" belongs to the username
  // ("@anna", "@anna@2026-09-29"), and a username never contains one.
  const at = s.lastIndexOf('@')
  if (at <= 0)
    return { ok: true, entry: { who: normalizeGuest(s), ends: null } }
  const who = normalizeGuest(s.slice(0, at))
  if (!who) return { ok: false, why: 'no name or id before the date' }
  const ends = parseDay(s.slice(at + 1))
  if (!ends) {
    return { ok: false, why: 'the end date is not a real YYYY-MM-DD day' }
  }
  return { ok: true, entry: { who, ends } }
}

function formatGuestEntry(e: GuestEntry): string {
  return e.ends ? `${e.who}@${e.ends.toISOString().slice(0, 10)}` : e.who
}

/** The variable value whose skipped entries were last reported by default. */
let reportedFor: string | undefined

/**
 * The merged, normalised list. Duplicates dropped, empties dropped, entries
 * with an unreadable end date dropped and reported by position.
 *
 * `warn` receives one line per skipped entry. Without it the lines go to the
 * console once per value of the variable: this runs on every club request, and
 * the same typo reported a thousand times an hour hides the next one.
 */
export function clubGuests(
  env: string | undefined = process.env.CLUB_GUESTS,
  warn?: (line: string) => void
): string[] {
  const fromEnv: string[] = []
  const skipped: string[] = []
  ;(env || '').split(',').forEach((raw, i) => {
    const p = parseGuestEntry(raw)
    if (!p) return
    if (!p.ok) {
      skipped.push(`[club] CLUB_GUESTS entry ${i + 1} skipped: ${p.why}`)
      return
    }
    fromEnv.push(formatGuestEntry(p.entry))
  })
  if (skipped.length) {
    if (warn) skipped.forEach(line => warn(line))
    else if (reportedFor !== env) {
      reportedFor = env
      skipped.forEach(line => console.warn(line))
    }
  }
  return [...new Set([...DEFAULT_GUESTS, ...fromEnv].filter(Boolean))]
}

/**
 * What the list says about one person at `now`:
 *   - `guest`   -- in, until `until` (ISO), or with no end (`until: null`);
 *   - `expired` -- was invited, the last pass ended at `endedOn` (ISO);
 *   - `none`    -- not on the list at all.
 *
 * THE one guest decision. The boundary is the end date's UTC midnight: at
 * 23:59:59.999 the day before, a guest; at 00:00:00.000, not.
 */
export type GuestPass =
  | { kind: 'guest'; until: string | null }
  | { kind: 'expired'; endedOn: string }
  | { kind: 'none' }

export function guestPassFor(
  who: { telegramId: string; username: string | null },
  list: readonly string[] = clubGuests(),
  now: Date = new Date()
): GuestPass {
  const id = String(who.telegramId ?? '').trim()
  const name = normalizeGuest(who.username ?? '')
  let latest: Date | null = null
  for (const raw of list) {
    const p = parseGuestEntry(raw)
    if (!p || !p.ok) continue
    const e = p.entry
    if (!((name && e.who === name) || (id && e.who === id))) continue
    if (!e.ends) return { kind: 'guest', until: null }
    if (!latest || e.ends.getTime() > latest.getTime()) latest = e.ends
  }
  if (!latest) return { kind: 'none' }
  return now.getTime() < latest.getTime()
    ? { kind: 'guest', until: latest.toISOString() }
    : { kind: 'expired', endedOn: latest.toISOString() }
}

/** Is this person a guest right now -- by verified @username or by telegram id? */
export function isClubGuest(
  who: { telegramId: string; username: string | null },
  list: readonly string[] = clubGuests(),
  now: Date = new Date()
): boolean {
  return guestPassFor(who, list, now).kind === 'guest'
}
