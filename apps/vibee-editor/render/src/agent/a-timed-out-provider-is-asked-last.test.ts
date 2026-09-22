/**
 * A PROVIDER THAT JUST TIMED OUT IS NOT ASKED FIRST BY THE NEXT PERSON.
 *
 * Production, 2026-09-22, turn 6b3f6cad: `zai: не ответил за 120с (таймаут)`
 * -- two minutes before the next provider was even tried, and nothing
 * remembered it for the turn after. Two changes, proved here with fake
 * providers and fake time:
 *
 *   1. a quiet provider is left after PROVIDER_SILENCE_MS of silence, not
 *      after the 120 s ceiling -- and a provider that keeps streaming is not
 *      cut by the silence deadline at all;
 *   2. a timeout opens that provider's breaker: new turns ask it last, one
 *      probe goes through after the cooldown, and the transitions are logged
 *      once, not per turn. The owner's /model choice is never rewritten.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MockInstance } from 'vitest'
import { PROVIDER_CEILING_MS, PROVIDER_SILENCE_MS, streamModel } from './chat'
import {
  BREAKER_COOLDOWN_MS,
  BREAKER_FAILURES_TO_OPEN,
  BREAKER_LOG_PREFIX,
  breakerSnapshot,
  forgetBreakersForTests,
} from './provider-breaker'
import {
  chooseProvider,
  chosenProvider,
  forgetProviderChoiceForTests,
} from './provider-choice'

const GLM = 'glm-5.3'
const LITE = 'glm-4.5'
const NEMO = 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning'

const text = (t: string) =>
  new Response(
    [
      `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}`,
      'data: [DONE]',
      '',
    ].join('\n'),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
  )

/** Accepts the request and never says a word, until the render hangs up. */
const quiet = (init?: RequestInit) =>
  new Promise<Response>((_, reject) => {
    init?.signal?.addEventListener('abort', () =>
      reject(new DOMException('This operation was aborted', 'AbortError'))
    )
  })

const THOUGHT_EVERY_MS = 20_000

/**
 * A provider that streams a thought every THOUGHT_EVERY_MS and answers after
 * `thoughts` of them (Infinity: never). The body obeys the request's signal
 * the way a real fetch body does -- a fake that ignored it could not show a
 * deadline cutting the stream at all.
 */
const talking = (thoughts: number) => (init?: RequestInit) => {
  const enc = new TextEncoder()
  let n = 0
  let cut = false
  const body = new ReadableStream<Uint8Array>({
    start(ctrl) {
      init?.signal?.addEventListener('abort', () => {
        cut = true
        ctrl.error(new DOMException('This operation was aborted', 'AbortError'))
      })
      const tick = () => {
        if (cut) return
        n += 1
        const delta =
          n <= thoughts
            ? { reasoning_content: `thinking ${n}` }
            : { content: 'done' }
        ctrl.enqueue(
          enc.encode(`data: ${JSON.stringify({ choices: [{ delta }] })}\n`)
        )
        if (n <= thoughts) setTimeout(tick, THOUGHT_EVERY_MS)
        else {
          ctrl.enqueue(enc.encode('data: [DONE]\n'))
          ctrl.close()
        }
      }
      setTimeout(tick, THOUGHT_EVERY_MS)
    },
  })
  return new Response(body, { status: 200 })
}

type Reply = (init?: RequestInit) => Response | Promise<Response>
let asked: string[] = []
/** Each model answers from its own queue; past the end it answers 'ok'. */
function script(replies: Record<string, Reply[]>) {
  asked = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      const model = JSON.parse(String(init?.body ?? '{}')).model as string
      asked.push(model)
      const next = replies[model]?.shift()
      return next ? next(init) : text('ok')
    })
  )
}

/** One model call, started now; `done` flips when it has finished. */
function call() {
  const events: any[] = []
  const state = { done: false, error: null as unknown }
  const finished = (async () => {
    try {
      for await (const ev of streamModel([{ role: 'user', content: 'hi' }]))
        events.push(ev)
    } catch (e) {
      state.error = e
    } finally {
      state.done = true
    }
  })()
  return { events, state, finished }
}
const answeredBy = (events: any[]) =>
  events.find(e => e.kind === 'done')?.provider as string | undefined

let warn: MockInstance<typeof console.warn>
let log: MockInstance<typeof console.log>
const breakerLines = (word: string) =>
  [...warn.mock.calls, ...log.mock.calls]
    .map(c => String(c[0]))
    .filter(l => l.startsWith(BREAKER_LOG_PREFIX) && l.includes(word))

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubEnv('GLM_API_KEY', 'g')
  vi.stubEnv('NVIDIA_API_KEY', 'n')
  vi.stubEnv('AGENT_PROVIDER', '')
  vi.stubEnv('AGENT_MODEL', '')
  vi.stubEnv('RESERVE_BASE_URL', '')
  vi.stubEnv('OLLAMA_BASE_URL', '')
  vi.stubEnv('RAILWAY_SERVICE_QUEEN_OLLAMA_URL', '')
  vi.stubEnv('OLLAMA_ENABLED', '')
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  log = vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  forgetProviderChoiceForTests()
  forgetBreakersForTests()
})

/** Open zai's breaker the way production did: it went quiet. */
async function zaiTimesOut() {
  script({ [GLM]: [quiet], [LITE]: [() => text('lite')] })
  const c = call()
  await vi.advanceTimersByTimeAsync(PROVIDER_SILENCE_MS + 1)
  await c.finished
  return c
}

describe('a quiet provider', () => {
  it('is left after the silence deadline, well before the ceiling, and the next one answers', async () => {
    expect(PROVIDER_SILENCE_MS).toBeLessThan(PROVIDER_CEILING_MS)
    script({ [GLM]: [quiet], [LITE]: [() => text('lite')] })
    const c = call()

    await vi.advanceTimersByTimeAsync(PROVIDER_SILENCE_MS - 1_000)
    expect(c.state.done).toBe(false)
    await vi.advanceTimersByTimeAsync(1_001)
    await vi.advanceTimersByTimeAsync(0)

    expect(c.state.done, 'still waiting on a provider that said nothing').toBe(
      true
    )
    expect(asked).toEqual([GLM, LITE])
    expect(answeredBy(c.events)).toBe('zai-lite')
    const skip = warn.mock.calls
      .map(c => String(c[0]))
      .find(l => l.includes('provider skipped: zai:'))
    expect(skip).toContain(`${PROVIDER_SILENCE_MS / 1000}`)
  })

  it("leaves the next provider room inside the bot's 90 s silence limit", () => {
    // src/services/trinityAgent.ts SILENCE_MS: the bot hangs up after 90 s of
    // nothing. A deadline at or past it means the fallback is never reached.
    expect(PROVIDER_SILENCE_MS).toBeLessThanOrEqual(90_000 - 30_000)
  })

  it('a provider that keeps streaming is not cut by the silence deadline', async () => {
    // A thought every 20 s for 80 s, the answer at 100 s: longer than the
    // silence deadline in total, never silent for that long, and inside the
    // ceiling.
    script({ [GLM]: [talking(4)] })
    const c = call()
    await vi.advanceTimersByTimeAsync(5 * THOUGHT_EVERY_MS + 1)
    await c.finished
    expect(c.state.error).toBeNull()
    expect(asked).toEqual([GLM])
    expect(c.events).toContainEqual({ kind: 'content', text: 'done' })
  })

  it('a provider that talks and never answers is cut at the ceiling, and parked', async () => {
    // Turn 6b3f6cad's likely shape: the bot, which hangs up after 90 s of
    // silence, stayed on the line for zai's whole 120 s.
    script({ [GLM]: [talking(Infinity)], [LITE]: [() => text('lite')] })
    const c = call()
    await vi.advanceTimersByTimeAsync(PROVIDER_CEILING_MS - 1_000)
    expect(c.state.done, 'cut before the ceiling').toBe(false)
    await vi.advanceTimersByTimeAsync(1_001)
    await c.finished
    expect(asked).toEqual([GLM, LITE])
    expect(answeredBy(c.events)).toBe('zai-lite')
    expect(breakerSnapshot().map(b => b.id)).toEqual(['zai'])
    const skip = warn.mock.calls
      .map(c => String(c[0]))
      .find(l => l.includes('provider skipped: zai:'))
    expect(skip).toContain(`${PROVIDER_CEILING_MS / 1000}`)
  })
})

describe('the breaker', () => {
  it('a timeout opens it, and the next turn goes elsewhere without waiting', async () => {
    await zaiTimesOut()
    expect(breakerSnapshot().map(b => b.id)).toEqual(['zai'])

    script({ [GLM]: [quiet], [LITE]: [() => text('lite again')] })
    const next = call()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(0)
    expect(next.state.done, 'the next person waited on the open provider').toBe(
      true
    )
    expect(asked).toEqual([LITE])
    expect(answeredBy(next.events)).toBe('zai-lite')
  })

  it('logs opening once, not once per turn routed around it', async () => {
    await zaiTimesOut()
    for (let i = 0; i < 4; i++) {
      script({ [LITE]: [() => text('lite')] })
      const c = call()
      await vi.advanceTimersByTimeAsync(0)
      await c.finished
    }
    // One line in all: the opening. Nothing for the four turns after it.
    expect(breakerLines('')).toHaveLength(1)
    expect(breakerLines('opened')).toHaveLength(1)
  })

  it('after the cooldown exactly one probe goes through, and its answer closes it', async () => {
    await zaiTimesOut()
    await vi.advanceTimersByTimeAsync(BREAKER_COOLDOWN_MS)

    let release: (r: Response) => void = () => {}
    const held = new Promise<Response>(resolve => {
      release = resolve
    })
    script({ [GLM]: [() => held], [LITE]: [() => text('lite')] })

    const probe = call()
    await vi.advanceTimersByTimeAsync(0)
    expect(asked).toEqual([GLM])

    // A second person while the probe is still out is not the probe.
    const meanwhile = call()
    await vi.advanceTimersByTimeAsync(0)
    await meanwhile.finished
    expect(answeredBy(meanwhile.events)).toBe('zai-lite')
    expect(asked).toEqual([GLM, LITE])

    release(text('zai is back'))
    await probe.finished
    expect(answeredBy(probe.events)).toBe('zai')
    expect(breakerSnapshot()).toEqual([])
    expect(breakerLines('closed')).toHaveLength(1)

    // Closed: zai is first again.
    script({})
    const after = call()
    await after.finished
    expect(asked).toEqual([GLM])
  })

  it('a last-resort call that fails while the probe is out is not the probe', async () => {
    await zaiTimesOut()
    await vi.advanceTimersByTimeAsync(BREAKER_COOLDOWN_MS)

    let release: (r: Response) => void = () => {}
    const held = new Promise<Response>(resolve => {
      release = resolve
    })
    const refuse = () => new Response('busy', { status: 429 })
    script({
      [GLM]: [() => held, refuse],
      [LITE]: [refuse],
      [NEMO]: [refuse],
    })
    const probe = call()
    await vi.advanceTimersByTimeAsync(0)
    expect(asked).toEqual([GLM])

    // Everybody else refuses this person, so the open provider is asked as
    // the last resort -- while the probe is still out -- and refuses too.
    const meanwhile = call()
    await vi.advanceTimersByTimeAsync(0)
    await meanwhile.finished
    expect(asked).toEqual([GLM, LITE, NEMO, GLM])
    expect(
      breakerLines('probe failed'),
      'a call that was not the probe reported the probe as failed'
    ).toEqual([])

    // The probe's own verdict still decides.
    release(text('zai is back'))
    await probe.finished
    expect(answeredBy(probe.events)).toBe('zai')
    expect(breakerSnapshot()).toEqual([])
    expect(breakerLines('closed')).toHaveLength(1)
  })

  it('a probe that fails opens it again, said once', async () => {
    await zaiTimesOut()
    await vi.advanceTimersByTimeAsync(BREAKER_COOLDOWN_MS)

    script({ [GLM]: [quiet], [LITE]: [() => text('lite')] })
    const probe = call()
    await vi.advanceTimersByTimeAsync(PROVIDER_SILENCE_MS + 1)
    await probe.finished
    expect(answeredBy(probe.events)).toBe('zai-lite')
    expect(breakerLines('probe failed')).toHaveLength(1)

    script({ [LITE]: [() => text('lite')] })
    const next = call()
    await next.finished
    expect(asked).toEqual([LITE])
  })

  it(`opens after ${BREAKER_FAILURES_TO_OPEN} refusals in a row, not after one`, async () => {
    const refuse = () => new Response('busy', { status: 429 })
    for (let i = 1; i <= BREAKER_FAILURES_TO_OPEN; i++) {
      script({ [GLM]: [refuse], [LITE]: [() => text('lite')] })
      const c = call()
      await c.finished
      expect(asked[0]).toBe(GLM)
      expect(breakerSnapshot().length).toBe(
        i < BREAKER_FAILURES_TO_OPEN ? 0 : 1
      )
    }
  })

  it('a success in between resets the count', async () => {
    const refuse = () => new Response('busy', { status: 429 })
    for (let i = 1; i < BREAKER_FAILURES_TO_OPEN; i++) {
      script({ [GLM]: [refuse] })
      await call().finished
    }
    script({ [GLM]: [() => text('fine')] })
    await call().finished
    script({ [GLM]: [refuse] })
    await call().finished
    expect(breakerSnapshot()).toEqual([])
  })

  it('never leaves the chain empty: an open provider is still asked when nobody else can', async () => {
    vi.stubEnv('GLM_API_KEY', '')
    script({ [NEMO]: [quiet] })
    const first = call()
    await vi.advanceTimersByTimeAsync(PROVIDER_SILENCE_MS + 1)
    await first.finished
    expect(breakerSnapshot().map(b => b.id)).toEqual(['nemotron'])

    script({ [NEMO]: [() => text('still here')] })
    const second = call()
    await second.finished
    expect(answeredBy(second.events)).toBe('nemotron')
    expect(breakerSnapshot()).toEqual([])
  })
})

describe("the owner's /model choice", () => {
  it('is not rewritten by the breaker, and wins again once it closes', async () => {
    await chooseProvider(null, 'nemotron')
    script({ [NEMO]: [quiet], [GLM]: [() => text('zai')] })
    const c = call()
    await vi.advanceTimersByTimeAsync(PROVIDER_SILENCE_MS + 1)
    await c.finished
    expect(answeredBy(c.events)).toBe('zai')

    // Open: the next turn goes to the head of the rest of the chain...
    script({})
    await call().finished
    expect(asked).toEqual([GLM])
    // ...and the choice itself is untouched.
    expect(chosenProvider()).toBe('nemotron')

    await vi.advanceTimersByTimeAsync(BREAKER_COOLDOWN_MS)
    script({})
    await call().finished
    expect(asked).toEqual([NEMO])
  })

  it('picking a model by hand gives it the next message even while its breaker is open', async () => {
    await zaiTimesOut()
    await chooseProvider(null, 'zai')
    script({})
    await call().finished
    expect(asked).toEqual([GLM])
    expect(breakerLines('chosen by the owner')).toHaveLength(1)
  })
})
