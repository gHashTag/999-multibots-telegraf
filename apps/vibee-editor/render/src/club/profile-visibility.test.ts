import { describe, expect, it, vi } from 'vitest'
import {
  CLUB_ONLY_BODY,
  CLUB_ONLY_STATUS,
  mayViewProfile,
} from './profile-visibility'

/**
 * WHO MAY SEE SOMEBODY ELSE'S PROFILE.
 *
 * Owner, 2026-09-23: profiles are for the club, by payment. The cases below
 * are the ones that decide whether that rule is a rule or a wall in front of
 * the wrong people: the person themselves, a member, a guest pass, a signed-in
 * stranger, and somebody nobody can name.
 */

/** A pool that answers club_period with one row, or none. */
function poolWith(until: string | null) {
  return {
    query: vi.fn(async (sql: string) => {
      if (/club_period/i.test(sql)) {
        return until
          ? {
              rows: [
                { paid_at: '2026-09-01', until, star_tx_id: 'tx', periods: 1 },
              ],
            }
          : { rows: [] }
      }
      // ensureClubTables and anything else: nothing to answer with.
      return { rows: [] }
    }),
  } as never
}

const FUTURE = '2026-12-01T00:00:00.000Z'
const PAST = '2026-01-01T00:00:00.000Z'
const NOW = new Date('2026-09-23T12:00:00.000Z')

describe('who may see somebody else’s profile', () => {
  it('lets a person see their own profile, member or not', async () => {
    // The one case a paywall must never touch. A person who has not paid
    // still has to reach their own page -- that is where the club is sold.
    const verdict = await mayViewProfile({
      viewerTelegramId: '27',
      ownerTelegramId: '27',
      pool: poolWith(null),
      now: NOW,
    })
    expect(verdict).toEqual({ allowed: true, reason: 'own' })
  })

  it('lets a member see anybody', async () => {
    const verdict = await mayViewProfile({
      viewerTelegramId: '1',
      ownerTelegramId: '2',
      pool: poolWith(FUTURE),
      now: NOW,
    })
    expect(verdict).toEqual({ allowed: true, reason: 'member' })
  })

  it('refuses a signed-in person whose month has run out', async () => {
    // Identified, known, and not a member. This is the case that must NOT be
    // answered with 401: the sign-in is fine, the membership is not.
    const verdict = await mayViewProfile({
      viewerTelegramId: '1',
      ownerTelegramId: '2',
      pool: poolWith(PAST),
      now: NOW,
    })
    expect(verdict).toEqual({ allowed: false, reason: 'club_only' })
    expect(CLUB_ONLY_STATUS).toBe(403)
    expect(CLUB_ONLY_BODY.error).toBe('club_only')
  })

  it('refuses somebody nobody can name, without asking the database', async () => {
    const pool = poolWith(FUTURE)
    const verdict = await mayViewProfile({
      viewerTelegramId: null,
      ownerTelegramId: '2',
      pool,
      now: NOW,
    })
    expect(verdict).toEqual({ allowed: false, reason: 'club_only' })
    // A page nobody may see is not worth a query per visit: this is the
    // common case for a crawler and for every link opened while signed out.
    expect(
      (pool as unknown as { query: { mock: { calls: unknown[] } } }).query.mock
        .calls
    ).toHaveLength(0)
  })

  it('lets a grant stand in for a paid month', async () => {
    // A bot owner, a keeper, an invited guest: `clubStatus` calls that active
    // without a club_period row, and a profile must agree with it -- one
    // definition of membership for the whole product.
    const verdict = await mayViewProfile({
      viewerTelegramId: '1',
      ownerTelegramId: '2',
      pool: poolWith(null),
      access: 'guest',
      now: NOW,
    })
    expect(verdict).toEqual({ allowed: true, reason: 'member' })
  })

  it('treats the ids as text, because they arrive as both', async () => {
    // The session gives a string, the database a number; `27 !== '27'` would
    // put a person behind a paywall on their own page.
    const verdict = await mayViewProfile({
      viewerTelegramId: 27 as unknown as string,
      ownerTelegramId: '27',
      pool: poolWith(null),
      now: NOW,
    })
    expect(verdict.allowed).toBe(true)
  })
})
