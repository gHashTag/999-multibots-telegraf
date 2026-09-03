import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * The house exemption has to hold on BOTH sides of the ledger.
 *
 * spendTokens returns early for a HOUSE wallet and charges it nothing -- the
 * autopilot renders locally and costs no provider anything, and metering it
 * against a customer wallet is what stopped the factory for 51 hours on
 * 2026-08-27. refundTokens had no such branch, so a failed house operation
 * credited back the full price that was never taken: tokens minted from
 * nothing, drifting the house balance upward by one price per failure.
 *
 * An exemption that holds on one side only is not an exemption, it is a
 * faucet. And it must hold BEFORE any further refund is added to this file:
 * every refund site, present and future, mints for a house wallet without it.
 *
 * This drives a REAL tool handler rather than asserting on source text: the
 * provider call is stubbed to fail, which is exactly the path that refunds.
 * HOUSE_TELEGRAM_IDS is read at module load, so the env is stubbed before the
 * dynamic import.
 */

const HOUSE_ID = '144022504'
const CUSTOMER_ID = '987654321'

/** A pool that answers plausibly and records every statement it is given. */
function recordingPool() {
  const sql: string[] = []
  return {
    sql,
    query: async (text: string, _params?: unknown[]) => {
      sql.push(text)
      // ensureTokenRow's INSERT ... RETURNING balance, and the spend UPDATE's
      // RETURNING balance, both want a row back.
      if (/RETURNING balance/i.test(text)) return { rows: [{ balance: 500 }] }
      return { rows: [] }
    },
  }
}

const charges = (sql: string[]) =>
  sql.filter(s => /balance\s*=\s*balance\s*-/.test(s))
const refunds = (sql: string[]) =>
  sql.filter(s => /balance\s*=\s*balance\s*\+/.test(s))

/** Load tools.ts fresh, with the house list already in the environment. */
async function loadTools(houseIds: string) {
  vi.resetModules()
  vi.stubEnv('HOUSE_TELEGRAM_IDS', houseIds)
  return await import('./src/agent/tools')
}

/** Make the render service refuse, which is the path that refunds. */
function stubFailingProvider() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: 'provider down' }),
    }))
  )
}

async function runReelRender(telegramId: string, houseIds: string) {
  const mod = await loadTools(houseIds)
  const pool = recordingPool()
  const tool = mod.TOOLS_BY_NAME.get('reel_render')
  expect(tool, 'reel_render disappeared from the registry').toBeTruthy()
  const result = await tool!.handler({ compositionId: 'TrinityBlogReel' }, {
    telegramId,
    pool,
  } as never)
  return { result, sql: pool.sql }
}

beforeEach(() => {
  stubFailingProvider()
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('дом не платит себе и не возвращает себе', () => {
  it('домашний кошелёк: провайдер упал — ни списания, ни возврата', async () => {
    const { result, sql } = await runReelRender(HOUSE_ID, HOUSE_ID)
    // The handler still answers rather than throwing; the SQL below is the
    // real subject. (The result field is spelled in Russian, so it is read via
    // an index rather than a Cyrillic identifier, which the repo's gate bans.)
    expect(result && typeof result === 'object').toBe(true)
    expect((result as Record<string, unknown>)['началось']).toBe(false)
    expect(charges(sql), 'дом не должен списываться').toEqual([])
    // The defect: a refund for a charge that never happened mints tokens.
    expect(refunds(sql), 'дом не должен получать возврат').toEqual([])
  })

  it('обычный кошелёк: списание есть, и при отказе провайдера есть возврат', async () => {
    // The negative control. If this went silent the first test would pass for
    // the wrong reason -- a handler that never charges anybody.
    const { sql } = await runReelRender(CUSTOMER_ID, HOUSE_ID)
    expect(charges(sql).length, 'клиент обязан списываться').toBeGreaterThan(0)
    expect(refunds(sql).length, 'клиенту обязан идти возврат').toBeGreaterThan(
      0
    )
  })

  it('пустой список дома: никто не освобождён', async () => {
    // Default deployment: HOUSE_TELEGRAM_IDS unset means nobody is exempt.
    const { sql } = await runReelRender(HOUSE_ID, '')
    expect(charges(sql).length).toBeGreaterThan(0)
    expect(refunds(sql).length).toBeGreaterThan(0)
  })
})
