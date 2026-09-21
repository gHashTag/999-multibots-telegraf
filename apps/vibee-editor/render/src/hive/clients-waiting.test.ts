import { describe, it, expect } from 'vitest'
import {
  isTrouble,
  checkWaitingClients,
  whoIsWaiting,
  lineFor,
  WAITING_MS,
  PER_TICK,
  TOO_OLD_MS,
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
        .sort((a, b) => (b.lastIn as number) - (a.lastIn as number))
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
    /*
     * NEWEST FIRST. The first production run took the oldest wait first and
     * filled the board with an imported archive -- twenty lines, every one of
     * them between 1591 and 2478 days. Whoever wrote this morning never
     * appeared. A fresh wait is the one somebody can still act on.
     */
    expect(pool.written[0]?.who).toBe(String(900000400))
  })

  /*
   * SEVEN YEARS IS NOT A QUEUE, IT IS AN ARCHIVE. `crm_messages` holds
   * imported correspondence going back years; nobody in it is waiting. Writing
   * it as attention is how a board becomes something nobody opens.
   */
  it('passes over history, and says how much of it there was', async () => {
    const HOUR2 = 3600_000
    const pool = poolOf([
      {
        owner: '900000201',
        lead: '900000501',
        lastIn: T - 5 * HOUR2,
        lastOut: null,
      },
      {
        owner: '900000201',
        lead: '900000502',
        lastIn: T - 40 * 24 * HOUR2,
        lastOut: null,
      },
      {
        owner: '900000201',
        lead: '900000503',
        lastIn: T - 2400 * 24 * HOUR2,
        lastOut: null,
      },
    ])
    const r = await checkWaitingClients(pool as never, T)
    expect(r.written).toBe(1)
    expect(r.history).toBe(2)
    expect(pool.written[0]?.who).toBe('900000501')
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

  /*
   * THE ORDER IS IN THE SQL, AND THE FIXTURE CANNOT SEE IT.
   *
   * The double above sorts in JavaScript, so it would have passed with the
   * query ordering either way -- and it did: a mutation flipping DESC to ASC
   * survived every other test in this file. Without a real database the only
   * honest guard is the statement itself.
   */
  it('asks the database for the newest wait first', async () => {
    const sqls: string[] = []
    const pool = {
      query: async (sql: string) => {
        sqls.push(sql.replace(/\s+/g, ' '))
        return { rows: [] }
      },
    }
    await whoIsWaiting(pool as never, T)
    const agg = sqls.find(q => /crm_messages/.test(q))
    expect(agg, 'the aggregate was never asked for').toBeTruthy()
    expect(agg).toMatch(/ORDER BY agg\.last_in DESC/)
  })

  it('draws the line between a queue and an archive at a month', () => {
    expect(TOO_OLD_MS).toBe(30 * 24 * 3600_000)
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

/**
 * A TROUBLE WORD IS A WORD, NOT FOUR LETTERS INSIDE ANOTHER.
 *
 * 2026-09-21: a vendor's mailing about "dependence" paged the keeper as a
 * client reporting a fault for 13 days -- the stem for "froze" opens the verb
 * for "depend" too -- and the stem for "charged" sits inside "schedule".
 */
describe('trouble words', () => {
  it('still hears the real complaints', () => {
    for (const t of [
      'деньги списаны дважды', // cyrillic-ok: a client's complaint, test data
      'бот завис', // cyrillic-ok: test data
      'всё зависло после оплаты', // cyrillic-ok: test data
      'ошибка при оплате', // cyrillic-ok: test data
      'please refund me',
    ])
      expect(isTrouble(t), t).toBe(true)
  })

  it('does not hear them inside other words', () => {
    for (const t of [
      'прислали новое расписание', // cyrillic-ok: "schedule", test data
      'выплаты зависели от питания', // cyrillic-ok: "depended", test data
      'снизить зависимость от сети', // cyrillic-ok: "dependence", test data
      'всё зависит от вас', // cyrillic-ok: "depends", test data
    ])
      expect(isTrouble(t), t).toBe(false)
  })
})
