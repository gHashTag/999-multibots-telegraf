/**
 * A STAR BOUGHT IN THE BOT MUST LAND IN THE WALLET THE BOT SPENDS FROM.
 *
 * `handleSuccessfulPayment` finished every branch with `setPayments`, which
 * writes one place: the `payments_v2` archive in Supabase. The balance the bot
 * reads, and checks every paid action against, is `user_tokens` in the
 * render's Postgres. Two databases. The money went to the one nobody reads.
 *
 * It stayed invisible because the 2026-09-20 carry copied every earlier
 * payment into the live wallet by hand, so everybody who had already paid was
 * whole. The NEXT buyer would not have been: stars gone, balance unmoved, and
 * an archive row saying the sale went fine. The live ledger agreed -- not one
 * `purchase` row in its entire history.
 *
 * So the handler is RUN here, with the network faked, and what is asserted is
 * what went over the wire: a keyed credit to /api/stars/credit for the amount
 * paid. Asserted behaviourally rather than by grepping for the call, because
 * the failure was never a missing spelling -- it was a write that went to the
 * wrong database and looked perfectly correct doing it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const setPayments = vi.fn()

vi.mock('@/core/supabase/setPayments', () => ({
  setPayments: (...a: unknown[]) => setPayments(...a),
}))

vi.mock('@/core/supabase/notifyBotOwners', () => ({
  notifyBotOwners: async () => undefined,
}))

vi.mock('@/services/telegram-log.service', () => ({
  telegramLogService: {
    logPayment: async () => undefined,
    isReady: () => false,
  },
}))

vi.mock('@/handlers/getSubScribeChannel', () => ({
  getSubScribeChannel: async () => null,
}))

vi.mock('@/navigation', () => ({ showMainMenu: async () => undefined }))

const TELEGRAM_ID = 900000071
const AUTHOR_ID = '900000072'
const CHARGE = 'ch_900000071_1'

type Sent = { url: string; body: Record<string, unknown> }

/** Every POST the handler made, in order. */
let sent: Sent[] = []

/**
 * The two endpoints the handler talks to. `/api/feed/star/paid` answers the
 * feed branch's question; `/api/stars/credit` is the one under test, and it
 * answers the way the render does on a first delivery.
 */
function fakeNetwork(creditAnswer: Record<string, unknown>) {
  return vi.fn(async (url: unknown, init: { body?: string } = {}) => {
    const href = String(url)
    const body = init.body ? JSON.parse(init.body) : {}
    sent.push({ url: href, body })
    if (href.includes('/api/stars/credit'))
      return { json: async () => creditAnswer }
    return {
      json: async () => ({ ok: true, paid: true, to_telegram_id: AUTHOR_ID }),
    }
  })
}

function update(payload: string, totalAmount: number) {
  return {
    from: { id: TELEGRAM_ID, username: 'a_person', language_code: 'en' },
    chat: { id: TELEGRAM_ID, type: 'private' },
    botInfo: { username: 'test_bot' },
    session: {},
    message: {
      successful_payment: {
        currency: 'XTR',
        total_amount: totalAmount,
        invoice_payload: payload,
        telegram_payment_charge_id: CHARGE,
        provider_payment_charge_id: 'pp_1',
      },
    },
    telegram: { sendMessage: vi.fn(async (..._a: unknown[]) => undefined) },
    reply: vi.fn(async (..._a: unknown[]) => undefined),
    scene: { leave: vi.fn(async () => undefined) },
  }
}

async function pay(
  payload: string,
  totalAmount: number,
  creditAnswer: Record<string, unknown> = { ok: true, credited: true }
) {
  sent = []
  vi.stubGlobal('fetch', fakeNetwork(creditAnswer))
  const ctx = update(payload, totalAmount)
  const { handleSuccessfulPayment } = await import('@/handlers/paymentHandlers')
  await handleSuccessfulPayment(ctx as never)
  return {
    ctx,
    credits: sent.filter(s => s.url.includes('/api/stars/credit')),
    said: ctx.reply.mock.calls.map(c => String(c[0])).join('\n'),
  }
}

beforeEach(() => {
  setPayments.mockReset()
  setPayments.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('a bot star purchase credits the live wallet', () => {
  it('a plain top-up credits the amount paid, keyed on the Telegram charge', async () => {
    const { credits } = await pay('500_1758000000000', 500)
    expect(credits).toHaveLength(1)
    expect(credits[0].body).toEqual({
      chargeId: CHARGE,
      telegramId: String(TELEGRAM_ID),
      amount: 500,
    })
  })

  it('a subscription credits too, because those stars were always spendable', async () => {
    // Before the balance moved to `user_tokens` it WAS the archive sum, and a
    // subscription purchase added to it. Crediting only top-ups would quietly
    // take that away from every subscriber.
    const { credits } = await pay('NEUROBASE_1000_1758000000000', 1000)
    expect(credits).toHaveLength(1)
    expect(credits[0].body).toMatchObject({ chargeId: CHARGE, amount: 1000 })
  })

  it('a star sent in the feed credits the AUTHOR, not the sender', async () => {
    const { credits } = await pay('feedstar-90000000-0000-0000', 1)
    expect(credits).toHaveLength(1)
    expect(credits[0].body).toEqual({
      // Keyed on the payload, not the charge: the sender's own charge id is
      // already spent on their side of the transfer.
      chargeId: 'feedstar-90000000-0000-0000_author',
      telegramId: AUTHOR_ID,
      amount: 1,
    })
  })

  it('the club membership stays balance-neutral and credits nothing', async () => {
    // The club fee buys a month, not stars. Its archive pair is an income and
    // a compensating debit; a live credit would turn the fee into spendable
    // balance and hand the money back.
    const { credits } = await pay('foundry-apprentice_1499_1758000000000', 1499)
    expect(credits).toHaveLength(0)
  })
})

describe('it does not claim a top-up that did not happen', () => {
  it('a refused credit is told to the buyer instead of a cheerful confirmation', async () => {
    const { said } = await pay('500_1758000000000', 500, {
      ok: true,
      credited: false,
      reason: 'ledger write failed',
    })
    // The Russian half of the reply this must NOT say.
    expect(said).not.toMatch(/баланс пополнен|has been replenished/i) // cyrillic-ok: user-facing wording
    expect(said).toMatch(/admin@t27\.ai/)
  })

  it('a redelivery is NOT a failure -- the tokens are already there', async () => {
    // Telegram redelivers successful payments, and the render's idempotency
    // lock answers `credited: false`. Alarming on that would fire a scary
    // message at somebody whose money arrived perfectly well the first time.
    const { said } = await pay('500_1758000000000', 500, {
      ok: true,
      credited: false,
      reason: 'already credited (redelivery)',
    })
    expect(said).toMatch(/has been replenished/i)
  })

  it('the owner is told when a paid top-up did not reach the wallet', async () => {
    process.env.ADMIN_CHAT_ID = '777000'
    try {
      const { ctx } = await pay('500_1758000000000', 500, { ok: false })
      const notices = ctx.telegram.sendMessage.mock.calls.map(c => String(c[1]))
      // With the charge id in it: the fix for one of these is a credit by
      // hand, and a notice that omits the key cannot be acted on.
      expect(notices.some(n => n.includes(CHARGE))).toBe(true)
    } finally {
      delete process.env.ADMIN_CHAT_ID
    }
  })
})
