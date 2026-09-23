/**
 * A PROFILE IS FOR THE CLUB. SOMEBODY'S OWN PROFILE IS ALWAYS FOR THEM.
 *
 * Owner, 2026-09-23: "profiles must be visible only to registered club
 * members!! by payment!".
 *
 * Until now `/api/users/:username` and its templates answered anybody who
 * knew the name -- no signature, no session (render-server.ts, the two GET
 * handlers this module is called from). The only thing that was ever enforced
 * there was `is_public === false`.
 *
 * THE RULE, in the order it is checked:
 *   1. No name asked for, no answer to give -- not this module's business.
 *   2. The person asking IS the profile: always through. A paywall in front
 *      of somebody's own page would be a bug, not a policy.
 *   3. An active club month, or a grant that stands in for one (owner of a
 *      bot, keeper, guest pass): through. This is exactly `clubStatus().active`
 *      -- one definition of membership for the whole product, so a profile
 *      cannot disagree with what /api/club/status told the same person a
 *      second earlier.
 *   4. Everyone else: `club_only`. NOT 401, and the difference matters: the
 *      caller may be perfectly well identified and simply not a member, and
 *      an app that reads 401 as "sign in again" would send a member round a
 *      sign-in loop that changes nothing.
 *
 * WHAT IS DELIBERATELY NOT CLOSED HERE:
 *   - SOUL.md (`/api/soul/:username`). The owner's recorded decision, twice
 *     in this codebase (render-server.ts above the handler, auth.ts:400):
 *     people and a2a agents find each other by it, and a closed SOUL connects
 *     nobody. Closing it is one line in the caller, not a change here.
 *   - The feed. A reel is the shop window; the profile behind it is the club.
 *
 * COST: one `clubStatus` call, which is `ensureClubTables` (memoised) plus a
 * single `SELECT ... FROM club_period`, plus -- only when a grant is asked
 * for -- one HTTP call to look up bots owned. That is why `grant` is passed
 * in already resolved by the caller when it has one: this module never
 * fetches on its own.
 */

import {
  clubStatus,
  type ClubAccess,
  type ClubGrant,
} from '../agent/club-membership'

export type ProfileVerdict =
  | { allowed: true; reason: 'own' | 'member' }
  | { allowed: false; reason: 'club_only' }

export interface ProfileViewInput {
  /** Who is asking, as proved by a signature, a session or an agent key. */
  viewerTelegramId: string | null | undefined
  /** Whose profile it is. */
  ownerTelegramId: string | null | undefined
  /** Anything with `.query`, i.e. the pool. */
  pool: Parameters<typeof clubStatus>[0]
  /** A grant the caller already resolved, if it did. */
  access?: ClubGrant | ClubAccess
  now?: Date
}

export async function mayViewProfile(
  input: ProfileViewInput
): Promise<ProfileVerdict> {
  const viewer = String(input.viewerTelegramId ?? '').trim()
  const owner = String(input.ownerTelegramId ?? '').trim()

  // Somebody's own profile is theirs, signed in or not yet a member.
  if (viewer && owner && viewer === owner) {
    return { allowed: true, reason: 'own' }
  }

  // Nobody is asking as anybody: there is no membership to read.
  if (!viewer) return { allowed: false, reason: 'club_only' }

  const status = await clubStatus(
    input.pool,
    viewer,
    input.now ?? new Date(),
    input.access ?? null
  )
  return status.active
    ? { allowed: true, reason: 'member' }
    : { allowed: false, reason: 'club_only' }
}

/** What a non-member is told, in both languages, with the way in. */
export const CLUB_ONLY_BODY = {
  error: 'club_only',
  detail:
    'Профили открыты участникам клуба. Оплаченный месяц или пропуск — и профиль откроется.',
  detail_en:
    'Profiles are open to club members. A paid month or a pass opens them.',
  join: '/api/club/status',
} as const

export const CLUB_ONLY_STATUS = 403
