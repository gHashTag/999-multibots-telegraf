/**
 * AN INVITATION WRITTEN AS A NAME WAS UNREADABLE OUTSIDE TELEGRAM.
 *
 * Measured 2026-09-21 on production data. Two people the owner had let in --
 * @SamHold (504608015, "mike") and @Farishka (373211349, Farisha), both of
 * whom paid cash off-platform -- were stopped on step 3 of 7 of the welcome
 * road by the 10 000-star paywall. Neither owns a bot in `avatars`, neither
 * has a row in `club_period`, neither has a row in `club_grant_period`, so
 * nothing but the guest pass could have let them through.
 *
 * @SamHold had been ON that guest list since the day it was written. The list
 * holds names; the name is read by `verifiedTelegramUsername`, which parses
 * `x-telegram-init-data`; and a desktop browser -- which is where he was --
 * never sends that header. So the name came back null, a list of names matched
 * nothing, and the pass he already held was unreadable. @Farishka was simply
 * never added.
 *
 * Two things are pinned here, because either alone leaves the hole open:
 *   1. every invited person is on the list BY ID as well as by name -- an id
 *      is the one identifier every sign-in path knows, and it cannot be
 *      renamed away;
 *   2. when the signature carries no name, the verified id is asked what it is
 *      called, so the NEXT person invited by name is not locked out the same
 *      way.
 */
import { describe, it, expect } from 'vitest'
import { clubGrantFor } from './src/agent/club-membership'
import { DEFAULT_GUESTS, isClubGuest } from './src/agent/club-guests'

/** The two people who were stopped, with the names the users table holds. */
const STOPPED = [
  { telegramId: '504608015', username: 'SamHold' },
  { telegramId: '373211349', username: 'Farishka' },
]

/** Nothing free: no bots, no keeper role. Only the guest pass can decide. */
const noOtherGrant = {
  botsOwnedBy: async () => [] as string[],
  keepers: () => [] as string[],
}

describe('the two people who were stopped at the paywall', () => {
  it('are on the list by id, not only by name', () => {
    for (const who of STOPPED) {
      // By id ALONE -- the state a browser sign-in is actually in.
      expect(isClubGuest({ telegramId: who.telegramId, username: null })).toBe(
        true
      )
    }
  })

  it('are on the list by name too, for the Mini App', () => {
    for (const who of STOPPED) {
      expect(isClubGuest({ telegramId: '1', username: who.username })).toBe(
        true
      )
    }
  })

  it('get the club without a signature that carries a name', async () => {
    for (const who of STOPPED) {
      const grant = await clubGrantFor(
        who.telegramId,
        { ...noOtherGrant, usernameOf: () => null },
        {}
      )
      expect(grant).toBe('guest')
    }
  })
})

describe('an invitation by name, outside the Mini App', () => {
  const invited = { ...noOtherGrant, guests: () => ['anna'] }

  it('is read from the verified id when the signature has no name', async () => {
    // Exactly the browser case: id verified, no x-telegram-init-data header.
    const grant = await clubGrantFor(
      '999',
      { ...invited, usernameOf: () => null, usernameById: async () => 'Anna' },
      {}
    )
    expect(grant).toBe('guest')
  })

  it('still prefers the name the SIGNATURE carries when there is one', async () => {
    let asked = false
    const grant = await clubGrantFor(
      '999',
      {
        ...invited,
        usernameOf: () => 'anna',
        usernameById: async () => {
          asked = true
          return null
        },
      },
      {}
    )
    expect(grant).toBe('guest')
    expect(asked).toBe(false)
  })

  it('does not let a stranger in through the lookup', async () => {
    const grant = await clubGrantFor(
      '999',
      {
        ...invited,
        usernameOf: () => null,
        usernameById: async () => 'somebody_else',
      },
      {}
    )
    expect(grant).toBeNull()
  })

  it('treats a failed lookup as no name, never as a grant', async () => {
    const grant = await clubGrantFor(
      '999',
      {
        ...invited,
        usernameOf: () => null,
        usernameById: async () => {
          throw new Error('users replied 503')
        },
      },
      {}
    )
    expect(grant).toBeNull()
  })

  it('is unchanged where no lookup is supplied at all', async () => {
    expect(
      await clubGrantFor('999', { ...invited, usernameOf: () => null }, {})
    ).toBeNull()
  })
})

describe('the server wires the lookup in', () => {
  it('asks the users table for the name of a verified id', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const server = fs.readFileSync(
      path.join(__dirname, 'render-server.ts'),
      'utf8'
    )
    // Without this call site the fix above is a function nobody invokes.
    expect(server).toContain('usernameById:')
    expect(server).toContain('SELECT username FROM users WHERE telegram_id')
  })

  it('keeps the earlier invitations on the list', () => {
    expect(DEFAULT_GUESTS).toContain('dmtrled')
    expect(DEFAULT_GUESTS).toContain('samhold')
  })
})
