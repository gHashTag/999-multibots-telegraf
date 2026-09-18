import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * EVERY SELLER IS SWEPT (2026-09-13). Measured on the render's Postgres that
 * day: tg_sessions held the owner's row (144022504) and @playom's
 * (435572800), connected 2026-09-09. The sweep still ran for one id from
 * the environment. These tests pin the replacement: the list comes from
 * CRM_PROACTIVE_OWNERS when set, else from the render's `crm_sellers`, and
 * a render that cannot be reached leaves the owner alone swept, as before.
 * Spec: t27 specs/automation/crm-sellers.t27.
 */
vi.mock('@/services/modelSwitch', () => ({
  fetchLeadRows: vi.fn(async () => []),
  callTool: vi.fn(),
}))
vi.mock('@/services/trinityAgent', () => ({
  спроситьАгента: vi.fn(), // cyrillic-ok: pre-existing identifier
  recordTurns: vi.fn(),
}))
vi.mock('@/services/hiveNote', () => ({ noteSweepToHive: vi.fn() }))

const OWNER = '144022504'
const PLAYOM = '435572800'

describe('parseOwnerIds', () => {
  it('reads a comma or space separated list and drops what is not an id', async () => {
    const { parseOwnerIds } = await import('@/services/crmProactive')
    expect(parseOwnerIds('144022504, 435572800')).toEqual([OWNER, PLAYOM])
    expect(parseOwnerIds('144022504 435572800;@playom,abc')).toEqual([
      OWNER,
      PLAYOM,
    ])
    expect(parseOwnerIds(undefined)).toEqual([])
    expect(parseOwnerIds('')).toEqual([])
  })
})

describe('resolveSellers', () => {
  it('the environment list wins, the owner first, nobody twice', async () => {
    const { resolveSellers } = await import('@/services/crmProactive')
    const ask = vi.fn(async () => ['999'])
    const got = await resolveSellers(
      { ownerId: OWNER, ownerIds: [PLAYOM, OWNER, PLAYOM] },
      ask
    )
    expect(got).toEqual([OWNER, PLAYOM])
    expect(ask).not.toHaveBeenCalled()
  })

  it('without the list, the render is asked as the owner and every row is swept', async () => {
    const { resolveSellers } = await import('@/services/crmProactive')
    const ask = vi.fn(async (owner: string) => {
      expect(owner).toBe(OWNER)
      return [PLAYOM, OWNER]
    })
    expect(await resolveSellers({ ownerId: OWNER }, ask)).toEqual([
      OWNER,
      PLAYOM,
    ])
  })

  it('a render that cannot be reached leaves the owner alone, as before', async () => {
    const { resolveSellers } = await import('@/services/crmProactive')
    const ask = vi.fn(async () => {
      throw new Error('render down')
    })
    expect(await resolveSellers({ ownerId: OWNER }, ask)).toEqual([OWNER])
  })

  it('the default asker calls crm_sellers on the render and reads telegram_id', async () => {
    const { callTool } = await import('@/services/modelSwitch')
    ;(callTool as any).mockResolvedValueOnce({
      sellers: [
        { telegram_id: PLAYOM, connected_at: '2026-09-09T00:00:00.000Z' },
        { telegram_id: OWNER, connected_at: '2026-09-07T00:00:00.000Z' },
      ],
      count: 2,
    })
    const { resolveSellers } = await import('@/services/crmProactive')
    expect(await resolveSellers({ ownerId: OWNER })).toEqual([OWNER, PLAYOM])
    expect(callTool).toHaveBeenCalledWith(
      OWNER,
      'crm_sellers',
      {},
      expect.objectContaining({ timeoutMs: expect.any(Number) })
    )
  })
})

describe('the Inngest sweep runs the tick for every seller', () => {
  const env = { ...process.env }
  beforeEach(async () => {
    const { resetCarrierForTests } = await import('@/services/crmProactive')
    resetCarrierForTests()
  })
  afterEach(() => {
    process.env = { ...env }
  })

  it('the cron function sweeps every resolved seller and the entry passes CRM_PROACTIVE_OWNERS', async () => {
    const { readFileSync } = await import('fs')
    const { join } = await import('path')
    const read = (rel: string) =>
      readFileSync(join(__dirname, '..', '..', rel), 'utf8')
    // Since 2026-09-17 the cron resolves the list in its own step and runs
    // one step per seller (see crmProactive.sweepSteps.test.ts); the timer
    // driver below still sweeps the same people through runProactiveTickAll.
    const fn = read('inngest_app/functions/crm/crmProactiveSweep.ts')
    expect(fn).toContain('resolveSellers(c.opts)')
    expect(fn).toContain('step.run(`sweep-${owner}`')
    expect(fn).toContain(
      'runProactiveTick(c.bot, { ...c.opts, ownerId: owner })'
    )
    expect(read('index.ts')).toContain(
      'parseOwnerIds(process.env.CRM_PROACTIVE_OWNERS)'
    )
    // The timer driver sweeps the same people as the cron.
    const svc = read('services/crmProactive.ts')
    expect(svc).toMatch(/const run = \(\) =>\s*runProactiveTickAll\(bot, opts\)/)
  })
})
