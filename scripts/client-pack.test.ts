/**
 * `tri pack`: one table for a client's package, each part with its state and
 * the press that moves it. These pin the rule, especially that an answer a
 * tool did not give is a named gap and never a pass. Ids are invented.
 */
import { describe, expect, it } from 'vitest'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { packReport, HUMAN_ONLY } = require('./client-pack.cjs')

const ID = '900000021'
const ready = () => ({
  id: ID,
  profile: {
    has_profile: true,
    updated_at: '2026-09-13',
    profile: { status: 'confirmed' },
  },
  soul: { ok: true, soul: '# SOUL, in her own words', updatedAt: '2026-09-14' },
  plan: { total: 3, done: 3, items: [] },
  sellers: new Set([ID]),
  wallet: { баланс_токенов: 10 }, // cyrillic-ok: the tool's own field name
  runs: {
    runs: [
      {
        dry_run: false,
        state: 'done',
        violations: [],
        finished_at: '2026-09-20',
      },
    ],
  },
})
const state = (r: any, part: string) =>
  r.rows.find((x: any) => x.part === part)?.state

describe('a packaged client', () => {
  it('has no machine gaps, and the human-only parts are still listed', () => {
    const r = packReport(ready())
    expect(r.gaps).toBe(0)
    for (const part of ['profile', 'soul', 'seller', 'wallet', 'plan', 'duet'])
      expect(state(r, part)).toBe('ok')
    expect(r.rows.filter((x: any) => x.part === 'human')).toHaveLength(
      HUMAN_ONLY.length
    )
  })
})

describe('what the first real case looked like (2026-09-21)', () => {
  it('a draft profile and a draft SOUL are the person"s to confirm', () => {
    const c = ready()
    c.profile.profile.status = 'draft — гипотезы' // cyrillic-ok: the status the tool writes
    c.soul.soul = '# SOUL\nСтатус: ЧЕРНОВИК, подготовлен платформой' // cyrillic-ok: the draft marker
    const r = packReport(c)
    expect(state(r, 'profile')).toBe('human')
    expect(state(r, 'soul')).toBe('human')
  })

  it('a plan with nothing produced is a gap naming the first item', () => {
    const c = ready()
    c.plan = {
      total: 14,
      done: 0,
      items: [{ status: 'idea', title: 'plan 6' }],
    } as any
    const r = packReport(c)
    const plan = r.rows.find((x: any) => x.part === 'plan')
    expect(plan.state).toBe('gap')
    expect(plan.detail).toBe('0 of 14 produced')
    expect(plan.next).toMatch(/plan 6/)
  })

  it('dry runs and runs with violations do not count as a clean duet', () => {
    const c = ready()
    c.runs = {
      runs: [
        { dry_run: true, state: 'done', violations: [] },
        { dry_run: false, state: 'done', violations: ['a forbidden claim'] },
        { dry_run: false, state: 'lost', violations: [] },
      ],
    } as any
    expect(state(packReport(c), 'duet')).toBe('gap')
  })
})

describe('a tool that did not answer is a gap, never a pass', () => {
  for (const part of [
    'profile',
    'soul',
    'plan',
    'wallet',
    'duet',
    'seller',
  ] as const) {
    it(`${part} missing`, () => {
      const c: any = ready()
      const key = {
        profile: 'profile',
        soul: 'soul',
        plan: 'plan',
        wallet: 'wallet',
        duet: 'runs',
        seller: 'sellers',
      }[part]
      c[key] = null
      const r = packReport(c)
      expect(state(r, part)).toBe('gap')
      expect(r.gaps).toBeGreaterThan(0)
    })
  }
  it('an empty wallet is a gap and crediting is the owner"s call', () => {
    const c: any = ready()
    c.wallet = { баланс_токенов: 0 } // cyrillic-ok: the tool's own field name
    const w = packReport(c).rows.find((x: any) => x.part === 'wallet')
    expect(w.state).toBe('gap')
    expect(w.next).toMatch(/owner decides/)
  })
  it('a balance that is not a number is unreadable, not a balance', () => {
    for (const v of ['3092', undefined, NaN, {}]) {
      const c: any = ready()
      c.wallet = { баланс_токенов: v } // cyrillic-ok: the tool's own field name
      const w = packReport(c).rows.find((x: any) => x.part === 'wallet')
      expect(w.state).toBe('gap')
    }
  })
  it('a person who is not a seller is a gap whose press is theirs', () => {
    const c: any = ready()
    c.sellers = new Set(['900000099'])
    const s = packReport(c).rows.find((x: any) => x.part === 'seller')
    expect(s.state).toBe('gap')
    expect(s.next).toMatch(/hers to type/)
  })
})
