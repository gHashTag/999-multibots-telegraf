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

const down = (why = 'Not Found'): BotHealth => ({
  bot: 'NeuroLenaAssistant_bot',
  alive: false,
  why,
  pendingUpdates: null,
  checkedAt: NOW.toISOString(),
})

const up = (): BotHealth => ({
  bot: 'NeuroLenaAssistant_bot',
  alive: true,
  why: null,
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
    const alarms = await watchOnce(d)
    expect(alarms).toHaveLength(1)
    expect(alarms[0].ownerId).toBe(OWNER)
    expect(written[0].alarmed).toBe(true)
  })

  it('says nothing at all when everything answers', async () => {
    const { deps: d } = deps(FRESH, true)
    expect(await watchOnce(d)).toEqual([])
  })

  it('an unavailable list of owners is silence, not "all fine"', async () => {
    const alarms = await watchOnce({
      owners: async () => {
        throw new Error('avatars replied 503')
      },
      tokenForBot: async () => 'token',
      readState: async () => FRESH,
      writeState: async () => {},
      fetchImpl: answers(false),
      now: () => NOW,
    })
    expect(alarms).toEqual([])
  })

  it('a bot whose token is missing on OUR side still reaches the owner', async () => {
    // It is our gap, and the owner is the one who can ask us about it -- the
    // exact case that hid for nineteen days. The text comes from
    // owner-bot-health and names the side.
    const { deps: d } = deps(
      { misses: FAILURES_BEFORE_ALARM - 1, alarmed: false, since: null },
      false
    )
    const alarms = await watchOnce({ ...d, tokenForBot: async () => null })
    expect(alarms).toHaveLength(1)
    expect(alarms[0].text).toContain('токена этого бота нет на сервере')
  })
})
