/**
 * THE SWEEP THAT RAN PAST ITS OWN CLOCK (production 2026-09-16).
 *
 *   15:03:03  sweep-failed  one lead waiting (next=deliver), the sweep died
 *                           at the model turn: This operation was aborted
 *   15:35:15  sweep-failed  another lead waiting (next=reply), the same
 *
 * That message comes from one place and one place only: an AbortController we
 * armed ourselves, cutting the model turn at its 180-second budget. It is not a
 * provider refusing and not a wire dying.
 *
 * The file already retried a dead wire once, with the rule spelled out: the
 * throw happens upstream of `deps.push`, so nothing reached anybody and a
 * second ask cannot deliver twice. Our own abort throws at exactly the same
 * point, for a reason just as innocent -- and it was not retried, so each one
 * cost a waiting customer the full thirty minutes to the next tick.
 *
 * Everything here is driven through the real `sweepOnce` with an injected
 * `ask`; nothing reads the source.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  sweepOnce,
  reportSweepOutcome,
  resetProactiveForTests,
  isOurOwnAbort,
  isTransportDeath,
  type SweepDeps,
} from '@/services/crmProactive'

const OWNER = '144022504'

const draft = {
  id: 'p1',
  action: 'send',
  target: '900000002',
  what: 'готово',
}

/** What node throws when an AbortController we armed fires. */
const abortError = () => {
  const e = new Error('This operation was aborted')
  e.name = 'AbortError'
  return e
}

/** One person genuinely waiting, so the sweep reaches the model turn. */
const DUE_ROWS = [{ lead: '900000002', display: 'Вася', next: 'talk' }]

function deps(ask: SweepDeps['ask'], over: Partial<SweepDeps> = {}): SweepDeps {
  return {
    ask,
    ingest: async () => undefined,
    push: async () => undefined,
    record: async () => 'recorded',
    leads: async () => DUE_ROWS,
    ...over,
  }
}

beforeEach(() => resetProactiveForTests())

describe('telling our own clock apart from everything else', () => {
  it('recognises the abort by name and by message', () => {
    expect(isOurOwnAbort(abortError())).toBe(true)
    expect(isOurOwnAbort(new Error('This operation was aborted'))).toBe(true)
    const timeout = new Error('timed out')
    timeout.name = 'TimeoutError'
    expect(isOurOwnAbort(timeout)).toBe(true)
  })

  /*
   * The two must not blur into each other: they deserve different words in the
   * owner's alert, and only their innocence is shared.
   */
  it('is not a transport death, and a refusing model is neither', () => {
    expect(isTransportDeath(abortError())).toBe(false)
    expect(isOurOwnAbort(new Error('модель ответила 500'))).toBe(false)
    expect(isOurOwnAbort(new Error('terminated'))).toBe(false)
    expect(isOurOwnAbort(null)).toBe(false)
    expect(isOurOwnAbort(undefined)).toBe(false)
  })
})

describe('a model turn cut at its budget', () => {
  it('is asked once more, and the card that was waiting arrives', async () => {
    let calls = 0
    const pushed: unknown[] = []
    const ask = (async () => {
      calls += 1
      if (calls === 1) throw abortError()
      return { proposal: draft, текст: 'карточка' } as never // cyrillic-ok: the agent answer field
    }) as SweepDeps['ask']

    const r = await sweepOnce(
      OWNER,
      deps(ask, {
        push: async (owner, d) => {
          pushed.push([owner, d])
        },
      }),
      { holdMs: 0 }
    )

    expect(calls, 'the turn was not asked a second time').toBe(2)
    expect(r.did).toBe('card')
    // ONE push, not two: the abort threw before anything was delivered, which
    // is the whole licence for this retry.
    expect(pushed).toEqual([[OWNER, draft]])
    // A recovery is not an alert. The alert is for the failure it prevented.
    expect(reportSweepOutcome(r, OWNER)).toBe('info')
  })

  it('gives up after one retry: a second abort is an outage, not a hiccup', async () => {
    let calls = 0
    const ask = (async () => {
      calls += 1
      throw abortError()
    }) as SweepDeps['ask']

    const r = await sweepOnce(OWNER, deps(ask), { holdMs: 0 })

    expect(calls).toBe(2)
    expect(r.did).toBe('failed')
    expect(r.why).toContain('ход модели')
    expect(reportSweepOutcome(r, OWNER)).toBe('error')
  })

  /*
   * THE LINE THAT MUST NOT MOVE. A model that answers badly, or a provider that
   * refuses, has produced a real answer -- re-asking it is a second opinion, not
   * a recovery, and this file does not buy those.
   */
  it('does not retry a failure that is not ours', async () => {
    let calls = 0
    const ask = (async () => {
      calls += 1
      throw new Error('модель ответила 500')
    }) as SweepDeps['ask']

    const r = await sweepOnce(OWNER, deps(ask), { holdMs: 0 })

    expect(calls, 'a refusing model was asked twice').toBe(1)
    expect(r.did).toBe('failed')
  })
})
