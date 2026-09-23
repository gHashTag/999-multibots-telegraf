import { describe, expect, it, vi } from 'vitest'
import type { BotHealth } from './owner-bot-health'
import {
  decide,
  FAILURES_BEFORE_ALARM,
  FRESH,
  watchOnce,
  type WatchState,
} from './silence-watch'

/**
 * AN ALARM PEOPLE STILL BELIEVE IN A MONTH.
 *
 * The feature is easy; the ways it turns into noise are the whole design, and
 * each one below is a way this alarm would have been switched off:
 * repeating itself, firing on a blink, and blaming the owner for our own gap.
 */

const NOW = new Date('2026-09-23T12:00:00.000Z')
const OWNER = '144022504'

const down = (
  why = 'Not Found',
  side: BotHealth['side'] = 'telegram'
): BotHealth => ({
  bot: 'NeuroLenaAssistant_bot',
  alive: false,
  why,
  side,
  pendingUpdates: null,
  checkedAt: NOW.toISOString(),
})

const up = (): BotHealth => ({
  bot: 'NeuroLenaAssistant_bot',
  alive: true,
  why: null,
  side: null,
  pendingUpdates: 0,
  checkedAt: NOW.toISOString(),
})

describe('when to speak, and when to keep quiet', () => {
  it('says nothing on the first miss: a blink is not an outage', () => {
    const d = decide(FRESH, down(), OWNER, NOW)
    expect(d.alarm).toBeNull()
    expect(d.state.misses).toBe(1)
    // The clock starts now, so the eventual message can say how long.
    expect(d.state.since).toBe(NOW.toISOString())
  })

  it('speaks once the misses pile up, and names Telegram’s own reason', () => {
    let state: WatchState = FRESH
    let spoke = 0
    for (let i = 0; i < FAILURES_BEFORE_ALARM; i++) {
      const d = decide(state, down('Unauthorized'), OWNER, NOW)
      state = d.state
      if (d.alarm) {
        spoke++
        expect(d.alarm.kind).toBe('silent')
        expect(d.alarm.text).toContain('не отвечает')
        expect(d.alarm.text).toContain('Unauthorized')
        // The consequence, said plainly -- this is why it matters.
        expect(d.alarm.text).toContain('ответа не получают')
      }
    }
    expect(spoke).toBe(1)
  })

  it('does not repeat itself while the outage lasts', () => {
    let state: WatchState = {
      misses: 9,
      alarmed: true,
      since: NOW.toISOString(),
    }
    for (let i = 0; i < 20; i++) {
      const d = decide(state, down(), OWNER, NOW)
      state = d.state
      expect(d.alarm).toBeNull()
    }
  })

  it('says when it comes back, with how long it was gone', () => {
    const since = '2026-09-22T12:00:00.000Z' // a day earlier
    const d = decide({ misses: 5, alarmed: true, since }, up(), OWNER, NOW)
    expect(d.alarm?.kind).toBe('back')
    expect(d.alarm?.text).toContain('снова отвечает')
    expect(d.alarm?.text).toContain('1 дн.')
    // And the slate is clean, so the next outage starts its own clock.
    expect(d.state).toEqual(FRESH)
  })

  it('never labels our own gap as Telegram’s', () => {
    // The defect, in one line: the label was a constant. Whatever the reason,
    // the message said Telegram. Three owners received it live on 2026-09-23.
    let state: WatchState = FRESH
    const texts: string[] = []
    for (let i = 0; i < FAILURES_BEFORE_ALARM; i++) {
      const d = decide(
        state,
        down('токена нет на нашем сервере', 'ours'),
        OWNER,
        NOW
      )
      state = d.state
      if (d.alarm) texts.push(d.alarm.text)
    }
    expect(texts).toHaveLength(1)
    expect(texts[0]).toContain('Причина на нашей стороне')
    expect(texts[0]).not.toContain('со стороны Telegram')
  })

  it('names no culprit it cannot name', () => {
    // An unknown side is not a free pass to blame either party.
    let state: WatchState = FRESH
    let text = ''
    for (let i = 0; i < FAILURES_BEFORE_ALARM; i++) {
      const d = decide(state, down('что-то пошло не так', null), OWNER, NOW)
      state = d.state
      if (d.alarm) text = d.alarm.text
    }
    expect(text).toContain('Причина: что-то пошло не так')
    expect(text).not.toContain('со стороны Telegram')
    expect(text).not.toContain('на нашей стороне')
  })

  it('stays silent about a recovery nobody was told about', () => {
    // Two misses, then back: the owner never heard the alarm, so "it is back"
    // would be a message about nothing.
    const d = decide(
      { misses: 2, alarmed: false, since: NOW.toISOString() },
      up(),
      OWNER,
      NOW
    )
    expect(d.alarm).toBeNull()
    expect(d.state).toEqual(FRESH)
  })
})

describe('one tick over everybody', () => {
  const answers = (ok: boolean) =>
    vi.fn(async (url: string) => ({
      json: async () =>
        String(url).includes('getMe')
          ? ok
            ? { ok: true, result: { username: 'b1' } }
            : { ok: false, description: 'Not Found' }
          : { ok: true, result: { pending_update_count: 0 } },
    })) as unknown as typeof fetch

  const deps = (state: WatchState, ok: boolean) => {
    const written: WatchState[] = []
    return {
      written,
      deps: {
        owners: async () => [{ ownerId: OWNER, bots: ['b1'] }],
        tokenForBot: async () => 'token',
        readState: async () => state,
        writeState: async (_o: string, _b: string, s: WatchState) => {
          written.push(s)
        },
        fetchImpl: answers(ok),
        now: () => NOW,
      },
    }
  }

  it('raises the alarm on the third miss and remembers that it did', async () => {
    const { deps: d, written } = deps(
      {
        misses: FAILURES_BEFORE_ALARM - 1,
        alarmed: false,
        since: NOW.toISOString(),
      },
      false
    )
    const round = await watchOnce({ ...d, deliver: async () => true })
    expect(round.alarms).toHaveLength(1)
    expect(round.alarms[0].ownerId).toBe(OWNER)
    expect(written[0].alarmed).toBe(true)
    expect(round.delivered).toBe(1)
  })

  it('does not record "told" for a message that bounced', async () => {
    // The owner never started a chat with the platform bot, so Telegram
    // refuses. Writing alarmed=true here would mean this outage is never
    // announced again: the state would say they know.
    const { deps: d, written } = deps(
      {
        misses: FAILURES_BEFORE_ALARM - 1,
        alarmed: false,
        since: NOW.toISOString(),
      },
      false
    )
    const round = await watchOnce({ ...d, deliver: async () => false })
    expect(round.alarms).toHaveLength(1)
    expect(round.undelivered).toBe(1)
    expect(written[0].alarmed).toBe(false)
    // The misses are kept, so the next tick speaks again immediately.
    expect(written[0].misses).toBe(FAILURES_BEFORE_ALARM)
  })

  it('counts what it looked at, so a quiet tick is not an absent one', async () => {
    // Twenty minutes of the first live run went on "is it running or is
    // everything simply fine?" -- the log could not tell them apart.
    const { deps: d } = deps(FRESH, true)
    const round = await watchOnce(d)
    expect(round.alarms).toEqual([])
    expect(round.checked).toBe(1)
    expect(round.silent).toBe(0)
  })

  it('an unavailable list of owners is silence, not "all fine"', async () => {
    const round = await watchOnce({
      owners: async () => {
        throw new Error('avatars replied 503')
      },
      tokenForBot: async () => 'token',
      readState: async () => FRESH,
      writeState: async () => {},
      fetchImpl: answers(false),
      now: () => NOW,
    })
    expect(round.alarms).toEqual([])
    // And it says it looked at nothing, rather than at everything happily.
    expect(round.checked).toBe(0)
  })

  it('a bot whose token is missing on OUR side still reaches the owner', async () => {
    // It is our gap, and the owner is the one who can ask us about it -- the
    // exact case that hid for nineteen days. The text comes from
    // owner-bot-health and names the side.
    const { deps: d } = deps(
      { misses: FAILURES_BEFORE_ALARM - 1, alarmed: false, since: null },
      false
    )
    const round = await watchOnce({
      ...d,
      tokenForBot: async () => null,
      deliver: async () => true,
    })
    const alarms = round.alarms
    expect(alarms).toHaveLength(1)
    expect(round.silent).toBe(1)
    expect(alarms[0].text).toContain('токена этого бота нет на нашем сервере')
    // AND THE LABEL AGREES WITH THE REASON. On the first live run it did not:
    // three owners were told Telegram was the cause of a gap that was ours,
    // which sends a person to fix settings that are fine.
    expect(alarms[0].text).toContain('Причина на нашей стороне')
    expect(alarms[0].text).not.toContain('со стороны Telegram')
    expect(alarms[0].text).toContain('напиши нам')
  })
})
