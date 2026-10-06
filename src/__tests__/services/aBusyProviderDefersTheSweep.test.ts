/**
 * A BUSY PROVIDER DEFERS THE SWEEP; IT DOES NOT FAIL IT (production 2026-10-05).
 *
 * Fifteen sweeps were filed `failed` in one day with five clients waiting.
 * The render's reasons, read from the hive journal:
 *
 *   zai-lite: превышен лимит запросов            (z.ai rate limit) cyrillic-ok
 *   nemotron ... ResourceExhausted               (NVIDIA quota)
 *   zai: не ответил за 120с (таймаут)            (silent provider) cyrillic-ok
 *   zai: ответил словами, не вызвав ни одного инструмента; zai-lite: ... cyrillic-ok
 *                                                (flash models talking)
 *
 * None of these is the seller being broken: the next tick, thirty minutes
 * later, asks again with nothing lost. Paging the owner about each one as an
 * ERROR, and counting it in the failure figure, buried the one real failure in
 * the same journal -- a reserve key with no money on it, which only the owner
 * can fix. So a busy provider is now `deferred`: written to the journal under
 * its own kind with the reason, logged at warn, and escalated to an error only
 * when it keeps happening.
 *
 * Deferring to the next tick rather than backing off inside the sweep is
 * deliberate: STUCK_SWEEP_MS is the sum of the sweep's own waits, and an
 * in-sweep sleep would have to be added to it.
 *
 * Driven through the real `sweepOnce` with an injected `ask`.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  sweepOnce,
  reportSweepOutcome,
  resetProactiveForTests,
  deferralOf,
  type SweepDeps,
} from '@/services/crmProactive'
import { noteForSweep } from '@/services/hiveNote'

const OWNER = '144022504'

/** One person genuinely waiting, so the sweep reaches the model turn. */
const DUE_ROWS = [{ lead: '900000002', display: 'Елена', next: 'reply' }]

function deps(ask: SweepDeps['ask']): SweepDeps {
  return {
    ask,
    ingest: async () => undefined,
    push: async () => undefined,
    record: async () => 'recorded',
    leads: async () => DUE_ROWS,
  }
}

/** The render's own sentence when every provider in the chain gave up. */
const chain = (...reasons: string[]) =>
  'Ни один провайдер модели не ответил.\n' +
  reasons.map(r => '  • ' + r).join('\n')

const throwing = (message: string): SweepDeps['ask'] => {
  return async () => {
    throw new Error(message)
  }
}

beforeEach(() => resetProactiveForTests())

describe('which render failures are a busy provider', () => {
  it('names a rate limit, a quota, a timeout and a chain of talkers', () => {
    expect(deferralOf(chain('zai-lite: превышен лимит запросов'))).toBe(
      'провайдер занят'
    )
    expect(
      deferralOf(
        chain(
          'nemotron: Error: nemotron прислал ошибку в потоке: {"message":"ResourceExhausted"}'
        )
      )
    ).toBe('провайдер занят')
    expect(deferralOf(chain('zai: не ответил за 120с (таймаут)'))).toBe(
      'провайдер занят'
    )
    expect(deferralOf('HTTP 429 Too Many Requests')).toBe('провайдер занят')
    expect(
      deferralOf(
        'модель не дала ответа: zai: ответил словами, не вызвав ни одного инструмента; zai-lite: ответил словами, не вызвав ни одного инструмента'
      )
    ).toBe('модель ответила словами, не вызвав инструментов')
  })

  /*
   * The negative controls. A key with no money and a key the provider refuses
   * are the owner's to fix, so they must keep paging him -- deferring them
   * would make a dead seller look merely slow, every half hour, forever.
   */
  it('leaves an empty key, a refused key and an unknown error as failures', () => {
    expect(
      deferralOf(chain('reserve: на ключе нет средств — пополните баланс'))
    ).toBeNull()
    expect(deferralOf(chain('zai: ключ недействителен'))).toBeNull()
    expect(deferralOf('обход упал: Cannot read properties of null')).toBeNull()
    expect(deferralOf('')).toBeNull()
  })

  it('defers a chain where a busy provider sat beside an empty key', () => {
    // 16:32-16:37: the primary timed out and the reserve had no money. The
    // primary is the one that answers next tick; the empty key still shows
    // in the reason the journal keeps.
    expect(
      deferralOf(
        chain(
          'nemotron: не ответил за 120с (таймаут)',
          'reserve: на ключе нет средств'
        )
      )
    ).toBe('провайдер занят')
  })
})

describe('the sweep with a busy provider', () => {
  it('is deferred, names who waits and keeps the render reason', async () => {
    const r = await sweepOnce(
      OWNER,
      deps(throwing(chain('zai-lite: превышен лимит запросов')))
    )
    expect(r.did).toBe('deferred')
    expect(r.why).toContain('ждёт Елена (next=reply)')
    expect(r.why).toContain('отложено до следующего обхода: провайдер занят')
    expect(r.why).toContain('превышен лимит запросов')
  })

  it('is deferred when the flash models only talked', async () => {
    const r = await sweepOnce(
      OWNER,
      deps(
        throwing(
          'модель не дала ответа: zai: ответил словами, не вызвав ни одного инструмента\nError: Ни один провайдер модели не ответил.'
        )
      )
    )
    expect(r.did).toBe('deferred')
    expect(r.why).toContain('модель ответила словами, не вызвав инструментов')
  })

  it('still fails on a key with no money', async () => {
    const r = await sweepOnce(
      OWNER,
      deps(throwing(chain('reserve: на ключе нет средств')))
    )
    expect(r.did).toBe('failed')
  })
})

describe('how a deferral is reported', () => {
  it('warns, does not break a failure streak count, and escalates every sixth', () => {
    const deferred = { did: 'deferred' as const, why: 'отложено' }
    const levels = Array.from({ length: 6 }, () =>
      reportSweepOutcome(deferred, OWNER)
    )
    expect(levels).toEqual(['warn', 'warn', 'warn', 'warn', 'warn', 'error'])
    // A failure after deferrals is still the FIRST failure: it pages.
    expect(reportSweepOutcome({ did: 'failed', why: 'x' }, OWNER)).toBe('error')
  })

  it('a real result clears the deferral streak', () => {
    const deferred = { did: 'deferred' as const, why: 'отложено' }
    for (let i = 0; i < 5; i++) reportSweepOutcome(deferred, OWNER)
    reportSweepOutcome({ did: 'idle', why: 'тихо' }, OWNER)
    expect(reportSweepOutcome(deferred, OWNER)).toBe('warn')
  })

  it('is written to the journal under its own kind, not silently', () => {
    expect(
      noteForSweep(OWNER, {
        did: 'deferred',
        why: 'отложено до следующего обхода: провайдер занят',
        ms: 4000,
      })
    ).toEqual({
      kind: 'sweep-deferred',
      who: OWNER,
      what: 'отложено до следующего обхода: провайдер занят [4s]',
      severity: 'attention',
    })
  })
})
