/**
 * WHO THE CRM WORKS FOR: whoever connected their own Telegram account.
 *
 * Measured 2026-09-13 on the render's Postgres: tg_sessions held two rows,
 * the owner's (144022504, @t27_dev) and @playom's (435572800). The second
 * had done the login in the app on 2026-09-09 and was still refused by the
 * CRM tools, because the gate compared the caller to ONE id from the
 * environment. This file pins the replacement: a seller is a person with a
 * row, the owner is always a seller, a stranger is refused with the fix in
 * words, and the list tool never returns a session string.
 * Spec: t27 specs/automation/crm-sellers.t27.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const OWNER = '144022504'
const PLAYOM = '435572800'
const STRANGER = '900000042'
process.env.OWNER_TELEGRAM_ID = OWNER
delete process.env.TELEGRAM_SESSION_STRING

/** A base with the two measured rows; the session strings are invented. */
function sessionsPool(rows: Array<{ telegram_id: string; updated_at: string }>) {
  const queries: string[] = []
  return {
    queries,
    query: async (sql: string, params: unknown[] = []) => {
      queries.push(sql.replace(/\s+/g, ' ').trim())
      if (/CREATE TABLE/i.test(sql)) return { rows: [] }
      if (/SELECT session FROM tg_sessions/.test(sql)) {
        const hit = rows.find(r => r.telegram_id === String(params[0]))
        return { rows: hit ? [{ session: 'x'.repeat(369) }] : [] }
      }
      if (/SELECT telegram_id, updated_at FROM tg_sessions/.test(sql)) {
        return { rows: rows.map(r => ({ ...r })) }
      }
      return { rows: [] }
    },
  }
}

const TWO = [
  { telegram_id: PLAYOM, updated_at: '2026-09-09T10:00:00.000Z' },
  { telegram_id: OWNER, updated_at: '2026-09-07T10:00:00.000Z' },
]

beforeEach(() => {
  vi.resetModules()
})

describe('requireSeller', () => {
  it('admits a connected account that is not the owner', async () => {
    const { requireSeller, isSeller } = await import(
      './src/agent/telegram-tools'
    )
    const ctx = { telegramId: PLAYOM, pool: sessionsPool(TWO) } as never
    await expect(requireSeller(ctx)).resolves.toBeUndefined()
    expect(await isSeller(ctx)).toBe(true)
  })

  it('admits the owner even on a base with no rows', async () => {
    const { isSeller } = await import('./src/agent/telegram-tools')
    expect(
      await isSeller({ telegramId: OWNER, pool: sessionsPool([]) } as never)
    ).toBe(true)
  })

  it('refuses a stranger, names the fix, and reads only the caller row', async () => {
    const { requireSeller } = await import('./src/agent/telegram-tools')
    const pool = sessionsPool(TWO)
    await expect(
      requireSeller({ telegramId: STRANGER, pool } as never)
    ).rejects.toThrow('не подключён')
    const reads = pool.queries.filter(q => /SELECT/.test(q))
    expect(reads).toHaveLength(1)
    expect(reads[0]).toMatch(/WHERE telegram_id = \$1/)
  })

  it('refuses when nobody is asking', async () => {
    const { requireSeller } = await import('./src/agent/telegram-tools')
    await expect(requireSeller(undefined)).rejects.toThrow('кто спрашивает')
  })
})

describe('crm_sellers', () => {
  it('lists both connected accounts, newest first, without a session string', async () => {
    const { CRM_SELLERS_TOOLS } = await import('./src/agent/crm-sellers-tool')
    const tool = CRM_SELLERS_TOOLS[0]
    expect(tool.name).toBe('crm_sellers')
    const out: any = await tool.handler(
      {},
      { telegramId: OWNER, pool: sessionsPool(TWO) } as never
    )
    expect(out.count).toBe(2)
    expect(out.probed).toBe(false)
    expect(out.sellers.map((s: any) => s.telegram_id)).toEqual([PLAYOM, OWNER])
    expect(out.sellers[1].is_owner).toBe(true)
    expect(out.sellers[0].is_owner).toBe(false)
    expect(JSON.stringify(out)).not.toContain('xxxx')
  })

  it('is for the owner only: a seller who is not the owner is refused', async () => {
    const { CRM_SELLERS_TOOLS } = await import('./src/agent/crm-sellers-tool')
    await expect(
      CRM_SELLERS_TOOLS[0].handler(
        {},
        { telegramId: PLAYOM, pool: sessionsPool(TWO) } as never
      )
    ).rejects.toThrow('владельцу')
  })

  it('sellerIds reduces rows to ids for the sweep', async () => {
    const { sellerIds } = await import('./src/agent/crm-sellers-tool')
    expect(
      sellerIds([
        { telegram_id: PLAYOM, connected_at: null, is_owner: false },
        { telegram_id: OWNER, connected_at: null, is_owner: true },
      ])
    ).toEqual([PLAYOM, OWNER])
  })

  it('is registered in the tool registry', async () => {
    const { TOOLS_BY_NAME } = await import('./src/agent/tools')
    expect(TOOLS_BY_NAME.has('crm_sellers')).toBe(true)
  })
})

describe('crm_offer refuses an offer to the CALLER, not to the owner', () => {
  it('a seller offering to their own id is refused; offering to the owner is not a self-offer', async () => {
    const { resolveLead } = await import('./src/agent/crm-offer-tool')
    const ctx = {
      telegramId: PLAYOM,
      pool: { query: async () => ({ rows: [{ telegram_id: OWNER }] }) },
    } as never
    await expect(resolveLead(ctx, PLAYOM)).rejects.toThrow('самому себе')
    // The owner's id is a person like any other to a second seller: it must
    // not be refused as a self-offer (it may still be refused elsewhere).
    let selfRefusal = false
    try {
      await resolveLead(ctx, OWNER)
    } catch (e) {
      selfRefusal = String((e as Error).message).includes('самому себе')
    }
    expect(selfRefusal).toBe(false)
  })
})
