import { describe, it, expect, beforeEach } from 'vitest'
import { report, reportText } from './src/hive/queen-report'
import { record, forgetTable } from './src/hive/journal'

/**
 * THE QUEEN'S REPORT -- CHECKS.
 *
 * What is checked here is not the text but the behaviour of the cursor: it
 * decides whether the owner sees an event at all. Two mistakes in it cost
 * differently, and both are silent:
 *
 *   the cursor moved but the report did not go out -- events lost forever;
 *   the cursor did not move but the report went out -- the same report every
 *   half hour, and the owner stops reading them.
 */

function fakePool({
  stamp = 0,
  brokenDate = false,
}: { stamp?: number; brokenDate?: boolean } = {}) {
  const events: any[] = []
  const cursors = new Map<string, number>()
  // When the cursor last moved. A real database sets `now()`; here the time is
  // supplied from outside so the gap can be checked without waiting.
  const stamps = new Map<string, number>()
  let n = 1
  return {
    events,
    cursors,
    stamps,
    async query(sql: string, params: any[] = []) {
      if (/^\s*CREATE/i.test(sql)) return { rows: [] }

      if (/INSERT INTO hive_events/i.test(sql)) {
        const [kind, who, bot, amount, what, severity] = params
        events.push({
          id: n++,
          kind,
          who,
          bot,
          amount,
          what,
          severity,
          at: new Date().toISOString(),
        })
        return { rows: [] }
      }
      if (/MAX\(id\)/i.test(sql)) {
        return {
          rows: [
            { newest: events.length ? Math.max(...events.map(e => e.id)) : 0 },
          ],
        }
      }
      if (/SELECT last_id, updated_at FROM hive_report_cursor/i.test(sql)) {
        const v = cursors.get(params[0])
        return {
          rows:
            v === undefined
              ? []
              : [
                  {
                    last_id: v,
                    updated_at: brokenDate
                      ? 'not-a-date'
                      : new Date(stamps.get(params[0]) ?? stamp),
                  },
                ],
        }
      }
      if (/INSERT INTO hive_report_cursor/i.test(sql)) {
        cursors.set(params[0], Number(params[1]))
        stamps.set(params[0], stamp)
        return { rows: [] }
      }
      if (/FROM hive_events/i.test(sql)) {
        // Keeper: everything. The report only ever reads as a keeper.
        return {
          rows: [...events]
            .sort((a, b) => b.id - a.id)
            .slice(0, Number(params[0])),
        }
      }
      throw new Error(`fake pool does not know this query: ${sql}`)
    },
  }
}

function postman() {
  const sent: Array<{ who: string; text: string }> = []
  let working = true
  return {
    sent,
    breakIt() {
      working = false
    },
    async send(who: string, text: string) {
      if (!working) return false
      sent.push({ who, text })
      return true
    },
  }
}

/**
 * Cursor checks run WITHOUT the gap between reports.
 *
 * The gap is a separate property with its own block below. Mixing them would
 * give tests that go red for two different reasons and do not say which.
 */
const NO_GAP = { gapMinutes: 0 }

beforeEach(() => {
  forgetTable()
  process.env.HIVE_KEEPERS = '144022504'
})

describe('queen report: the cursor', () => {
  it('the first run sends nothing -- otherwise a wall of text on day one', async () => {
    const pool = fakePool()
    for (let i = 0; i < 30; i++)
      await record(pool, { kind: 'sign-in', who: '7' })
    const post = postman()

    const out = await report(pool, post.send, NO_GAP)

    expect(out.what).toBe('first run')
    expect(post.sent).toHaveLength(0)
    expect(pool.cursors.get('144022504')).toBe(30)
  })

  it('the second time only the new arrives', async () => {
    const pool = fakePool()
    await record(pool, { kind: 'sign-in', who: '7' })
    const post = postman()
    await report(pool, post.send, NO_GAP) // first run, cursor = 1

    await record(pool, { kind: 'payment', who: '7', amount: 500 })
    const out = await report(pool, post.send, NO_GAP)

    expect(out).toEqual({ what: 'sent', events: 1 })
    expect(post.sent).toHaveLength(1)
    expect(post.sent[0].text).toContain('оплатили')
    expect(post.sent[0].text).not.toContain('вошли в приложение')
  })

  it('silence is not sent -- otherwise the channel becomes noise', async () => {
    const pool = fakePool()
    await record(pool, { kind: 'sign-in', who: '7' })
    const post = postman()
    await report(pool, post.send, NO_GAP)

    const out = await report(pool, post.send, NO_GAP)

    expect(out.what).toBe('nothing to say')
    expect(post.sent).toHaveLength(0)
  })

  /*
   * The cursor lands on the LATEST event sent, not the first.
   *
   * A separate case, because with one new event the minimum and the maximum
   * coincide, and swapping `Math.max` for `Math.min` would pass unnoticed --
   * which is exactly what happened on the first mutation run. A silent error:
   * the owner would get the same events again in every following report.
   */
  it('after a report about several events the next report is empty', async () => {
    const pool = fakePool()
    await record(pool, { kind: 'sign-in', who: '7' })
    const post = postman()
    await report(pool, post.send, NO_GAP)

    await record(pool, { kind: 'payment', who: '7' })
    await record(pool, { kind: 'created', who: '7' })
    await record(pool, { kind: 'published', who: '7' })
    expect((await report(pool, post.send, NO_GAP)).events).toBe(3)

    const out = await report(pool, post.send, NO_GAP)
    expect(out.what).toBe('nothing to say')
    expect(post.sent).toHaveLength(1)
  })

  it('NOT delivered -- the cursor stays put and the events are not lost', async () => {
    const pool = fakePool()
    await record(pool, { kind: 'sign-in', who: '7' })
    const post = postman()
    await report(pool, post.send, NO_GAP)
    const before = pool.cursors.get('144022504')

    await record(pool, { kind: 'payment', who: '7' })
    post.breakIt()
    const out = await report(pool, post.send, NO_GAP)

    expect(out).toEqual({ what: 'not sent', events: 1 })
    expect(pool.cursors.get('144022504')).toBe(before)
  })

  it('once the link is repaired the lost event arrives with the new one', async () => {
    const pool = fakePool()
    await record(pool, { kind: 'sign-in', who: '7' })
    const brokenPost = postman()
    await report(pool, brokenPost.send, NO_GAP)

    await record(pool, { kind: 'payment', who: '7' })
    brokenPost.breakIt()
    await report(pool, brokenPost.send, NO_GAP)

    const goodPost = postman()
    await record(pool, { kind: 'created', who: '7' })
    const out = await report(pool, goodPost.send, NO_GAP)

    expect(out).toEqual({ what: 'sent', events: 2 })
    expect(goodPost.sent[0].text).toContain('оплатили')
    expect(goodPost.sent[0].text).toContain('создали материал')
  })

  it('without HIVE_KEEPERS there is nobody to report to, and it says so', async () => {
    process.env.HIVE_KEEPERS = ''
    process.env.OWNER_TELEGRAM_ID = ''
    const pool = fakePool()
    await record(pool, { kind: 'sign-in', who: '7' })
    const post = postman()

    const out = await report(pool, post.send, NO_GAP)

    expect(out.what).toBe('no keepers')
    expect(post.sent).toHaveLength(0)
  })

  it('every keeper carries their own cursor', async () => {
    process.env.HIVE_KEEPERS = '1,2'
    const pool = fakePool()
    await record(pool, { kind: 'sign-in', who: '7' })
    const post = postman()
    await report(pool, post.send, NO_GAP)

    await record(pool, { kind: 'payment', who: '7' })
    await report(pool, post.send, NO_GAP)

    expect(post.sent.map(s => s.who).sort()).toEqual(['1', '2'])
  })
})

/**
 * THE GAP: URGENT NOW, ORDINARY IN A BATCH.
 *
 * The owner asked to "react in time". That is about alarms: a guessed code, a
 * lost payment, a forged signature. The ordinary life of a platform with 2380
 * people, sent immediately, would turn the channel into a stream -- and a
 * stream gets skimmed right up to the day something important is in it.
 */
describe('queen report: the gap', () => {
  it('ordinary events wait for the gap rather than flying out at once', async () => {
    const pool = fakePool({ stamp: 1_000_000 })
    const post = postman()
    await report(pool, post.send, { now: 1_000_000 })

    await record(pool, { kind: 'sign-in', who: '7' })
    // An hour has passed against a three-hour gap.
    const out = await report(pool, post.send, { now: 1_000_000 + 3600_000 })

    expect(out.what).toBe('too soon')
    expect(post.sent).toHaveLength(0)
  })

  it('an alarm does not wait for the gap', async () => {
    const pool = fakePool({ stamp: 1_000_000 })
    const post = postman()
    await report(pool, post.send, { now: 1_000_000 })

    await record(pool, {
      kind: 'code-refused',
      severity: 'alarm',
      what: 'exhausted',
    })
    const out = await report(pool, post.send, { now: 1_000_000 + 60_000 })

    expect(out.what).toBe('sent')
    expect(post.sent[0].text).toContain('не подошёл код входа')
  })

  it('when the gap has passed everything accumulated arrives', async () => {
    const pool = fakePool({ stamp: 1_000_000 })
    const post = postman()
    await report(pool, post.send, { now: 1_000_000 })

    await record(pool, { kind: 'sign-in', who: '7' })
    await record(pool, { kind: 'created', who: '7' })
    const out = await report(pool, post.send, { now: 1_000_000 + 4 * 3600_000 })

    expect(out).toEqual({ what: 'sent', events: 2 })
  })

  /*
   * An unreadable timestamp means "long ago", not "just now".
   *
   * The difference looks small and costs a lot: with "just now" the gap would
   * NEVER expire and reports would switch off forever -- silently, without a
   * single error in the log. With "long ago" the worst that happens is one
   * extra report. A mutation in that direction survived the first run.
   */
  it('an unreadable timestamp does not switch reports off forever', async () => {
    /*
     * The REAL current time, and that is essential.
     *
     * It first read 1_000_000 -- minute sixteen of 1970, relative to which
     * "long ago" never arrives; the test failed against correct code. Then
     * 1_800_000_000_000 -- a date in the future, relative to which "long ago"
     * always arrives, and the mutation passed unnoticed again. The property is
     * only testable when the test clock and the mutation's clock are on the
     * same scale.
     */
    const now = Date.now()
    const pool = fakePool({ brokenDate: true })
    const post = postman()
    await report(pool, post.send, { now })

    await record(pool, { kind: 'sign-in', who: '7' })
    const out = await report(pool, post.send, { now: now + 60_000 })

    expect(out.what).toBe('sent')
  })

  it('"too soon" does not move the cursor -- the event arrives later, not never', async () => {
    const pool = fakePool({ stamp: 1_000_000 })
    const post = postman()
    await report(pool, post.send, { now: 1_000_000 })
    const before = pool.cursors.get('144022504')

    await record(pool, { kind: 'sign-in', who: '7' })
    await report(pool, post.send, { now: 1_000_000 + 60_000 })

    expect(pool.cursors.get('144022504')).toBe(before)
  })
})

describe('queen report: a person reads the text', () => {
  const anEvent = (kind: string, severity = 'normal', what?: string) => ({
    id: 1,
    kind,
    who: '7',
    bot: null,
    amount: null,
    what: what ?? null,
    severity,
    at: new Date().toISOString(),
  })

  it('kinds are named in words, not in log fragments', () => {
    const t = reportText([anEvent('code-refused'), anEvent('tokens-spent')])
    expect(t).toContain('не подошёл код входа')
    expect(t).toContain('потратили токены')
    expect(t).not.toMatch(/code-refused/)
  })

  it('alarms are pulled out separately, otherwise they cannot be found', () => {
    const t = reportText([
      anEvent('sign-in'),
      anEvent('code-refused', 'alarm', 'exhausted'),
    ])
    expect(t).toContain('Требует внимания')
    expect(t).toMatch(/exhausted/)
  })

  /*
   * LINES are counted, not the presence of the "and N more" tail.
   *
   * The first version checked only the tail -- and the mutation that removed
   * `slice(0, 5)` survived: all nine were printed and the "and 4 more" line
   * still stood next to them. Checking presence does not replace checking
   * quantity.
   */
  it('a long alarm list is capped at five and says how many are left', () => {
    const t = reportText(
      Array.from({ length: 9 }, () => anEvent('code-refused', 'alarm'))
    )
    const listed = t
      .split('\n')
      .filter(l => /^ {2}\d{2}\.\d{2}/.test(l) || /^ {2}\d{2}:\d{2}/.test(l))
    expect(listed).toHaveLength(5)
    expect(t).toContain('и ещё 4')
  })

  it('Russian numerals agree: 1 event, 2 events, 5 events', () => {
    expect(reportText([anEvent('sign-in')])).toContain('1 событие ')
    expect(reportText(Array(2).fill(anEvent('sign-in')))).toContain(
      '2 события '
    )
    expect(reportText(Array(5).fill(anEvent('sign-in')))).toContain(
      '5 событий '
    )
    expect(reportText(Array(11).fill(anEvent('sign-in')))).toContain(
      '11 событий '
    )
    expect(reportText(Array(21).fill(anEvent('sign-in')))).toContain(
      '21 событие '
    )
  })
})

/*
 * AN ALARM NAMES ITS SUBJECT.
 *
 * The tally above is deliberately nameless -- nobody wants twenty names under
 * "signed in". An alarm is the opposite: "payment forged" without a person is
 * a line that sends the reader to the agent to ask the one thing it could
 * have said.
 */
describe('the alarm line says with whom', () => {
  const at = '2026-09-17T14:32:00.000Z'
  const row = (over: Record<string, unknown> = {}) =>
    ({
      id: 1,
      kind: 'payment-forged',
      who: '900000077',
      bot: null,
      amount: null,
      what: 'подпись не сошлась',
      severity: 'alarm',
      at,
      ...over,
    }) as never

  it('puts the subject between the kind and the note', () => {
    const text = reportText([row()])
    expect(text).toContain('у 900000077')
    expect(text).toContain('подпись не сошлась')
    expect(text.indexOf('у 900000077')).toBeLessThan(
      text.indexOf('подпись не сошлась')
    )
  })

  /*
   * Some alarms are about the system rather than a person -- the seller has
   * stopped, a disk is full. A dangling "у" with nothing after it would be
   * worse than no clause.
   */
  it('says nothing when the alarm has no subject', () => {
    const text = reportText([row({ who: null })])
    expect(text).not.toContain('у ')
    expect(text).toContain('подпись не сошлась')
  })

  it('an empty subject is treated as no subject', () => {
    expect(reportText([row({ who: '   ' })])).not.toContain('у ')
  })

  it('ordinary events stay nameless in the tally', () => {
    const text = reportText([row({ kind: 'sign-in', severity: 'normal' })])
    expect(text).not.toContain('900000077')
  })
})
