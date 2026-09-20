import { describe, it, expect } from 'vitest'
import {
  checkWaitingClients,
  whoIsWaiting,
  lineFor,
  WAITING_MS,
  PER_TICK,
} from './clients-waiting'

/*
 * THE FAULT REPORT THAT APPEARS IN NO LOG.
 *
 * When a provider dies the bot throws and the error collector counts it. When
 * a person writes "it charged me and nothing came", nothing fails at all --
 * from the code's side it is an ordinary message, and it waited in a table for
 * somebody to scroll far enough.
 *
 * Every id below is invented (9000000xx). Real people do not appear in this
 * repository, in tests least of all.
 */
const T = Date.parse('2026-09-20T12:00:00Z')
const ago = (ms: number) => new Date(T - ms).toISOString()
const HOUR = 3600_000

type Lead = {
  owner: string
  lead: string
  lastIn: number | null
  lastOut: number | null
  words?: string
  /** When a note about this person was last written, if ever. */
  notedAt?: number
}

const poolOf = (leads: Lead[]) => {
  const written: Array<Record<string, unknown>> = []
  return {
    written,
    query: async (sql: string, params?: unknown[]) => {
      if (/INSERT INTO hive_events/.test(sql)) {
        written.push({
          kind: params?.[0],
          who: params?.[1],
          what: params?.[4],
          severity: params?.[5],
        })
        return { rows: [] }
      }
      if (/CREATE TABLE|CREATE INDEX|ALTER TABLE/i.test(sql))
        return { rows: [] }
      if (/FROM hive_events/.test(sql)) {
        const who = String(params?.[0])
        const since = Date.parse(String(params?.[1]))
        const found = leads.find(
          l => l.lead === who && l.notedAt !== undefined && l.notedAt > since
        )
        return { rows: found ? [{ '?column?': 1 }] : [] }
      }
      // The aggregate: unanswered only, oldest first, as the SQL does.
      const rows = leads
        .filter(l => l.lastIn !== null)
        .filter(l => l.lastOut === null || (l.lastIn as number) > l.lastOut)
        .sort((a, b) => (a.lastIn as number) - (b.lastIn as number))
        .map(l => ({
          owner_id: l.owner,
          lead_id: l.lead,
          last_in: new Date(l.lastIn as number).toISOString(),
          last_out:
            l.lastOut === null ? null : new Date(l.lastOut).toISOString(),
          last_words: l.words ?? 'привет', // cyrillic-ok: fixture text
        }))
      return { rows }
    },
  }
}

describe('who is waiting for an answer', () => {
  it('ignores a person we already answered', async () => {
    const pool = poolOf([
      {
        owner: '900000201',
        lead: '900000301',
        lastIn: T - 9 * HOUR,
        lastOut: T - HOUR,
      },
    ])
    expect(await whoIsWaiting(pool as never, T)).toEqual([])
  })

  /*
   * A FRESH MESSAGE IS NOT A COMPLAINT. Somebody who wrote ten minutes ago is
   * being answered right now by a person or by the seller; a line about them
   * would be noise, and noise is what makes a board unread.
   */
  it('gives a fresh message time to be answered', async () => {
    const pool = poolOf([
      {
        owner: '900000201',
        lead: '900000302',
        lastIn: T - 10 * 60_000,
        lastOut: null,
      },
    ])
    expect(await whoIsWaiting(pool as never, T)).toEqual([])
    const late = poolOf([
      {
        owner: '900000201',
        lead: '900000302',
        lastIn: T - WAITING_MS,
        lastOut: null,
      },
    ])
    expect((await whoIsWaiting(late as never, T)).map(p => p.lead)).toEqual([
      '900000302',
    ])
  })

  /*
   * THE ONE THE OWNER ASKED FOR: "найди все обращения и ошибки". A person
   * saying something is broken is an alarm; a person saying hello is not.
   */
  it('hears a fault in what they wrote, and says so louder', async () => {
    const pool = poolOf([
      {
        owner: '900000201',
        lead: '900000303',
        lastIn: T - 5 * HOUR,
        lastOut: null,
        words: 'списали звёзды, а видео не пришло', // cyrillic-ok: fixture text
      },
      {
        owner: '900000201',
        lead: '900000304',
        lastIn: T - 5 * HOUR,
        lastOut: null,
        words: 'здравствуйте, а что вы умеете', // cyrillic-ok: fixture text
      },
    ])
    const r = await checkWaitingClients(pool as never, T)
    expect(r.written).toBe(2)
    const trouble = pool.written.find(w => w.who === '900000303')
    const hello = pool.written.find(w => w.who === '900000304')
    expect(trouble?.severity).toBe('alarm')
    expect(hello?.severity).toBe('attention')
  })

  /*
   * THEIR WORDS STAY WHERE THEY LIVE. The journal line is a pointer. A line
   * that quoted the message would turn an append-only log into a second copy
   * of somebody's correspondence -- readable by every tool that reads the
   * journal, for ever.
   */
  it('never writes what the person said', async () => {
    const secret = 'мой номер карты 4276 и пароль' // cyrillic-ok: fixture text
    const pool = poolOf([
      {
        owner: '900000201',
        lead: '900000305',
        lastIn: T - 5 * HOUR,
        lastOut: null,
        words: secret,
      },
    ])
    await checkWaitingClients(pool as never, T)
    const line = String(pool.written[0]?.what ?? '')
    expect(line).not.toContain('4276')
    expect(line).not.toContain(secret)
  })

  /*
   * ONE NOTE PER SILENCE. The report ticks every ten minutes; without this a
   * waiting person is written six times an hour for as long as they wait,
   * which is how a board becomes wallpaper.
   */
  it('writes a waiting person once, not once per tick', async () => {
    const pool = poolOf([
      {
        owner: '900000201',
        lead: '900000306',
        lastIn: T - 5 * HOUR,
        lastOut: null,
        notedAt: T - 4 * HOUR,
      },
    ])
    const r = await checkWaitingClients(pool as never, T)
    expect(r.waiting).toBe(1)
    expect(r.written).toBe(0)
  })

  /*
   * THE FIRST RUN MEETS A YEAR OF HISTORY AT ONCE. Writing all of it would
   * bury every other kind on day one. The oldest wait goes first and the cap
   * is REPORTED -- a silent truncation reads as "that was everybody".
   */
  it('caps a tick and says how many it deferred', async () => {
    const many: Lead[] = []
    for (let i = 0; i < PER_TICK + 7; i++) {
      many.push({
        owner: '900000201',
        lead: String(900000400 + i),
        lastIn: T - (5 + i) * HOUR,
        lastOut: null,
      })
    }
    const pool = poolOf(many)
    const r = await checkWaitingClients(pool as never, T)
    expect(r.written).toBe(PER_TICK)
    expect(r.waiting).toBe(PER_TICK + 7)
    expect(r.deferred).toBe(7)
    // Oldest first: the longest wait is not the one left behind.
    expect(pool.written[0]?.who).toBe(String(900000400 + PER_TICK + 6))
  })

  /*
   * AN UNREADABLE TABLE IS NOT "NOBODY IS WAITING". A watcher that turns an
   * unknown into a comfortable zero is worse than no watcher at all.
   */
  it('refuses to report a comfortable zero when it cannot look', async () => {
    const broken = {
      query: async () => {
        throw new Error('relation "crm_messages" does not exist')
      },
    }
    const r = await checkWaitingClients(broken as never, T)
    expect(r.waiting).toBe(-1)
    expect(r.written).toBe(0)
  })

  it('says the wait in days once hours stop being readable', () => {
    expect(
      lineFor({ owner: 'o', lead: 'l', waitedMs: 5 * HOUR, trouble: false })
    ).toContain('5 ч')
    expect(
      lineFor({ owner: 'o', lead: 'l', waitedMs: 72 * HOUR, trouble: false })
    ).toContain('3 дн')
  })
})
