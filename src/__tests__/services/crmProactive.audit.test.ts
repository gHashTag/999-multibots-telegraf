import { describe, it, expect, beforeEach } from 'vitest'
import {
  sweepOnce,
  resetProactiveForTests,
  markRunningForTests,
  STUCK_SWEEP_MS,
  INGEST_FAILURES_BEFORE_FAILED,
  type SweepDeps,
} from '@/services/crmProactive'
import { parseAgentButtons } from '@/navigation/helpers/actionButtons'

/**
 * THE CRM AUDIT OF 2026-09-12, bot side: a sweep that never came back is
 * released; memory that stopped refreshing becomes a failure the owner
 * sees; markers of the wrong shape never reach a person.
 */
const OWNER = '144022504'
const draft = {
  id: 'p1',
  action: 'send',
  target: '555',
  what: 'привет',
  secret: 's',
}

function deps(over: Partial<SweepDeps> = {}) {
  const calls: string[] = []
  const d: SweepDeps = {
    ask: async () => {
      calls.push('ask')
      return { текст: 'подготовил', proposal: draft } as never // cyrillic-ok: pre-existing identifiers
    },
    ingest: async () => {
      calls.push('ingest')
    },
    push: async () => {
      calls.push('push')
    },
    record: async () => 'recorded',
    now: () => 1_000_000,
    ...over,
  }
  return { d, calls }
}

beforeEach(() => resetProactiveForTests())

describe('P1 #3: a stuck sweep is released', () => {
  it('a flag younger than the limit still means busy', async () => {
    markRunningForTests(1_000_000 - STUCK_SWEEP_MS + 1000, OWNER)
    const { d, calls } = deps()
    const r = await sweepOnce(OWNER, d)
    expect(r.did).toBe('busy')
    expect(calls).toEqual([])
  })

  it('a flag older than ten minutes is a hang: the tick proceeds', async () => {
    markRunningForTests(1_000_000 - STUCK_SWEEP_MS - 1, OWNER)
    const { d, calls } = deps()
    const r = await sweepOnce(OWNER, d)
    expect(r.did).toBe('card')
    expect(calls).toContain('ask')
  })
})

describe('P1 #4: memory that stopped refreshing', () => {
  it('two failures sweep on stale memory; the third is reported as failed with the reconnect hint', async () => {
    const { d, calls } = deps({
      ingest: async () => {
        throw new Error('Сессия Telegram истекла или отозвана')
      },
      now: () => Date.now(),
    })
    const outcomes: string[] = []
    for (let i = 0; i < INGEST_FAILURES_BEFORE_FAILED + 1; i += 1) {
      outcomes.push((await sweepOnce(OWNER, d, { holdMs: 0 })).did)
    }
    expect(outcomes).toEqual(['card', 'card', 'failed', 'failed'])
    const last = await sweepOnce(OWNER, d, { holdMs: 0 })
    expect(last.did).toBe('failed')
    if (last.did === 'failed') {
      expect(last.why).toContain('память не обновляется')
      expect(last.why).toContain('переподключи')
    }
    // The model was not asked on the failed ticks.
    expect(calls.filter(c => c === 'ask')).toHaveLength(2)
  })

  it('one success ends the streak', async () => {
    let fail = true
    const { d } = deps({
      ingest: async () => {
        if (fail) throw new Error('FLOOD_WAIT')
      },
    })
    expect((await sweepOnce(OWNER, d, { holdMs: 0 })).did).toBe('card')
    expect((await sweepOnce(OWNER, d, { holdMs: 0 })).did).toBe('card')
    fail = false
    expect((await sweepOnce(OWNER, d, { holdMs: 0 })).did).toBe('card')
    fail = true
    expect((await sweepOnce(OWNER, d, { holdMs: 0 })).did).toBe('card')
  })
})

describe('P2 #14: markers of the wrong shape never reach a person', () => {
  it('drops [[…|tg_send]], [[…|act:Topup]] and [[…|act:topup2]] from the text', () => {
    const { text, buttons } = parseAgentButtons(
      'Готово. [[Подпись|tg_send]] [[Оплатить|act:Topup]]\n\n[[Пополнить|act:topup2]]',
      true
    )
    expect(text).toBe('Готово.')
    expect(buttons).toEqual([])
  })
})

describe('the sweep state belongs to an owner, not to the process', () => {
  /*
   * MEASURED IN PRODUCTION 2026-09-16: crm_sellers returns TWO sellers, one
   * of whom does not own this deployment. Everything below was shared by
   * both of them until this change.
   */
  it("one seller's dead Telegram session does not mark the others failed", async () => {
    // A revoked session is permanent, so the streak reaches the limit fast.
    // Shared, it put every other seller past the limit on their FIRST tick
    // and the alert named the wrong person.
    const { d } = deps({
      ingest: async (owner: string) => {
        if (owner === '9000000042') throw new Error('Сессия Telegram отозвана') // cyrillic-ok
      },
      now: () => Date.now(),
    })
    for (let i = 0; i < INGEST_FAILURES_BEFORE_FAILED + 1; i += 1) {
      await sweepOnce('9000000042', d, { holdMs: 0 })
    }
    expect((await sweepOnce('9000000042', d, { holdMs: 0 })).did).toBe('failed')
    expect(
      (await sweepOnce(OWNER, d, { holdMs: 0 })).did,
      "another seller's dead session reported this one as broken"
    ).toBe('card')
  })

  it('a sweep stuck for one seller does not make another seller busy', async () => {
    markRunningForTests(0, 'somebody else')
    const { d, calls } = deps()
    const r = await sweepOnce(OWNER, d)
    expect(r.did, "another seller's hang stopped this one").toBe('card')
    expect(calls).toContain('ask')
  })
})
