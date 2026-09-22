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

/** The merged, normalised list. Duplicates dropped, empties dropped. */
export function clubGuests(
  env: string | undefined = process.env.CLUB_GUESTS
): string[] {
  const fromEnv = (env || '').split(',').map(normalizeGuest)
  return [...new Set([...DEFAULT_GUESTS, ...fromEnv].filter(Boolean))]
}

/** Is this person on the list -- by verified @username or by telegram id? */
export function isClubGuest(
  who: { telegramId: string; username: string | null },
  list: string[] = clubGuests()
): boolean {
  const id = String(who.telegramId ?? '').trim()
  const name = normalizeGuest(who.username ?? '')
  return list.some(g => (name && g === name) || (id && g === id))
}
