/**
 * THE READ THAT FAILED MUST NOT COME BACK AS AN ANSWER ABOUT SOMEBODY'S MONEY.
 *
 * Both TON readers wrapped everything in one try/catch that ended `return []`.
 * A rate limit, a dropped connection, an HTML error page, a hung request and
 * `lt not in db` all arrived at the caller in the shape of a fact:
 *
 *   the payer pressing "check payment" was told "платёж пока не найден" --
 *   a statement about their coins, made without looking at the chain;
 *
 *   the hourly watch wrote a journal line saying it had examined N pending
 *   invoices and found the channel clean, having examined nothing.
 *
 * `tonPendingWatch.ts` spells this rule out for its DATABASE read and then
 * committed the identical mistake one screen down for its CHAIN read. These
 * tests drive the real readers against a stubbed fetch, one refusal shape per
 * case, and pin that each one travels instead of becoming an empty list -- and
 * that a read which genuinely succeeded still answers normally.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { chainWasUnreadable } from '@/core/ton/chainRead'

const WALLET = 'UQBaVYIj_if2F4E8ayBS52eJOuXFQd_IcsnTpvPsfug2ytKM'
const JETTON_WALLET =
  '0:CF31229E66836B55088AED510FDCE8CF4222FA937A083C1338B66CDB247F480D'

vi.mock('@/core/ton/config', async importActual => {
  const actual = await importActual<typeof import('@/core/ton/config')>()
  return {
    ...actual,
    getTonConfig: () => ({
      network: 'mainnet' as const,
      isMainnet: true,
      walletAddress: WALLET,
      apiKey: '',
      usdtMasterAddress: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs',
      apiEndpoint: 'https://toncenter.com/api/v2',
    }),
  }
})

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

vi.mock('@/utils/logger', () => ({
  logger: {
    info: () => undefined,
    warn: () => undefined,
    debug: () => undefined,
    error: () => undefined,
  },
}))

/** Stub one HTTP answer from TON Center. */
const answers = (response: Partial<Response> & { json?: () => Promise<any> }) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => response as never)
  )

/** A transfer of 1 TON carrying an invoice id, in TON Center's own shape. */
const paidTx = (comment: string) => ({
  transaction_id: { hash: 'h', lt: '1' },
  utime: 1_700_000_000,
  in_msg: {
    source: 'UQsomebody',
    value: '1000000000',
    msg_data: {
      '@type': 'msg.dataText',
      text: Buffer.from(comment, 'utf-8').toString('base64'),
    },
  },
})

const ton = () => import('@/core/ton')

beforeEach(() => vi.resetModules())
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('a refusal from the TON API', () => {
  it('travels, when the API rate-limits us', async () => {
    // A 429 body is HTML, so `.json()` threw into the outer catch -- and a
    // rate limit became "this wallet has never received anything".
    answers({
      ok: false,
      status: 429,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON')
      },
    })
    const { getNativeTransactions } = await ton()

    await expect(getNativeTransactions(WALLET, 50)).rejects.toThrow('HTTP 429')
  })

  it('travels, when the liteserver cannot find the block', async () => {
    // The production alarm, verbatim: this is a 200 with ok:false, which the
    // old code logged and turned into an empty list.
    answers({
      ok: true,
      status: 200,
      json: async () => ({
        ok: false,
        error: 'LITE_SERVER_UNKNOWN: ... lt=94364619000001: lt not in db',
      }),
    })
    const { getNativeTransactions } = await ton()

    await expect(getNativeTransactions(WALLET, 50)).rejects.toThrow(
      'lt not in db'
    )
  })

  it('travels, when the connection drops', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNRESET')
      })
    )
    const { getNativeTransactions } = await ton()

    await expect(getNativeTransactions(WALLET, 50)).rejects.toThrow(
      'ECONNRESET'
    )
  })

  it('gives up rather than hanging forever', async () => {
    /*
     * There was no timeout at all. The watch runs with retries 0 and
     * concurrency 1, so one request that never answers parks the hourly sweep
     * until Inngest's own ceiling, with the next run queued behind it.
     */
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () =>
              reject(new Error('The operation was aborted'))
            )
          })
      )
    )
    const { getNativeTransactions } = await ton()

    const pending = getNativeTransactions(WALLET, 50)
    const asserted = expect(pending).rejects.toThrow('no answer in 15s')
    await vi.advanceTimersByTimeAsync(15_000)
    await asserted
  })

  it('is recognisable as "could not look", not as a defect of ours', async () => {
    answers({ ok: false, status: 503, json: async () => ({}) })
    const { getNativeTransactions } = await ton()

    const error = await getNativeTransactions(WALLET, 50).catch(
      (e: unknown) => e
    )

    expect(chainWasUnreadable(error)).toBe(true)
  })

  it('travels through the jetton reader too', async () => {
    answers({ ok: false, status: 429, json: async () => ({}) })
    const { getJettonTransactions } = await ton()

    await expect(getJettonTransactions(WALLET, 50)).rejects.toThrow('HTTP 429')
  })
})

describe('the finder on top of it', () => {
  it('refuses to answer "not paid" about a chain it never read', async () => {
    // THE LINE THAT MATTERS. `null` here is what the scene prints as
    // "payment not found yet", and what the watch counts as a clean channel.
    answers({ ok: false, status: 429, json: async () => ({}) })
    const { findNativePaymentByComment } = await ton()

    await expect(
      findNativePaymentByComment(WALLET, 'TONN-1', 1)
    ).rejects.toThrow('HTTP 429')
  })

  it('still says "not paid" when it did read, and nothing matched', async () => {
    answers({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: [paidTx('TONN-somebody-else')] }),
    })
    const { findNativePaymentByComment } = await ton()

    await expect(findNativePaymentByComment(WALLET, 'TONN-1', 1)).resolves.toBe(
      null
    )
  })

  it('still finds the payment that is there', async () => {
    // Without this, every assertion above could pass on a reader that throws
    // unconditionally and confirms nobody's money.
    answers({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: [paidTx('TONN-1')] }),
    })
    const { findNativePaymentByComment } = await ton()

    const hit = await findNativePaymentByComment(WALLET, 'TONN-1', 1)

    expect(hit?.comment).toBe('TONN-1')
  })
})
