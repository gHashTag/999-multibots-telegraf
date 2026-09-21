/**
 * A CLUB CHARGE IS BOOKED BY THE RENDER, AND NOTHING IS WRITTEN HERE.
 *
 * The club invoice (`club:<stars>:<id>`) is minted by the render with the
 * cashier bot's token, and the cashier is polled by this service -- so every
 * club month, the first and each renewal Telegram makes on its own, arrives in
 * handleSuccessfulPayment.
 *
 * Before the club branch, that payload matched no retired tier and fell into
 * the generic Stars top-up: a NEW row in payments_v2 (the archive nobody may
 * write to since 2026-09-20) and 10 000 tokens credited to the live wallet --
 * on top of the 2 571 the render credits for the same charge. 12 571 tokens
 * for 10 000 stars. Nobody was ever paid that only because nobody had ever
 * paid for the club (0 of 8 invoices, measured 2026-09-22).
 *
 * The handler is RUN here with the network faked; what is asserted is what
 * went over the wire and what went into the archive: the render's verify for
 * the payer, and nothing else.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setEventsPoolForTests } from '@/services/trackEvent'
import { strictEventsDb } from '../services/strictEventsDb'

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

const PAYER = 900000051
const KEY = 'server-key-for-tests'
const CHARGE = 'stxClub900000051'

type Wire = { url: string; method: string; key?: string }
let wire: Wire[] = []

function network(verify: Record<string, unknown> | 'down') {
  return vi.fn(async (url: unknown, init: RequestInit = {}) => {
    const href = String(url)
    const method = (init.method ?? 'GET').toUpperCase()
    wire.push({
      url: href,
      method,
      key: (init.headers as Record<string, string> | undefined)?.['X-Api-Key'],
    })
    const u = new URL(href)
    if (u.pathname === '/api/club/verify' && method === 'POST') {
      if (verify === 'down') throw new Error('ECONNRESET')
      return { status: 200, ok: true, json: async () => verify }
    }
    // Anything else -- /api/stars/credit above all -- is the defect.
    throw new Error(`a club charge must not reach ${method} ${u.pathname}`)
  })
}

function update(payload: string, recurring = false) {
  return {
    from: { id: PAYER, username: 'a_member', language_code: 'ru' },
    chat: { id: PAYER, type: 'private' },
    botInfo: { username: 't27ai_bot' },
    state: {},
    session: {},
    message: {
      successful_payment: {
        currency: 'XTR',
        total_amount: 10000,
        invoice_payload: payload,
        telegram_payment_charge_id: CHARGE,
        provider_payment_charge_id: '',
        is_recurring: recurring || undefined,
      },
    },
    telegram: { sendMessage: vi.fn(async () => undefined) },
    reply: vi.fn(async (..._a: unknown[]) => undefined),
    scene: { leave: vi.fn(async () => undefined) },
  }
}

let db: ReturnType<typeof strictEventsDb>

async function pay(
  payload: string,
  verify: Record<string, unknown> | 'down',
  recurring = false
) {
  wire = []
  vi.stubGlobal('fetch', network(verify))
  const ctx = update(payload, recurring)
  const { handleSuccessfulPayment } = await import('@/handlers/paymentHandlers')
  await handleSuccessfulPayment(ctx as never)
  return { ctx, said: ctx.reply.mock.calls.map(c => String(c[0])).join('\n') }
}

beforeEach(() => {
  setPayments.mockReset()
  setPayments.mockResolvedValue(undefined)
  db = strictEventsDb()
  setEventsPoolForTests(db)
  process.env.RENDER_API_KEY = KEY
})
afterEach(() => {
  setEventsPoolForTests(null)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const BOOKED = {
  ok: true,
  booked: 1,
  ['зачислено_токенов']: 2571, // cyrillic-ok: the render's field name
  active: true,
  granted: null,
  until: '2026-10-22T00:00:00.000Z',
  tokens_per_period: 2571,
}

describe('a club charge', () => {
  it('asks the render to book it for the payer, with the server key, and writes no archive row', async () => {
    const { said } = await pay(`club:10000:${PAYER}`, BOOKED)
    expect(setPayments).not.toHaveBeenCalled()
    expect(wire).toEqual([
      {
        url: `https://vibee-render-production.up.railway.app/api/club/verify?telegram_id=${PAYER}`,
        method: 'POST',
        key: KEY,
      },
    ])
    expect(said).toContain('Добро пожаловать в клуб')
    expect(said).toContain('2571')
    expect(said).not.toMatch(/баланс пополнен|подписка .* оформлена/i) // cyrillic-ok: UI copy under test
  })

  it('is a row in the funnel, renewal or not', async () => {
    await pay(`club:10000:${PAYER}`, BOOKED, true)
    await vi.waitFor(() =>
      expect(db.rows('user_events').map(r => r.event)).toEqual(['club_paid'])
    )
    expect(db.rows('user_events')[0].detail).toMatchObject({
      stars: 10000,
      renewal: true,
      charge: CHARGE,
    })
  })

  it('tells the truth when the booking is not visible yet, and still writes nothing', async () => {
    const { said } = await pay(`club:10000:${PAYER}`, {
      ok: false,
      booked: 0,
      active: false,
      tokens_per_period: 2571,
    })
    expect(setPayments).not.toHaveBeenCalled()
    expect(said).toContain('в течение часа')
    expect(said).not.toContain('Добро пожаловать')
  })

  it('survives the render being down: the hourly sweep books it, the person is told', async () => {
    const { said } = await pay(`club:10000:${PAYER}`, 'down')
    expect(setPayments).not.toHaveBeenCalled()
    expect(said).toContain('в течение часа')
  })

  it('announces only the tokens this booking credited', async () => {
    const { said } = await pay(`club:10000:${PAYER}`, {
      ...BOOKED,
      booked: 0,
      ['зачислено_токенов']: 0, // cyrillic-ok: the render's field name
    })
    expect(said).toContain('Добро пожаловать в клуб')
    expect(said).not.toContain('начислено')
  })
})

describe('what is not a club charge does not take the club branch', () => {
  it('a malformed club payload is not booked as the club', async () => {
    const { parseClubPayload } = await import('@/services/clubMembership')
    for (const bad of [
      'club:10000:',
      'club::900000051',
      'club:0:900000051',
      'club:10000:12',
      'club:abc:900000051',
      'foundry-master_3999_1',
      'tokens:15:900000051',
      ' club:10000:900000051',
    ]) {
      expect(parseClubPayload(bad), bad).toBeNull()
    }
    expect(parseClubPayload(`club:10000:${PAYER}`)).toEqual({
      stars: 10000,
      telegramId: String(PAYER),
    })
  })
})
