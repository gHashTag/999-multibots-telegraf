/**
 * THE READER OF HEARTBEATS, TESTED ON INVENTED JOURNALS.
 *
 * Every state worth having costs a day of waiting to arrange in production:
 * "silent for two heartbeats" needs a watch to actually stop, and "owes money"
 * needs somebody to pay and not be credited. So the judgement is a pure
 * function over rows.
 *
 * The distinction that matters most is between NEVER REPORTED and OVERDUE. A
 * watch deployed an hour ago has missed nothing; calling that a failure on the
 * first morning is how an alarm gets ignored by the second.
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import path from 'node:path'

const { judge, OVERDUE_MS, CHANNELS } = createRequire(__filename)(
  path.join(__dirname, 'watches.cjs')
) as {
  judge: (
    events: Array<{ kind: string; at: string; what: string }>,
    channel: string,
    now: number
  ) => { state: string; last: number | null; owed: string | null }
  OVERDUE_MS: number
  CHANNELS: string[]
}

const NOW = Date.parse('2026-09-20T09:00:00.000Z')
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString()

/*
 * THE FIELD IS `note`, WHICH IS NOT WHAT THE WRITER CALLS IT.
 *
 * The bot posts {kind, who, what, severity}; the journal's own reader returns
 * the text under `note`. The first version of this tool read `what`, got an
 * empty string for every row, and reported both channels as "never reported"
 * while the heartbeats sat in the journal -- a reader wrong about a system
 * that worked. So the fixtures below are shaped like the READER's answer.
 */
const beat = (channel: string, h: number, examined = 2) => ({
  kind: 'watch-quiet',
  at: hoursAgo(h),
  note: `${channel}: проверено счетов ${examined}, не зачисленных нет`,
})

const alarm = (channel: string, h: number) => ({
  kind: 'payment-unclaimed',
  at: hoursAgo(h),
  note: `${channel}: 1 оплачено у провайдера, 43⭐ не начислено`,
})

describe('are the money watches alive', () => {
  it('calls a channel alive when its heartbeat is recent', () => {
    const r = judge([beat('TON', 3)], 'TON', NOW)
    expect(r.state).toBe('alive')
  })

  it('calls it silent after two missed heartbeats', () => {
    const r = judge([beat('TON', 45)], 'TON', NOW)
    expect(r.state).toBe('overdue')
    expect(OVERDUE_MS).toBe(40 * 3_600_000)
  })

  /*
   * ONE MISSED BEAT IS A DEPLOY, NOT A DEATH. The heartbeat is 20 hours, so a
   * restart, a redeploy or a clock edge can push one past its slot.
   */
  it('forgives a single missed beat', () => {
    expect(judge([beat('TON', 30)], 'TON', NOW).state).toBe('alive')
  })

  it('never confuses "has not reported yet" with "has stopped"', () => {
    const r = judge([], 'TON', NOW)
    expect(r.state).toBe('never')
    expect(r.last).toBeNull()
  })

  /*
   * MONEY OUTRANKS HEALTH. A channel that owes somebody is not "alive and
   * well" merely because it also wrote a heartbeat.
   */
  it('reports money owed above a heartbeat, however recent', () => {
    const r = judge([beat('TON', 5), alarm('TON', 2)], 'TON', NOW)
    expect(r.state).toBe('owes')
    expect(r.owed).toContain('не начислено')
  })

  it('goes back to alive once a later heartbeat follows the alarm', () => {
    const r = judge([alarm('TON', 30), beat('TON', 2)], 'TON', NOW)
    expect(r.state).toBe('alive')
  })

  /*
   * THE CHANNELS ARE JUDGED APART. One dead watch must not hide behind the
   * other's health -- which is exactly what a single shared heartbeat would
   * allow.
   */
  it('does not let one channel answer for another', () => {
    const rows = [beat('Robokassa', 1)]
    expect(judge(rows, 'Robokassa', NOW).state).toBe('alive')
    expect(judge(rows, 'TON', NOW).state).toBe('never')
  })

  /*
   * AND IT STILL READS A ROW THAT USES THE WRITER'S NAME. The two spellings
   * are one line apart in the code and a week apart in time; a reader that
   * understands only the newest one goes blind on the first old row.
   */
  it('reads the text under either name', () => {
    const asWritten = [
      { kind: 'watch-quiet', at: hoursAgo(2), what: 'TON: проверено счетов 2' },
    ]
    expect(judge(asWritten as never, 'TON', NOW).state).toBe('alive')
  })

  it('knows both channels it is meant to watch', () => {
    expect(CHANNELS).toEqual(['TON', 'Robokassa'])
  })
})
