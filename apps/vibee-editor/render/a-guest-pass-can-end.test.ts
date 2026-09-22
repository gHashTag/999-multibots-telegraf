import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  clubAccessFor,
  clubGrantFor,
  handleClub,
  forgetClubTablesForTests,
  type ClubGrantSource,
} from './src/agent/club-membership'
import {
  DEFAULT_GUESTS,
  clubGuests,
  guestPassFor,
  isClubGuest,
  parseDay,
  parseGuestEntry,
} from './src/agent/club-guests'

/**
 * A GUEST PASS WITH AN END DATE (owner, 2026-09-22: warm people try the club
 * for a while, then join).
 *
 * `name@2026-09-29` or `id@2026-09-29` is a guest until 2026-09-29 00:00 UTC;
 * a bare entry stays forever. A date that cannot be read skips the entry,
 * reported by position, never by its text, and never stops the others. An
 * expired guest is not a member: /api/club/status says so, with the date.
 *
 * Ids are invented (9000000xx); names are roles.
 */
const GUEST = '900000031'
const OTHER = '900000032'
const END = '2026-09-29'
const END_ISO = '2026-09-29T00:00:00.000Z'

const who = (telegramId: string, username: string | null = null) => ({
  telegramId,
  username,
})

beforeEach(() => forgetClubTablesForTests())
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('the date is read strictly', () => {
  it('reads a real YYYY-MM-DD day as its UTC midnight', () => {
    expect(parseDay('2026-09-29')?.toISOString()).toBe(END_ISO)
    expect(parseDay(' 2026-12-31 ')?.toISOString()).toBe(
      '2026-12-31T00:00:00.000Z'
    )
  })

  it.each([
    ['2026-9-29'],
    ['2026-02-30'],
    ['2026-13-01'],
    ['2026-09-29T10:00'],
    ['0026-09-29'],
    ['29.09.2026'],
    [''],
  ])('refuses %j', raw => {
    expect(parseDay(raw)).toBeNull()
  })

  it('tells a bare entry from a dated one, and a dated one from a broken one', () => {
    expect(parseGuestEntry('Anna')).toEqual({
      ok: true,
      entry: { who: 'anna', ends: null },
    })
    expect(parseGuestEntry('@anna')).toEqual({
      ok: true,
      entry: { who: 'anna', ends: null },
    })
    const dated = parseGuestEntry(' @Anna@2026-09-29 ')
    expect(dated).toMatchObject({ ok: true, entry: { who: 'anna' } })
    expect(dated && dated.ok && dated.entry.ends?.toISOString()).toBe(END_ISO)
    expect(parseGuestEntry(`${GUEST}@${END}`)).toMatchObject({
      ok: true,
      entry: { who: GUEST },
    })
    expect(parseGuestEntry('anna@')).toMatchObject({ ok: false })
    expect(parseGuestEntry('anna@2026-02-30')).toMatchObject({ ok: false })
    expect(parseGuestEntry('@@2026-09-29')).toMatchObject({ ok: false })
    expect(parseGuestEntry('   ')).toBeNull()
  })
})

describe('a malformed entry is skipped, reported by position, never fatal', () => {
  it('keeps every readable entry and names the broken ones by number only', () => {
    const lines: string[] = []
    const list = clubGuests(
      `anna@${END}, bob@2026-9-31,${GUEST}@2026-02-30 ,carl,,${OTHER}`,
      l => lines.push(l)
    )
    expect(list).toEqual([...DEFAULT_GUESTS, `anna@${END}`, 'carl', OTHER])
    expect(lines).toEqual([
      '[club] CLUB_GUESTS entry 2 skipped: the end date is not a real YYYY-MM-DD day',
      '[club] CLUB_GUESTS entry 3 skipped: the end date is not a real YYYY-MM-DD day',
    ])
    // The text of an entry is a person: it never reaches the log.
    for (const l of lines) {
      expect(l).not.toMatch(/bob|900000031|2026-9-31|2026-02-30/)
    }
  })

  it('a broken entry never becomes "forever" -- that person is simply not on the list', () => {
    const list = clubGuests(`${GUEST}@2026-02-30`, () => {})
    expect(guestPassFor(who(GUEST), list, new Date('2026-09-01'))).toEqual({
      kind: 'none',
    })
  })

  it('by default logs once per value of the variable, not on every request', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    clubGuests('x@bad-date-one')
    clubGuests('x@bad-date-one')
    expect(warn).toHaveBeenCalledTimes(1)
    clubGuests('x@bad-date-two, y@bad')
    expect(warn).toHaveBeenCalledTimes(3)
  })
})

describe('the boundary is the end date at midnight UTC', () => {
  const list = [`${GUEST}@${END}`]

  it('one millisecond before midnight: a guest, until the end', () => {
    expect(
      guestPassFor(who(GUEST), list, new Date('2026-09-28T23:59:59.999Z'))
    ).toEqual({ kind: 'guest', until: END_ISO })
    expect(
      isClubGuest(who(GUEST), list, new Date('2026-09-28T23:59:59.999Z'))
    ).toBe(true)
  })

  it('at midnight: not a guest any more, and the day it ended is known', () => {
    expect(guestPassFor(who(GUEST), list, new Date(END_ISO))).toEqual({
      kind: 'expired',
      endedOn: END_ISO,
    })
    expect(isClubGuest(who(GUEST), list, new Date(END_ISO))).toBe(false)
  })

  it('a name carries its date too', () => {
    const named = ['anna@2026-09-29']
    const at = new Date(END_ISO)
    expect(guestPassFor(who(OTHER, '@Anna'), named, at).kind).toBe('expired')
    expect(
      guestPassFor(who(OTHER, 'anna'), named, new Date('2026-09-28T12:00Z'))
        .kind
    ).toBe('guest')
  })

  it('a bare entry is forever, and wins over a dated one for the same person', () => {
    const late = new Date('2030-01-01T00:00:00Z')
    expect(guestPassFor(who(GUEST), [GUEST], late)).toEqual({
      kind: 'guest',
      until: null,
    })
    expect(guestPassFor(who(GUEST), [`${GUEST}@${END}`, GUEST], late)).toEqual({
      kind: 'guest',
      until: null,
    })
  })

  it('among dated entries the latest end wins', () => {
    const list2 = [`${GUEST}@${END}`, `${GUEST}@2026-10-06`]
    expect(guestPassFor(who(GUEST), list2, new Date('2026-10-01'))).toEqual({
      kind: 'guest',
      until: '2026-10-06T00:00:00.000Z',
    })
  })

  it('somebody never invited is "none", not "expired"', () => {
    expect(guestPassFor(who(OTHER), list, new Date(END_ISO))).toEqual({
      kind: 'none',
    })
  })
})

describe('membership reads the pass through the one decision', () => {
  const source = (guests: string[]): ClubGrantSource => ({
    botsOwnedBy: async () => [],
    keepers: () => [],
    guests: () => guests,
  })

  it('an expired guest has no grant, and the access says when it ended', async () => {
    const s = source([`${GUEST}@${END}`])
    expect(await clubGrantFor(GUEST, s, {}, new Date(END_ISO))).toBeNull()
    expect(await clubAccessFor(GUEST, s, {}, new Date(END_ISO))).toEqual({
      grant: null,
      guestUntil: null,
      guestEnded: END_ISO,
    })
    expect(
      await clubAccessFor(GUEST, s, {}, new Date('2026-09-28T23:00:00Z'))
    ).toEqual({ grant: 'guest', guestUntil: END_ISO, guestEnded: null })
  })

  it('an owner or keeper whose old pass ended is still an owner or keeper', async () => {
    const owner = {
      ...source([`${GUEST}@${END}`]),
      botsOwnedBy: async () => ['bot_a'],
    }
    expect(await clubAccessFor(GUEST, owner, {}, new Date(END_ISO))).toEqual({
      grant: 'owner',
      guestUntil: null,
      guestEnded: null,
    })
  })
})

/** The render's Postgres for /api/club/*, with no paid month for anybody. */
function emptyClubDb() {
  const invoices: unknown[] = []
  return {
    invoices,
    async query(sql: string) {
      const s = sql.replace(/\s+/g, ' ').trim()
      if (/^(CREATE|ALTER)/i.test(s)) return { rows: [] }
      if (/FROM club_period WHERE telegram_id/i.test(s)) return { rows: [] }
      if (/FROM club_grant_period/i.test(s)) return { rows: [] }
      if (/^INSERT INTO hive_events/i.test(s)) return { rows: [] }
      throw new Error(`unexpected SQL: ${s.slice(0, 100)}`)
    },
  }
}

function deps(now: string, extra: Partial<ClubGrantSource> = {}) {
  const minted: string[] = []
  return {
    minted,
    deps: {
      getPool: async () => emptyClubDb(),
      identity: () => GUEST,
      botToken: 'bot',
      credit: async () => ({ credited: true }),
      // No `guests` here: the real CLUB_GUESTS path is what is under test.
      grant: { botsOwnedBy: async () => [], keepers: () => [], ...extra },
      now: () => new Date(now),
      fetchImpl: (async (url: string, init?: { body?: string }) => {
        minted.push(String(url))
        const body = JSON.parse(String(init?.body ?? '{}'))
        return {
          json: async () => ({
            ok: true,
            result: `https://t.me/$${body.payload}`,
          }),
        }
      }) as unknown as typeof fetch,
    },
  }
}

describe('/api/club/status, from CLUB_GUESTS on the render', () => {
  it('a guest with days left: active, granted guest, until the end of the pass', async () => {
    vi.stubEnv('CLUB_GUESTS', `${GUEST}@${END}`)
    const out = await handleClub(
      { url: '/api/club/status', method: 'GET' },
      deps('2026-09-22T09:00:00Z').deps
    )
    expect(out.body).toMatchObject({
      ok: true,
      active: true,
      paid: false,
      granted: 'guest',
      until: END_ISO,
      days_left: 7,
      guest_ended: null,
    })
  })

  it('an expired guest: not a member, and the answer carries the date it ended', async () => {
    vi.stubEnv('CLUB_GUESTS', `${GUEST}@${END}`)
    const out = await handleClub(
      { url: '/api/club/status', method: 'GET' },
      deps(END_ISO).deps
    )
    expect(out.body).toMatchObject({
      ok: true,
      active: false,
      paid: false,
      granted: null,
      guest_ended: END_ISO,
      stars: 10000,
    })
  })

  it('...and the join offer is open to them: the invoice route mints', async () => {
    vi.stubEnv('CLUB_GUESTS', `${GUEST}@${END}`)
    const d = deps(END_ISO)
    const out = await handleClub(
      { url: '/api/club/invoice', method: 'POST' },
      d.deps
    )
    expect(out.body).toMatchObject({ ok: true, stars: 10000 })
    expect(d.minted).toHaveLength(1)
  })

  it('a malformed entry in the variable does not close the club to anybody else', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubEnv('CLUB_GUESTS', `${OTHER}@2026-02-30,${GUEST}`)
    const out = await handleClub(
      { url: '/api/club/status', method: 'GET' },
      deps('2026-09-22T09:00:00Z').deps
    )
    expect(out.body).toMatchObject({
      active: true,
      granted: 'guest',
      guest_ended: null,
    })
  })

  it('a bare entry is unchanged: a guest forever, no end date, no days counted', async () => {
    vi.stubEnv('CLUB_GUESTS', GUEST)
    const out = await handleClub(
      { url: '/api/club/status', method: 'GET' },
      deps('2031-01-01T00:00:00Z').deps
    )
    expect(out.body).toMatchObject({
      active: true,
      granted: 'guest',
      until: null,
      days_left: 0,
      guest_ended: null,
    })
  })
})
