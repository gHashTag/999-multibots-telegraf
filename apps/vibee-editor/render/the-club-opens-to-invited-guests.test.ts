import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  clubGrantFor,
  handleClub,
  forgetClubTablesForTests,
} from './src/agent/club-membership'
import {
  DEFAULT_GUESTS,
  clubGuests,
  isClubGuest,
  normalizeGuest,
} from './src/agent/club-guests'
import { verifiedTelegramUsername } from './auth'

/**
 * THE GUEST PASS (owner, 2026-09-12: "give @dmtrled and @SamHold access to
 * the digital avatar setup"). An invitation by name opens the club -- and
 * therefore the Telegram step and the SOUL slide -- without a payment and
 * without a monthly token grant.
 */
function fakePool() {
  const grants: Array<Record<string, any>> = []
  const journal: Array<unknown[]> = []
  return {
    grants,
    journal,
    async query(sql: string, params: unknown[] = []) {
      const s = sql.replace(/\s+/g, ' ').trim()
      if (/^(CREATE|ALTER)/i.test(s)) return { rows: [] }
      if (/^INSERT INTO club_grant_period/i.test(s)) {
        grants.push({ telegram_id: params[0], grant_kind: params[1] })
        return { rows: [{ id: grants.length }], rowCount: 1 }
      }
      if (/^INSERT INTO hive_events/i.test(s)) {
        journal.push(params)
        return { rows: [] }
      }
      return { rows: [] }
    },
  }
}

beforeEach(() => forgetClubTablesForTests())
afterEach(() => vi.unstubAllEnvs())

describe('the list', () => {
  it('names the two invited people, lower-cased, without the @', () => {
    expect(DEFAULT_GUESTS).toEqual(['dmtrled', 'samhold'])
    expect(normalizeGuest(' @SamHold ')).toBe('samhold')
  })

  it('merges CLUB_GUESTS from the environment, dropping empties and duplicates', () => {
    expect(clubGuests('@DMTRLED, 777, ,anna')).toEqual(['dmtrled', 'samhold', '777', 'anna'])
    expect(clubGuests(undefined)).toEqual(['dmtrled', 'samhold'])
  })

  it('matches by verified username in any case, or by id exactly', () => {
    expect(isClubGuest({ telegramId: '1', username: 'SamHold' })).toBe(true)
    expect(isClubGuest({ telegramId: '1', username: '@dmtrled' })).toBe(true)
    expect(isClubGuest({ telegramId: '777', username: null }, ['777'])).toBe(true)
    expect(isClubGuest({ telegramId: '1', username: 'samholder' })).toBe(false)
    expect(isClubGuest({ telegramId: '1', username: null })).toBe(false)
  })
})

describe('the grant', () => {
  const source = (username: string | null, bots: string[] = []) => ({
    botsOwnedBy: async () => bots,
    keepers: () => ['9'],
    usernameOf: () => username,
  })

  it('an invited person is a guest; owners and keepers keep their grants', async () => {
    expect(await clubGrantFor('1', source('dmtrled'), {})).toBe('guest')
    expect(await clubGrantFor('1', source('dmtrled', ['bot_a']), {})).toBe('owner')
    expect(await clubGrantFor('9', source('dmtrled'), {})).toBe('keeper')
  })

  it('a stranger stays a stranger, with or without a name; no request means no name', async () => {
    expect(await clubGrantFor('1', source('nobody'), {})).toBeNull()
    expect(await clubGrantFor('1', source(null), {})).toBeNull()
    expect(await clubGrantFor('1', source('dmtrled'))).toBeNull()
  })

  it('a Supabase hiccup does not lock an invited person out', async () => {
    const s = { ...source('samhold'), botsOwnedBy: async () => { throw new Error('avatars replied 503') } }
    expect(await clubGrantFor('1', s, {})).toBe('guest')
    expect(await clubGrantFor('1', { ...s, usernameOf: () => 'nobody' }, {})).toBeNull()
  })
})

describe('the HTTP surface', () => {
  it('status says active + granted: guest, and books NO token grant period', async () => {
    const pool = fakePool()
    const credits: unknown[] = []
    const out = await handleClub(
      { url: '/api/club/status', method: 'GET' },
      {
        getPool: async () => pool,
        identity: () => '424242',
        botToken: 'bot',
        credit: async () => 'credited' as never,
        grant: { botsOwnedBy: async () => [], keepers: () => [], usernameOf: () => 'dmtrled' },
        creditGrant: async g => {
          credits.push(g)
          return { ok: true } as never
        },
        now: () => new Date('2026-09-12T07:00:00Z'),
      }
    )
    expect(out.status).toBe(200)
    expect(out.body).toMatchObject({ ok: true, active: true, granted: 'guest', days_left: 0 })
    expect(pool.grants).toHaveLength(0)
    expect(credits).toHaveLength(0)
  })
})

describe('the verified username', () => {
  it('comes from a signed initData only', () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '')
    const req = { headers: { 'x-telegram-init-data': 'user=%7B%22id%22%3A1%2C%22username%22%3A%22SamHold%22%7D&hash=deadbeef' } }
    // No token configured => the signature cannot verify => no name.
    expect(verifiedTelegramUsername(req as never)).toBeNull()
    expect(verifiedTelegramUsername({ headers: {} } as never)).toBeNull()
  })
})
