/**
 * THE GUEST PASS -- PEOPLE THE OWNER LETS INTO THE CLUB BY NAME.
 *
 * Owner, 2026-09-12: "give @dmtrled and @SamHold access to the digital
 * avatar setup". The setup lives behind the welcome road (value -> how ->
 * CLUB -> connect -> SOUL): nobody reaches the Telegram sign-in and the
 * SOUL slide without a paid month or a grant. Grants so far came from two
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
 * signature (auth.ts verifiedTelegramUsername), never from the body.
 */
export const DEFAULT_GUESTS: readonly string[] = ['dmtrled', 'samhold']

export function normalizeGuest(raw: string): string {
  return String(raw ?? '').trim().replace(/^@/, '').toLowerCase()
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
