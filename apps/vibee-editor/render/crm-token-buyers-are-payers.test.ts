import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenBuyers, whoPaid } from './src/agent/crm-tools'

/**
 * A PAYMENT INTO THE LIVE WALLET IS A PAYMENT (CRM audit 2026-09-27, #1).
 *
 * payments_v2 is the archive; every Stars purchase since the one-wallet
 * decision lands in token_ledger. A client who paid through the owner's own
 * offer used to stay "talking" and be pitched again. Pinned: a purchase
 * counts, a grant does not, a scoped owner sees only buyers in their own
 * audience, and a dead ledger costs the live half, never the archive's.
 */
const ledger = (rows: Array<{ telegram_id: string }>) => ({
  query: vi.fn(async (sql: string) => {
    expect(sql).toMatch(/kind = 'purchase'/)
    return { rows }
  }),
})

beforeEach(() => {
  process.env.SUPABASE_URL = 'https://db.test'
  process.env.SUPABASE_SERVICE_KEY = 'k'
})
afterEach(() => vi.unstubAllGlobals())

const supabase = (answer: (path: string) => unknown[]) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const path = decodeURIComponent(String(url).split('/rest/v1/')[1] ?? '')
      return new Response(JSON.stringify(answer(path)), { status: 200 })
    })
  )

describe('whoPaid reads the live wallet too', () => {
  it('a token buyer is a payer next to the archive', async () => {
    supabase(p =>
      p.startsWith('payments_v2') ? [{ telegram_id: 900000071 }] : []
    )
    const paid = await whoPaid(
      null,
      ledger([{ telegram_id: '900000072' }]) as never
    )
    expect([...paid].sort()).toEqual(['900000071', '900000072'])
  })

  it('a scoped owner counts only buyers in their own audience', async () => {
    const seen: string[] = []
    supabase(p => {
      seen.push(p)
      if (p.startsWith('users')) return [{ telegram_id: '900000073' }]
      return []
    })
    const got = await tokenBuyers(
      ledger([
        { telegram_id: '900000073' },
        { telegram_id: '900000074' },
      ]) as never,
      ['my_bot']
    )
    expect([...got]).toEqual(['900000073'])
    expect(seen.find(p => p.startsWith('users'))).toContain(
      'bot_name=in.("my_bot")'
    )
  })

  it('a dead ledger keeps the archive answer', async () => {
    supabase(() => [{ telegram_id: 900000075 }])
    const broken = {
      query: vi.fn(async () => {
        throw new Error('down')
      }),
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const paid = await whoPaid(null, broken as never)
    expect([...paid]).toEqual(['900000075'])
    expect(warn).toHaveBeenCalled()
  })

  it('without a pool it is the archive alone, as before', async () => {
    supabase(() => [{ telegram_id: 900000076 }])
    expect([...(await whoPaid(null))]).toEqual(['900000076'])
  })
})
