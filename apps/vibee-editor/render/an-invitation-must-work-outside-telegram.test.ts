/**
 * AN INVITATION WRITTEN AS A NAME WAS UNREADABLE OUTSIDE TELEGRAM.
 *
 * Measured 2026-09-21 on production data. Two people the owner had let in --
 * both of whom paid cash off-platform -- were stopped on step 3 of 7 of the
 * welcome road by the 10 000-star paywall. Neither owns a bot in `avatars`,
 * neither has a row in `club_period`, neither has a row in
 * `club_grant_period`, so nothing but the guest pass could have let them
 * through.
 *
 * One of them had been ON that guest list since the day it was written. The
 * list holds names; the name is read by `verifiedTelegramUsername`, which
 * parses `x-telegram-init-data`; and a desktop browser -- which is where he
 * was -- never sends that header. So the name came back null, a list of names
 * matched nothing, and the pass he already held was unreadable. The other was
 * simply never added.
 *
 * Two things are pinned here, because either alone leaves the hole open:
 *   1. an invitation is readable BY ID as well as by name -- an id is the one
 *      identifier every sign-in path knows, and it cannot be renamed away;
 *   2. when the signature carries no name, the verified id is asked what it is
 *      called, so the NEXT person invited by name is not locked out the same
 *      way.
 *
 * The two real ids used to be written out here and in DEFAULT_GUESTS. They are
 * gone from both (#2752): this repository is public, and CLUB_GUESTS on
 * vibee-render carries every invited id. What the tests below own is the
 * MECHANISM -- an id in the list opens the pass, from whichever source the list
 * was assembled -- so they hold for whoever the owner invites next, and hold
 * without naming anybody.
 */
import { describe, it, expect } from 'vitest'
import { clubGrantFor } from './src/agent/club-membership'
import {
  clubGuests,
  DEFAULT_GUESTS,
  isClubGuest,
} from './src/agent/club-guests'

/** An invitation of the shape the paywall stopped: a name and an id. */
const INVITED = { telegramId: '1000000001', username: 'Invitee' }

/** Nothing free: no bots, no keeper role. Only the guest pass can decide. */
const noOtherGrant = {
  botsOwnedBy: async () => [] as string[],
  keepers: () => [] as string[],
}

describe('an invitation carrying an id', () => {
  /** What the environment gives the server: the name AND the id. */
  const list = clubGuests(`${INVITED.username},${INVITED.telegramId}`)

  it('is read by id alone -- the state a browser sign-in is actually in', () => {
    expect(
      isClubGuest({ telegramId: INVITED.telegramId, username: null }, list)
    ).toBe(true)
  })

  it('is read by name too, for the Mini App', () => {
    expect(
      isClubGuest({ telegramId: '1', username: INVITED.username }, list)
    ).toBe(true)
  })

  it('opens the club without a signature that carries a name', async () => {
    const grant = await clubGrantFor(
      INVITED.telegramId,
      { ...noOtherGrant, usernameOf: () => null, guests: () => list },
      {}
    )
    expect(grant).toBe('guest')
  })

  it('lets an id through the environment, with no code change', () => {
    expect(clubGuests(INVITED.telegramId)).toContain(INVITED.telegramId)
  })

  it('does not open the club for an id nobody invited', () => {
    expect(
      isClubGuest({ telegramId: '1000000002', username: null }, list)
    ).toBe(false)
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
