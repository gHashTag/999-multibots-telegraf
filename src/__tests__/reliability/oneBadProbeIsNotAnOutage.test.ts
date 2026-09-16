import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * ONE FAILED PROBE WAS AN OUTAGE, AND AN OUTAGE IS A PUSH NOTIFICATION.
 *
 * `logger.error` is not a severity adjective in this process, it is a route:
 * winston forwards every error to the owner's Telegram (utils/logger.ts binds
 * the transport at level 'error'). The health monitor declared a provider DOWN
 * on a single sample -- one 10s timeout, one 502 from an edge node -- and that
 * single sample cost THREE messages: the winston page, a second and entirely
 * unthrottled message through notifyAdmin, and then "recovered" on the next
 * poll. The provider was back five minutes later and there was nothing for
 * anybody to do at 3am.
 *
 * These tests drive the real checkAllProviders with a stubbed fetch and COUNT
 * what reaches each channel. They are deliberately not source greps: the only
 * thing worth pinning is how many times the owner's phone lights up.
 *
 * The floor test at the bottom is what stops the rest passing vacuously -- with
 * HEALTH_FAILURE_THRESHOLD=1 the very same probe failure must still page, which
 * proves the silence above comes from the threshold and not from a harness that
 * never ran the probe or never wired the logger.
 */

const log = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}))
vi.mock('@/utils/logger', () => ({ logger: log, default: log }))

// Park the other three so the count belongs to exactly one provider. Replicate
// is the one whose probe maps an HTTP status straight onto `available`.
const ENV: Record<string, string> = {
  HEALTH_SKIP_PROVIDERS: 'fal.ai,zai,elevenlabs',
  REPLICATE_API_TOKEN: 'test-replicate-token', // secret-guard-ok: invented fixture, never issued
  // notifyAdmin returns early without an address, and an early return would
  // make "no Telegram message was sent" true for the wrong reason.
  ADMIN_CHAT_ID: '-1002298297094',
  BOT_TOKEN_1: 'test-bot-token',
  HEALTH_PROBE_TIMEOUT_MS: '50',
}
const TOUCHED = [...Object.keys(ENV), 'HEALTH_FAILURE_THRESHOLD']
const saved: Record<string, string | undefined> = {}
const realFetch = global.fetch

/** A queue of probe answers; the last one repeats once the queue runs dry. */
function wireFetch(answers: Array<{ ok: boolean; status: number }>) {
  const urls: string[] = []
  let i = 0
  global.fetch = vi.fn(async (url: any) => {
    const u = String(url)
    urls.push(u)
    if (u.includes('api.telegram.org'))
      return { ok: true, status: 200, text: async () => 'ok' } as any
    const a = answers[Math.min(i++, answers.length - 1)]
    return {
      ok: a.ok,
      status: a.status,
      text: async () => '',
      json: async () => ({ character_limit: 1_000_000, character_count: 0 }),
    } as any
  }) as unknown as typeof fetch
  return {
    /** Messages the owner's chat actually received, on the second channel. */
    telegramSends: () =>
      urls.filter(u => u.includes('api.telegram.org')).length,
    probes: () => urls.filter(u => !u.includes('api.telegram.org')).length,
  }
}

/**
 * A FRESH MODULE IS A FRESH PROCESS.
 *
 * providerStatuses and the failure streaks are module-level, so re-importing
 * after vi.resetModules() is exactly what a redeploy or a crash-restart does to
 * them. That is how the restart case below is driven.
 */
async function freshMonitor() {
  vi.resetModules()
  return import('@/services/provider-health-monitor')
}

const UP = { ok: true, status: 200 }
const EDGE_502 = { ok: false, status: 502 }

beforeEach(() => {
  for (const k of TOUCHED) saved[k] = process.env[k]
  for (const [k, v] of Object.entries(ENV)) process.env[k] = v
  delete process.env.HEALTH_FAILURE_THRESHOLD
  log.error.mockClear()
  log.warn.mockClear()
  log.info.mockClear()
})

afterEach(() => {
  for (const k of TOUCHED) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
  global.fetch = realFetch
  vi.restoreAllMocks()
})

describe('a provider is not down because one probe said so', () => {
  it('a single failed probe wakes nobody, on either channel', async () => {
    const net = wireFetch([EDGE_502])
    const { checkAllProviders } = await freshMonitor()

    await checkAllProviders()

    expect(net.probes(), 'the probe did not run at all').toBe(1)
    expect(log.error, 'one 502 paged the owner').not.toHaveBeenCalled()
    expect(net.telegramSends(), 'notifyAdmin shouted past the pager').toBe(0)
    // The record is kept, it is just not an alarm.
    expect(log.warn).toHaveBeenCalledTimes(1)
    expect(String(log.warn.mock.calls[0][0])).toContain('unconfirmed')
  })

  it('but availability is honest at once -- routing must not wait for the pager', async () => {
    wireFetch([EDGE_502])
    const { checkAllProviders, isProviderAvailable } = await freshMonitor()

    const statuses = await checkAllProviders()

    // Debouncing `available` would keep sending real customers to a dead
    // provider for another five minutes. Only the paging is debounced.
    expect(statuses.replicate.available).toBe(false)
    expect(isProviderAvailable('replicate')).toBe(false)
  })

  it('a second consecutive failure pages, once, and says what happened', async () => {
    const net = wireFetch([EDGE_502])
    const { checkAllProviders } = await freshMonitor()

    await checkAllProviders()
    expect(log.error).not.toHaveBeenCalled()

    await checkAllProviders()
    expect(log.error, 'a confirmed outage must page').toHaveBeenCalledTimes(1)
    expect(net.telegramSends()).toBe(1)

    // `available: resp.ok` carried no reason and the owner's message read
    // "replicate — undefined". A page that cannot be acted on is noise.
    expect(String(log.error.mock.calls[0][0])).toContain('DOWN')
    expect(log.error.mock.calls[0][1]).toMatchObject({ reason: 'HTTP 502' })

    // Two more polls of the same outage: the log keeps the record, the phone
    // stays quiet. This is the flood the transition rule already fixed.
    await checkAllProviders()
    await checkAllProviders()
    expect(log.error).toHaveBeenCalledTimes(1)
    expect(net.telegramSends()).toBe(1)
  })

  it('no recovery notice for an outage nobody was told about', async () => {
    // Down once, up again: under the old raw-`available` gate this sent a
    // cheerful "recovered" for an incident that was never announced, which put
    // the suppressed message straight back on the owner's phone.
    const net = wireFetch([EDGE_502, UP])
    const { checkAllProviders } = await freshMonitor()

    await checkAllProviders()
    await checkAllProviders()

    expect(log.error).not.toHaveBeenCalled()
    expect(
      log.info.mock.calls.filter(c => String(c[0]).includes('recovered')).length
    ).toBe(0)
    expect(net.telegramSends(), 'a blip still cost a message').toBe(0)
  })

  it('an announced outage still gets its all-clear', async () => {
    const net = wireFetch([EDGE_502, EDGE_502, UP])
    const { checkAllProviders } = await freshMonitor()

    await checkAllProviders()
    await checkAllProviders() // pages here
    await checkAllProviders() // back up

    expect(log.error).toHaveBeenCalledTimes(1)
    expect(
      log.info.mock.calls.filter(c => String(c[0]).includes('recovered')).length
    ).toBe(1)
    expect(net.telegramSends(), 'page + all-clear').toBe(2)
  })

  it('a restart does not re-arm the pager on the boot probe', async () => {
    const first = wireFetch([EDGE_502])
    const a = await freshMonitor()
    await a.checkAllProviders()
    await a.checkAllProviders()
    expect(log.error).toHaveBeenCalledTimes(1)
    expect(first.telegramSends()).toBe(1)

    // Redeploy. Every counter in the process is gone, and the provider is
    // still down: the boot probe used to classify prev === undefined as a
    // fresh transition and page again for a condition already decided about.
    log.error.mockClear()
    const second = wireFetch([EDGE_502])
    const b = await freshMonitor()
    await b.checkAllProviders()

    expect(log.error, 'the redeploy re-paged').not.toHaveBeenCalled()
    expect(second.telegramSends()).toBe(0)

    // Delayed by one interval, NOT deleted -- a fresh deploy into a genuinely
    // broken environment must still reach somebody.
    await b.checkAllProviders()
    expect(log.error).toHaveBeenCalledTimes(1)
    expect(second.telegramSends()).toBe(1)
  })
})

/**
 * THE HOLE THE DEBOUNCE OPENED, WHICH IS WORSE THAN THE FLOOD IT CLOSED.
 *
 * A consecutive streak asks "is it down twice in a row", and the most expensive
 * provider failure there is answers no: replicate refusing on alternate polls
 * is HALF of every customer's generations failing, and it never reached two in
 * a row. Every good poll zeroed the streak, every bad one wrote
 * '(unconfirmed)' at warn, and both paging surfaces -- the winston error and
 * the separate notifyAdmin send -- were unreachable for that provider for as
 * long as it lasted. Before the debounce this exact pattern DID page.
 *
 * The first half of each test below is the property the branch wanted and must
 * keep: the early polls are silent. The second half is the one it lost.
 */
describe('a provider that fails half the time is an outage, however it is spaced', () => {
  it('failing every other poll still reaches the owner, and only then', async () => {
    const net = wireFetch([
      EDGE_502,
      UP,
      EDGE_502,
      UP,
      EDGE_502,
      UP,
      EDGE_502,
      UP,
      EDGE_502,
      UP,
    ])
    const { checkAllProviders } = await freshMonitor()

    // Two failures twenty minutes apart, each cleared by the next poll, are
    // still not evidence of an outage. Paging here would be the 3am blip.
    for (let i = 0; i < 4; i++) await checkAllProviders()
    expect(log.error, 'a cleared blip paged').not.toHaveBeenCalled()
    expect(net.telegramSends(), 'notifyAdmin shouted past the pager').toBe(0)

    // The third failure inside the window is a provider that is half down,
    // and half down is down.
    await checkAllProviders()
    expect(
      log.error,
      'half the polls failing reached nobody'
    ).toHaveBeenCalledTimes(1)
    expect(String(log.error.mock.calls[0][0])).toContain('DOWN')
    expect(log.error.mock.calls[0][1]).toMatchObject({ reason: 'HTTP 502' })
    expect(net.telegramSends()).toBe(1)

    // And it must not turn into a machine gun: the evidence is spent by the
    // page it bought, so the next one is earned from probes taken afterwards.
    // Five more polls of the same flap: the all-clear, and nothing else.
    for (let i = 0; i < 5; i++) await checkAllProviders()
    expect(log.error, 'a mute swapped for a flood').toHaveBeenCalledTimes(1)
    expect(net.telegramSends(), 'page + all-clear, not one per poll').toBe(2)
  })
})

describe('a missing credential is a configuration incident, not an outage', () => {
  it('pages on the very first probe, once, and names the remedy', async () => {
    delete process.env.REPLICATE_API_TOKEN
    const net = wireFetch([UP])
    const { checkAllProviders } = await freshMonitor()

    await checkAllProviders()

    // No retry can conjure a key, and waiting a poll only delays the person
    // who has to go and set it.
    expect(log.error).toHaveBeenCalledTimes(1)
    expect(String(log.error.mock.calls[0][0])).toContain('needs an operator')
    expect(log.error.mock.calls[0][1]).toMatchObject({
      reason: 'Token not set',
    })
    expect(net.telegramSends()).toBe(1)

    // Once. Not 288 times a day.
    await checkAllProviders()
    await checkAllProviders()
    expect(log.error).toHaveBeenCalledTimes(1)
    expect(net.telegramSends()).toBe(1)
  })

  it('a rejected credential is standing too, and does not wait for a second opinion', async () => {
    const net = wireFetch([{ ok: false, status: 401 }])
    const { checkAllProviders } = await freshMonitor()

    await checkAllProviders()

    expect(log.error).toHaveBeenCalledTimes(1)
    expect(log.error.mock.calls[0][1]).toMatchObject({
      reason: 'Invalid token',
    })
    expect(net.telegramSends()).toBe(1)
  })
})

describe('the threshold is a real gate, not a coincidence', () => {
  it('floor: with HEALTH_FAILURE_THRESHOLD=1 the same 502 pages immediately', async () => {
    // If this ever goes green together with the first test above, the harness
    // is lying: it would mean the probe never ran, the logger was never
    // reached, or checkAllProviders paged nobody for reasons of its own.
    process.env.HEALTH_FAILURE_THRESHOLD = '1'
    const net = wireFetch([EDGE_502])
    const { checkAllProviders } = await freshMonitor()

    await checkAllProviders()

    expect(log.error).toHaveBeenCalledTimes(1)
    expect(net.telegramSends()).toBe(1)
  })

  it('an unclassified failure is never debounced', async () => {
    const { nextOutageState } = await freshMonitor()
    // A failure nobody labelled must be loud. Defaulting the other way would
    // let the next probe added to this file be silently swallowed.
    expect(nextOutageState(undefined, { available: false }, 5).action).toBe(
      'page'
    )
  })

  it('counts consecutive failures, and a single success resets the streak', async () => {
    const { nextOutageState } = await freshMonitor()
    const down = { available: false, fault: 'transient' as const }

    const one = nextOutageState(undefined, down, 3)
    expect(one).toEqual({
      action: 'wait',
      recentFailures: 1,
      memory: { failures: 1, announced: false, recent: [true] },
    })

    const two = nextOutageState(one.memory, down, 3)
    expect(two.action).toBe('wait')
    expect(two.memory.failures).toBe(2)

    // Three in a row is the streak rule, reached before the window rule can
    // fire -- the window always asks for strictly more failed probes, so this
    // page is the one the branch already promised, arriving on time.
    const three = nextOutageState(two.memory, down, 3)
    expect(three).toEqual({
      action: 'page',
      recentFailures: 3,
      memory: { failures: 3, announced: true, recent: [] },
    })

    expect(nextOutageState(three.memory, down, 3).action).toBe('still')

    // One healthy probe in the middle and the STREAK starts again, so two
    // unrelated blips an hour apart never add up to a consecutive outage. The
    // window below them remembers both, which is a separate question.
    const up = nextOutageState(two.memory, { available: true }, 3)
    expect(up).toEqual({
      action: 'ok',
      recentFailures: 2,
      memory: { failures: 0, announced: false, recent: [true, true, false] },
    })
    expect(nextOutageState(up.memory, down, 3).memory.failures).toBe(1)
  })

  it('k of the last n: an alternating flap climbs even though the streak cannot', async () => {
    const { nextOutageState } = await freshMonitor()
    const down = { available: false, fault: 'transient' as const }
    const up = { available: true }

    let state = nextOutageState(undefined, down, 2)
    const seen: string[] = [state.action]
    for (const probe of [up, down, up, down]) {
      state = nextOutageState(state.memory, probe, 2)
      seen.push(state.action)
    }

    // Nothing here is ever down twice in a row: the streak is 1 at the moment
    // the owner is woken, and the page comes from the window instead.
    expect(seen).toEqual(['wait', 'ok', 'wait', 'ok', 'page'])
    expect(state.memory.failures).toBe(1)
    expect(state.recentFailures).toBe(3)

    // Spent. A page empties the window, or the next good-bad pair pages again
    // ten minutes later and the fix is just a different flood.
    expect(state.memory.recent).toEqual([])
    expect(nextOutageState(state.memory, up, 2).action).toBe('recovered')
  })

  it('a lone blip every half hour is not a flap', async () => {
    const { nextOutageState } = await freshMonitor()
    const down = { available: false, fault: 'transient' as const }
    const up = { available: true }

    // The window must not degrade into "any failure ever, eventually" -- that
    // is the expanding-window trap, where a 1% provider pages given enough
    // days. One failure per six probes, three windows long, stays a warn line.
    let memory: ReturnType<typeof nextOutageState>['memory'] | undefined
    for (let cycle = 0; cycle < 3; cycle++) {
      for (const probe of [down, up, up, up, up, up]) {
        const step = nextOutageState(memory, probe, 2)
        expect(step.action, 'a single blip paged').not.toBe('page')
        memory = step.memory
      }
    }
  })
})
