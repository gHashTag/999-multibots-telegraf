/**
 * A WALLET THAT SITS STILL IS NOT VISIBLE TO A LIGHT NODE.
 *
 * `getTransactions` on TON Center has to walk back from an account's last
 * transaction to answer. A non-archival liteserver keeps only recent blocks,
 * so once our wallet has been quiet long enough for that transaction to age
 * out, every single call fails -- not intermittently, not under load, always:
 *
 *   LITE_SERVER_UNKNOWN: cannot compute block with specified transaction:
 *   cannot find block (0,5a558223fe27f617) lt=94364619000001: lt not in db
 *
 * Both lookups then return `[]`, and `findPaymentByComment` searches an empty
 * list forever: a customer's paid invoice could not have been confirmed at all.
 * Verified against the live wallet on 2026-09-19 -- archival=false reproduced
 * that exact error for both the native wallet and the jetton wallet, while
 * archival=true answered with transactions both times.
 *
 * So the flag is pinned here. It is one word in a query string and it is the
 * difference between taking money and losing it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const JETTON_WALLET =
  '0:CF31229E66836B55088AED510FDCE8CF4222FA937A083C1338B66CDB247F480D'

vi.mock('@/core/ton/config', async importActual => {
  const actual = await importActual<typeof import('@/core/ton/config')>()
  return {
    ...actual,
    getTonConfig: () => ({
      network: 'mainnet' as const,
      isMainnet: true,
      walletAddress: 'UQBaVYIj_if2F4E8ayBS52eJOuXFQd_IcsnTpvPsfug2ytKM',
      apiKey: '',
      usdtMasterAddress: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs',
      apiEndpoint: 'https://toncenter.com/api/v2',
    }),
  }
})

// The jetton wallet address comes from a get-method on chain; the address it
// resolves to is not what this test is about, so it is handed over directly.
vi.mock('@ton/ton', () => ({
  Address: { parse: (s: string) => s },
  JettonMaster: { create: () => ({}) },
  JettonWallet: {},
  TonClient: class {
    open() {
      return {
        getWalletAddress: async () => ({ toString: () => JETTON_WALLET }),
      }
    }
  },
}))

const requested: string[] = []

beforeEach(() => {
  requested.length = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      requested.push(String(url))
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, result: [] }),
      } as never
    })
  )
})

afterEach(() => vi.unstubAllGlobals())

describe('the TON lookups ask for an archive', () => {
  it('the jetton wallet is read from an archival node', async () => {
    const { getJettonTransactions } = await import('@/core/ton')
    await getJettonTransactions(
      'UQBaVYIj_if2F4E8ayBS52eJOuXFQd_IcsnTpvPsfug2ytKM',
      50
    )
    const call = requested.find(u => u.includes('getTransactions'))
    expect(call, 'no transaction lookup was made at all').toBeTruthy()
    expect(
      call,
      'a light node cannot see a wallet that has been idle; this is how a paid invoice goes unconfirmed'
    ).toContain('archival=true')
  })

  it('the native wallet is read from an archival node', async () => {
    const { getNativeTransactions } = await import('@/core/ton')
    await getNativeTransactions(
      'UQBaVYIj_if2F4E8ayBS52eJOuXFQd_IcsnTpvPsfug2ytKM',
      50
    )
    const call = requested.find(u => u.includes('getTransactions'))
    expect(call).toBeTruthy()
    expect(call).toContain('archival=true')
  })
})
