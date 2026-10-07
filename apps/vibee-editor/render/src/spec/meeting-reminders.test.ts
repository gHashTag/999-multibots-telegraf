import { describe, expect, it, vi } from 'vitest'
import * as SPEC from './meeting-reminders.gen'

vi.mock('../auth/telegram-sender', () => ({
  sendToTelegram: vi.fn(async () => undefined),
}))

import {
  answerTap,
  callbackData,
  cardMarkup,
  cardText,
  clampDuration,
  firesBefore,
  followsUp,
  icsFor,
  mayAnswer,
  MEETING_TOOLS,
  newToken,
  offsetOk,
  parseStart,
  reminderOffsets,
  schedules,
  sendCard,
  snoozeAdds,
  snoozeAllowed,
  sweepMeetings,
  type Meeting,
} from '../agent/meetings'

/**
 * MEETINGS ARE WRITTEN IN t27 FIRST (skill t27-spec-first).
 *
 * gHashTag/t27 specs/automation/meeting-reminders.t27 is the spec of record;
 * that the vendored copy, its generated module and the host agree is held by
 * scripts/check-t27-specs.mjs. Here each `test` of the spec runs against the
 * HOST, src/agent/meetings.ts, with a stubbed pool and a stubbed Telegram.
 *
 * Refresh: node scripts/sync-t27-spec.mjs <t27 checkout> automation/meeting-reminders
 */

const OWNER = '900000001'
const STRANGER = '900000002'

function meeting(over: Partial<Meeting> = {}): Meeting {
  return {
    id: 7,
    telegram_id: OWNER,
    title: 'Call <with> & co',
    starts_at: new Date('2026-10-02T12:00:00Z'),
    ends_at: new Date('2026-10-02T13:00:00Z'),
    mode: 'online',
    place: null,
    url: 'https://meet.example.com/abc',
    notes: null,
    lang: 'ru',
    status: 'planned',
    tap_token: 'T'.repeat(SPEC.TOKEN_CHARS),
    ics_token: 'I'.repeat(SPEC.TOKEN_CHARS),
    ...over,
  }
}

const asRow = (m: Meeting) => ({ ...m })

/** A pool that answers by the first SQL word it recognises, and records every call. */
function stubPool(answer: (sql: string, params: unknown[]) => any) {
  const calls: Array<{ sql: string; params: unknown[] }> = []
  const pool = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params })
      if (/^\s*CREATE/i.test(sql)) return { rows: [] }
      return answer(sql, params) ?? { rows: [] }
    }),
  }
  return { pool: pool as any, calls }
}

describe('automation/meeting-reminders: the spec, against the host', () => {
  it('reminders sit between the floor and the ceiling', () => {
    expect(offsetOk(SPEC.REMIND_DAY_MIN)).toBe(true)
    expect(offsetOk(SPEC.REMIND_HOUR_MIN)).toBe(true)
    expect(offsetOk(SPEC.REMIND_SOON_MIN)).toBe(true)
    expect(offsetOk(SPEC.REMIND_FLOOR_MIN)).toBe(true)
    expect(offsetOk(SPEC.REMIND_CEIL_MIN)).toBe(true)
    expect(offsetOk(SPEC.REMIND_FLOOR_MIN - 1)).toBe(false)
    expect(offsetOk(SPEC.REMIND_CEIL_MIN + 1)).toBe(false)
    expect(SPEC.MAX_REMINDERS).toBe(3)
    // The host keeps at most MAX_REMINDERS, valid ones only, largest first.
    const now = Date.parse('2026-10-01T00:00:00Z')
    const far = now + 30 * 24 * 3600 * 1000
    expect(reminderOffsets(now, far, [1, 30, 2, 60, 120, 999999, 15])).toEqual([
      120, 60, 30,
    ])
  })

  it('a reminder for a moment already past is not scheduled', () => {
    expect(schedules(0, 7200, 60)).toBe(true)
    expect(schedules(0, 3600, 60)).toBe(false)
    expect(schedules(0, 3000, 60)).toBe(false)
    expect(schedules(1000, 3600, 1440)).toBe(false)
    // A meeting 90 minutes away gets the hour and the ten minutes, not the day.
    const now = Date.parse('2026-10-01T10:00:00Z')
    expect(reminderOffsets(now, now + 90 * 60_000)).toEqual([
      SPEC.REMIND_HOUR_MIN,
      SPEC.REMIND_SOON_MIN,
    ])
    expect(reminderOffsets(now, now + 3 * 60_000)).toEqual([])
  })

  it('a reminder may be late but never after the start', async () => {
    expect(firesBefore(100, 100, 200)).toBe(true)
    expect(firesBefore(150, 100, 200)).toBe(true)
    expect(firesBefore(99, 100, 200)).toBe(false)
    expect(firesBefore(200, 100, 200)).toBe(false)
    expect(firesBefore(500, 100, 200)).toBe(false)
    expect(SPEC.LATE_STILL_SENDS).toBe(true)
    expect(SPEC.MARK_BEFORE_SEND).toBe(true)

    // The host: two due rows, one late but before the start, one after the start.
    const m = meeting()
    const now = new Date('2026-10-02T12:05:00Z') // five minutes after the start
    const early = meeting({
      id: 8,
      starts_at: new Date('2026-10-02T12:30:00Z'),
      ends_at: new Date('2026-10-02T13:30:00Z'),
    })
    const { pool, calls } = stubPool(sql => {
      if (/^\s*UPDATE agent_meeting_reminders r SET sent_at/i.test(sql))
        return {
          rows: [
            {
              id: 1,
              meeting_id: 7,
              kind: 'before',
              fire_at: new Date('2026-10-02T11:50:00Z'),
            },
            {
              id: 2,
              meeting_id: 8,
              kind: 'before',
              fire_at: new Date('2026-10-02T11:30:00Z'),
            },
          ],
        }
      if (/SELECT \* FROM agent_meetings WHERE id = ANY/i.test(sql))
        return { rows: [asRow(m), asRow(early)] }
    })
    const sent: string[] = []
    const r = await sweepMeetings(pool, {
      now,
      send: async (id, text) => void sent.push(`${id}:${text}`),
    })
    expect(r).toEqual({ claimed: 2, sent: 1, skipped: 1, failed: 0 })
    expect(sent).toHaveLength(1)
    // Marked before the send: the claim is the first statement after the tables.
    const firstWrite = calls.findIndex(c => !/^\s*CREATE/i.test(c.sql))
    expect(calls[firstWrite].sql).toMatch(/SET sent_at/)
    expect(calls[firstWrite].params[1]).toBe(SPEC.CLAIM_PER_TICK)
  })

  it('later never lands after the start', async () => {
    expect(snoozeAllowed(0, 601)).toBe(true)
    expect(snoozeAllowed(0, 600)).toBe(false)
    expect(snoozeAllowed(0, 10)).toBe(false)
    expect(SPEC.SNOOZE_MIN).toBe(10)

    const m = meeting()
    const { pool, calls } = stubPool(sql => {
      if (/WHERE tap_token = \$1/.test(sql)) return { rows: [asRow(m)] }
    })
    const tooClose = new Date(m.starts_at.getTime() - 5 * 60_000)
    await answerTap(pool, OWNER, 'later', m.tap_token, tooClose)
    expect(
      calls.some(c => /INSERT INTO agent_meeting_reminders/.test(c.sql))
    ).toBe(false)
    const inTime = new Date(m.starts_at.getTime() - 30 * 60_000)
    await answerTap(pool, OWNER, 'later', m.tap_token, inTime)
    const snooze = calls.find(c =>
      /INSERT INTO agent_meeting_reminders/.test(c.sql)
    )
    expect((snooze?.params[1] as Date).getTime()).toBe(
      inTime.getTime() + SPEC.SNOOZE_MIN * 60_000
    )
  })

  it('a second later never doubles the reminder', async () => {
    expect(snoozeAdds(0)).toBe(true)
    expect(snoozeAdds(1)).toBe(false)
    expect(snoozeAdds(2)).toBe(false)
    expect(SPEC.SNOOZES_PENDING_MAX).toBe(1)

    // Against answerTap: one snooze waits, so a second press adds nothing
    // and still answers "I'll remind you" with the settled card.
    const m = meeting()
    const inTime = new Date(m.starts_at.getTime() - 30 * 60_000)
    let waiting = 0
    const { pool, calls } = stubPool(sql => {
      if (/WHERE tap_token = \$1/.test(sql)) return { rows: [asRow(m)] }
      if (/count\(\*\)/.test(sql)) return { rows: [{ n: waiting }] }
      if (/INSERT INTO agent_meeting_reminders/.test(sql)) waiting++
    })
    const first = await answerTap(pool, OWNER, 'later', m.tap_token, inTime)
    const second = await answerTap(pool, OWNER, 'later', m.tap_token, inTime)
    const inserts = calls.filter(c =>
      /INSERT INTO agent_meeting_reminders/.test(c.sql)
    )
    expect(inserts).toHaveLength(1)
    expect(second.said).toBe(first.said)
    expect(second.markup).toEqual(first.markup)
    // Only the snooze counts: a planned reminder carries an offset.
    const count = calls.find(c => /count\(\*\)/.test(c.sql))!
    expect(count.sql).toMatch(/offset_min IS NULL/)
    expect(count.sql).toMatch(/sent_at IS NULL/)
  })

  it('the follow-up comes after the end, and never for a cancelled meeting', async () => {
    expect(followsUp(1300, 1000, false)).toBe(true)
    expect(followsUp(1299, 1000, false)).toBe(false)
    expect(followsUp(5000, 1000, true)).toBe(false)

    const now = new Date('2026-10-02T13:10:00Z')
    const done = meeting()
    const cancelled = meeting({ id: 8, status: 'cancelled' })
    const { pool } = stubPool(sql => {
      if (/SET sent_at/.test(sql))
        return {
          rows: [
            {
              id: 1,
              meeting_id: 7,
              kind: 'followup',
              fire_at: new Date('2026-10-02T13:05:00Z'),
            },
            {
              id: 2,
              meeting_id: 8,
              kind: 'followup',
              fire_at: new Date('2026-10-02T13:05:00Z'),
            },
          ],
        }
      if (/WHERE id = ANY/.test(sql))
        return { rows: [asRow(done), asRow(cancelled)] }
    })
    const markups: any[] = []
    const r = await sweepMeetings(pool, {
      now,
      send: async (_id, _t, mk) => void markups.push(mk),
    })
    expect(r.sent).toBe(1)
    expect(r.skipped).toBe(1)
    const data = markups[0].inline_keyboard
      .flat()
      .map((b: any) => b.callback_data)
    expect(data).toEqual([
      callbackData('done', done.tap_token),
      callbackData('missed', done.tap_token),
    ])
  })

  it("only the owner's tap counts", async () => {
    expect(mayAnswer(true, true)).toBe(true)
    expect(mayAnswer(false, true)).toBe(false)
    expect(mayAnswer(true, false)).toBe(false)
    expect(mayAnswer(false, false)).toBe(false)
    expect(SPEC.OWNER_ONLY).toBe(true)

    const m = meeting()
    const { pool, calls } = stubPool(sql => {
      if (/WHERE tap_token = \$1/.test(sql)) return { rows: [asRow(m)] }
    })
    const r = await answerTap(pool, STRANGER, 'cancel', m.tap_token)
    expect(r.markup).toBeUndefined()
    expect(calls.some(c => /^\s*(UPDATE|DELETE|INSERT)/i.test(c.sql))).toBe(
      false
    )
    const own = await answerTap(pool, OWNER, 'cancel', m.tap_token)
    expect(own.markup).toBeDefined()
    expect(
      calls.some(c => /SET status = \$3/.test(c.sql) && c.params[1] === OWNER)
    ).toBe(true)
  })

  it("the longest button still fits Telegram's callback limit", () => {
    expect(SPEC.TOKEN_CHARS).toBeGreaterThanOrEqual(SPEC.TOKEN_BYTES)
    expect(
      4 + SPEC.LONGEST_ACTION_CHARS + 1 + SPEC.TOKEN_CHARS
    ).toBeLessThanOrEqual(SPEC.CALLBACK_MAX_BYTES)
    const token = newToken()
    expect(token).toHaveLength(SPEC.TOKEN_CHARS)
    expect(SPEC.CALLBACK_PREFIX).toBe('mtg:')
    const longest = Buffer.byteLength(callbackData('cancel', token))
    expect(longest).toBeLessThanOrEqual(SPEC.CALLBACK_MAX_BYTES)
    for (const kind of ['created', 'moved', 'before', 'followup'] as const) {
      for (const b of cardMarkup(
        meeting({ tap_token: token }),
        kind
      ).inline_keyboard.flat()) {
        if (b.callback_data)
          expect(
            Buffer.byteLength(String(b.callback_data))
          ).toBeLessThanOrEqual(SPEC.CALLBACK_MAX_BYTES)
      }
    }
  })

  it('a duration is clamped, not refused', () => {
    expect(clampDuration(0)).toBe(60)
    expect(clampDuration(1)).toBe(5)
    expect(clampDuration(45)).toBe(45)
    expect(clampDuration(5000)).toBe(720)
    expect(clampDuration(undefined)).toBe(SPEC.DURATION_DEFAULT_MIN)
  })

  it('the sweep is a cheap tick over a bounded claim', async () => {
    expect(SPEC.TICK_S).toBe(60)
    expect(SPEC.FIRST_TICK_S).toBeGreaterThanOrEqual(SPEC.TICK_S)
    expect(SPEC.CLAIM_PER_TICK).toBeGreaterThanOrEqual(1)
    expect(SPEC.MAX_UPCOMING).toBeGreaterThanOrEqual(1)
    expect(SPEC.MAX_AHEAD_DAYS).toBeGreaterThanOrEqual(365)
    expect(SPEC.RUN_LIVE).toBe(false)
    // Nothing due: one claim, no reading of meetings, no send.
    const { pool, calls } = stubPool(() => ({ rows: [] }))
    const send = vi.fn()
    expect(await sweepMeetings(pool, { send })).toEqual({
      claimed: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
    })
    expect(calls.filter(c => !/^\s*CREATE/i.test(c.sql))).toHaveLength(1)
    expect(send).not.toHaveBeenCalled()
  })
})

describe('meetings: what the spec leaves to the host', () => {
  it('a time without an offset needs a zone, and a zone is honoured', () => {
    expect('error' in parseStart('2026-10-02T15:00')).toBe(true)
    expect(parseStart('2026-10-02T15:00+03:00')).toEqual({
      ms: Date.parse('2026-10-02T12:00:00Z'),
    })
    expect(parseStart('2026-10-02T15:00', 'Europe/Moscow')).toEqual({
      ms: Date.parse('2026-10-02T12:00:00Z'),
    })
    // Across a DST change: New York is UTC-4 in October, UTC-5 in December.
    expect(parseStart('2026-12-02 09:30', 'America/New_York')).toEqual({
      ms: Date.parse('2026-12-02T14:30:00Z'),
    })
    expect('error' in parseStart('2026-10-02T15:00', 'Mars/Olympus')).toBe(true)
    expect('error' in parseStart('tomorrow at 3')).toBe(true)
  })

  it("the card escapes the person's words and shows the time in the reader's zone", () => {
    const text = cardText(meeting(), 'before')
    expect(text).toContain('Call &lt;with&gt; &amp; co')
    expect(text).not.toContain('<with>')
    const unix = Date.parse('2026-10-02T12:00:00Z') / 1000
    expect(text).toContain(
      `<tg-time unix="${unix}" format="wDT">2026-10-02 12:00 UTC</tg-time>`
    )
    expect(cardText(meeting(), 'before', { withTime: false })).not.toContain(
      'tg-time'
    )
  })

  it('online gets join and copy, a place gets directions, every card a calendar', () => {
    const online = cardMarkup(meeting(), 'created').inline_keyboard.flat()
    expect(online.some(b => b.url === 'https://meet.example.com/abc')).toBe(
      true
    )
    expect(
      online.some(
        b => (b.copy_text as any)?.text === 'https://meet.example.com/abc'
      )
    ).toBe(true)
    expect(
      online.some(b => String(b.url).includes(`${SPEC.ICS_PATH}?t=`))
    ).toBe(true)
    expect(
      online.find(
        b => b.callback_data === callbackData('ok', meeting().tap_token)
      )?.style
    ).toBe('success')
    const offline = cardMarkup(
      meeting({ mode: 'offline', url: null, place: 'Tverskaya 1' }),
      'before'
    ).inline_keyboard.flat()
    expect(
      offline.some(b =>
        String(b.url).startsWith('https://www.google.com/maps/search/')
      )
    ).toBe(true)
    expect(
      offline.some(
        b => b.callback_data === callbackData('later', meeting().tap_token)
      )
    ).toBe(true)
  })

  it('an old Bot API host that cannot parse the time still gets the reminder', async () => {
    const texts: string[] = []
    let first = true
    await sendCard(meeting(), 'before', {
      send: async (_id, text) => {
        texts.push(text)
        if (first) {
          first = false
          throw new Error("Telegram 400: Bad Request: can't parse entities")
        }
      },
    })
    expect(texts).toHaveLength(2)
    expect(texts[1]).not.toContain('tg-time')
    await expect(
      sendCard(meeting(), 'before', {
        send: async () => Promise.reject(new Error('Telegram 403: blocked')),
      })
    ).rejects.toThrow('403')
  })

  it('the calendar file is RFC 5545: CRLF, escaped, folded, one alarm', () => {
    const ics = icsFor(
      meeting({ title: 'a, b; c' + 'x'.repeat(100) }),
      new Date('2026-10-01T00:00:00Z')
    )
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics).toContain('DTSTART:20261002T120000Z')
    expect(ics).toContain('SUMMARY:a\\, b\\; c')
    expect(ics).toContain(`TRIGGER:-PT${SPEC.REMIND_SOON_MIN}M`)
    for (const line of ics.split('\r\n'))
      expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75)
  })

  it('every tool reads and writes only the caller', async () => {
    expect(MEETING_TOOLS.map(t => t.name)).toEqual([
      SPEC.TOOL_CREATE,
      SPEC.TOOL_LIST,
      SPEC.TOOL_UPDATE,
      SPEC.TOOL_CANCEL,
      SPEC.TOOL_ANSWER,
    ])
    for (const t of MEETING_TOOLS)
      expect(JSON.stringify(t.parameters)).not.toMatch(/telegram_id/)
    const { pool, calls } = stubPool(() => ({ rows: [] }))
    const byName = Object.fromEntries(MEETING_TOOLS.map(t => [t.name, t]))
    await byName[SPEC.TOOL_LIST].handler({}, { telegramId: OWNER, pool } as any)
    await byName[SPEC.TOOL_UPDATE].handler({ id: 3, title: 'x' }, {
      telegramId: OWNER,
      pool,
    } as any)
    await byName[SPEC.TOOL_CANCEL].handler({ id: 3 }, {
      telegramId: OWNER,
      pool,
    } as any)
    for (const c of calls.filter(c => !/^\s*CREATE/i.test(c.sql))) {
      expect(c.sql).toMatch(/telegram_id = \$|telegram_id=\$/)
      expect(c.params).toContain(OWNER)
    }
  })

  it('a meeting is created with its reminders and the follow-up, and the card goes out', async () => {
    const now = Date.now()
    const starts = new Date(now + 3 * 24 * 3600 * 1000)
    const { pool, calls } = stubPool((sql, params) => {
      if (/count\(\*\)/.test(sql)) return { rows: [{ n: 0 }] }
      if (/INSERT INTO agent_meetings/.test(sql))
        return {
          rows: [
            {
              id: 11,
              telegram_id: params[0],
              title: params[1],
              starts_at: params[2],
              ends_at: params[3],
              mode: params[4],
              place: params[5],
              url: params[6],
              notes: params[7],
              lang: params[8],
              status: 'planned',
              tap_token: params[9],
              ics_token: params[10],
            },
          ],
        }
    })
    const create = MEETING_TOOLS.find(t => t.name === SPEC.TOOL_CREATE)!
    const out: any = await create.handler(
      {
        title: 'Coffee',
        starts_at: starts.toISOString(),
        mode: 'offline',
        place: 'Tverskaya 1',
        duration_min: 30,
      },
      { telegramId: OWNER, pool } as any
    )
    expect(out.ok).toBe(true)
    expect(out.reminders).toHaveLength(3)
    expect(out.card_sent).toBe(true)
    const inserts = calls.filter(c =>
      /INSERT INTO agent_meeting_reminders/.test(c.sql)
    )
    expect(
      inserts.map(c => (/'followup'/.test(c.sql) ? 'followup' : 'before'))
    ).toEqual(['before', 'before', 'before', 'followup'])
    const meetingInsert = calls.find(c =>
      /INSERT INTO agent_meetings/.test(c.sql)
    )!
    expect(meetingInsert.params[9]).not.toBe(meetingInsert.params[10])

    const refused: any = await create.handler(
      {
        title: 'x',
        starts_at: starts.toISOString(),
        url: 'http://insecure.example',
      },
      { telegramId: OWNER, pool } as any
    )
    expect(refused.ok).toBe(false)
  })
})
