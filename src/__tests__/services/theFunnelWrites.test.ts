import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  track,
  setEventsPoolForTests,
  abandonedClubInvoices,
  markAbandonedClubInvoices,
  ABANDON_AFTER_MS,
  type ClubEventRow,
} from '@/services/trackEvent'
import { logger } from '@/utils/logger'
import { strictEventsDb } from './strictEventsDb'

/**
 * THE FUNNEL MUST WRITE.
 *
 * Measured 2026-09-22: `user_events` existed in neither database, `track()`
 * sent every step to a table that was not there, and the error was treated as
 * an ordinary outcome that deserved no log line. Two weeks of funnel -- and the
 * club's whole question, "did anybody even see it?" -- went nowhere, silently.
 *
 * The double below is a database that knows only what it was told: a table
 * exists after its CREATE, an INSERT naming a column the CREATE did not name is
 * refused, and a unique index declared in SQL is enforced. It holds no copy of
 * any rule from the code under test.
 */

beforeEach(() => {
  vi.restoreAllMocks()
})
afterEach(() => setEventsPoolForTests(null))

const ctx = (id: number) => ({
  from: { id },
  botInfo: { username: 'test_bot' },
})

describe('a step lands as a row', () => {
  it('creates the table it writes to, then writes the row', async () => {
    const db = strictEventsDb()
    setEventsPoolForTests(db)
    const out = await track(ctx(900000011), 'club_card_shown', {
      source: 'command',
    })
    expect(out).toBe('recorded')
    expect(db.rows('user_events')).toEqual([
      expect.objectContaining({
        telegram_id: '900000011',
        bot_name: 'test_bot',
        event: 'club_card_shown',
        detail: { source: 'command' },
      }),
    ])
  })

  it('writes one row per step, not one per process', async () => {
    const db = strictEventsDb()
    setEventsPoolForTests(db)
    await track(ctx(900000011), 'club_card_shown')
    await track(ctx(900000012), 'club_invoice_created', { stars: 10000 })
    await track(ctx(900000011), 'start')
    expect(db.rows('user_events').map(r => r.event)).toEqual([
      'club_card_shown',
      'club_invoice_created',
      'start',
    ])
    // The schema is created once, not before every row.
    expect(db.creates()).toBe(1)
  })

  it('writes nothing for an update with nobody behind it', async () => {
    const db = strictEventsDb()
    setEventsPoolForTests(db)
    expect(await track({}, 'menu_shown')).toBe('not recorded')
    expect(db.rows('user_events')).toEqual([])
  })
})

describe('a failed write is logged, not swallowed', () => {
  it('says which step was lost and why', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger)
    setEventsPoolForTests({
      query: async () => {
        throw new Error('relation "user_events" does not exist')
      },
    })
    const out = await track(ctx(900000013), 'club_paid')
    expect(out).toBe('not recorded')
    expect(warn).toHaveBeenCalledTimes(1)
    const [line, meta] = warn.mock.calls[0] as [string, any]
    expect(line).toContain('[track] event not recorded')
    expect(meta.event).toBe('club_paid')
    expect(meta.telegramId).toBe('900000013')
    expect(meta.error).toContain('does not exist')
  })

  it('still never throws to the person waiting for an answer', async () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => logger)
    setEventsPoolForTests({
      query: async () => {
        throw new Error('connection refused')
      },
    })
    await expect(track(ctx(900000013), 'start')).resolves.toBe('not recorded')
  })

  it('logs nothing when the row landed', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger)
    setEventsPoolForTests(strictEventsDb())
    await track(ctx(900000011), 'start')
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('which club invoices were abandoned (the rule)', () => {
  const now = Date.parse('2026-09-22T12:00:00Z')
  const at = (minutesAgo: number) =>
    new Date(now - minutesAgo * 60_000).toISOString()
  const row = (
    id: string,
    who: string,
    event: ClubEventRow['event'],
    minutesAgo: number,
    detail: Record<string, unknown> | null = null
  ): ClubEventRow => ({
    id,
    telegram_id: who,
    bot_name: 'b',
    event,
    detail,
    created_at: at(minutesAgo),
  })

  it('marks an invoice left unpaid past the grace period, and only that one', () => {
    const rows = [
      row('1', '900000021', 'club_invoice_created', 180), // unpaid, old: abandoned
      row('2', '900000022', 'club_invoice_created', 180), // paid after: kept
      row('3', '900000022', 'club_paid', 170),
      row('4', '900000023', 'club_invoice_created', 30), // too fresh
      row('5', '900000024', 'club_invoice_created', 180), // already marked
      row('6', '900000024', 'club_invoice_abandoned', 100, {
        invoice_event: '5',
      }),
      row('7', '900000025', 'club_paid', 300), // paid BEFORE the invoice...
      row('8', '900000025', 'club_invoice_created', 200), // ...still abandoned
      row('9', '900000026', 'club_invoice_created', 200), // somebody else paid
      row('10', '900000027', 'club_paid', 150),
    ]
    expect(
      abandonedClubInvoices(rows, now)
        .map(r => r.id)
        .sort()
    ).toEqual(['1', '8', '9'])
  })

  it('uses the grace period it is given, an hour by default', () => {
    const rows = [row('1', '900000021', 'club_invoice_created', 61)]
    expect(abandonedClubInvoices(rows, now)).toHaveLength(1)
    expect(abandonedClubInvoices(rows, now, 2 * ABANDON_AFTER_MS)).toHaveLength(
      0
    )
    expect(ABANDON_AFTER_MS).toBe(60 * 60 * 1000)
  })
})

describe('the hourly pass writes the abandoned rows, once each', () => {
  it('marks the unpaid invoices and nothing else, and a second run adds nothing', async () => {
    const db = strictEventsDb()
    setEventsPoolForTests(db)
    const now = Date.now()
    const ago = (min: number) => new Date(now - min * 60_000).toISOString()
    // Seed through the real writer so the table and index exist as the code made them.
    await track(ctx(900000031), 'start')
    db.insertRaw('user_events', {
      telegram_id: '900000031',
      bot_name: 'test_bot',
      event: 'club_invoice_created',
      detail: null,
      created_at: ago(120),
    })
    db.insertRaw('user_events', {
      telegram_id: '900000032',
      bot_name: 'test_bot',
      event: 'club_invoice_created',
      detail: null,
      created_at: ago(120),
    })
    db.insertRaw('user_events', {
      telegram_id: '900000032',
      bot_name: 'test_bot',
      event: 'club_paid',
      detail: null,
      created_at: ago(100),
    })

    expect(await markAbandonedClubInvoices(now)).toBe(1)
    const abandoned = db
      .rows('user_events')
      .filter(r => r.event === 'club_invoice_abandoned')
    expect(abandoned).toHaveLength(1)
    expect(abandoned[0].telegram_id).toBe('900000031')

    expect(await markAbandonedClubInvoices(now)).toBe(0)
    expect(
      db.rows('user_events').filter(r => r.event === 'club_invoice_abandoned')
    ).toHaveLength(1)
  })

  it('throws when it cannot read, instead of reporting nobody walked away', async () => {
    setEventsPoolForTests({
      query: async () => {
        throw new Error('the database is down')
      },
    })
    await expect(markAbandonedClubInvoices()).rejects.toThrow('down')
  })
})
