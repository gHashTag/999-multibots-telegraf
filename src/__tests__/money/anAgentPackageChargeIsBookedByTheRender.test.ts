/**
 * AN AGENT PACKAGE CHARGE IS BOOKED BY THE RENDER, AND THE AGENT BOT IS PAID
 * FORWARD ONCE.
 *
 * The package invoice (`agentpkg:<id>:<month|once>:<id>`) is minted by the
 * render with the cashier bot's token, so its `successful_payment` arrives in
 * handleSuccessfulPayment like the club's. Unrouted, it would fall into the
 * generic Stars top-up and become spendable tokens. Routed, the render books
 * it, and the payer's one agent bot is paid forward only when THIS call booked
 * the charge -- a charge the hourly sweep booked first goes to the team.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setEventsPoolForTests } from '@/services/trackEvent'
import { strictEventsDb } from '../services/strictEventsDb'

vi.mock('@/config', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ADMIN_IDS_ARRAY: [111],
}))
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
const botsOf = vi.fn()
const extend = vi.fn()
vi.mock('@/core/bot/managedBots/store', () => ({
  managedBotsOf: (...a: unknown[]) => botsOf(...a),
  extendManagedBot: (...a: unknown[]) => extend(...a),
}))

const PAYER = 900000071
const KEY = 'server-key-for-tests'
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
    if (u.pathname === '/api/agents/packages/verify' && method === 'POST') {
      if (verify === 'down') throw new Error('ECONNRESET')
      return { status: 200, ok: true, json: async () => verify }
    }
    throw new Error(`a package charge must not reach ${method} ${u.pathname}`)
  })
}

function update(payload: string, stars: number) {
  return {
    from: { id: PAYER, username: 'a_buyer', language_code: 'ru' },
    chat: { id: PAYER, type: 'private' },
    botInfo: { username: 't27ai_bot' },
    state: {},
    session: {},
    message: {
      successful_payment: {
        currency: 'XTR',
        total_amount: stars,
        invoice_payload: payload,
        telegram_payment_charge_id: 'stxPkg',
        provider_payment_charge_id: '',
      },
    },
    telegram: { sendMessage: vi.fn(async (..._a: unknown[]) => undefined) },
    reply: vi.fn(async (..._a: unknown[]) => undefined),
    scene: { leave: vi.fn(async () => undefined) },
  }
}

async function pay(
  payload: string,
  stars: number,
  verify: Record<string, unknown> | 'down'
) {
  wire = []
  vi.stubGlobal('fetch', network(verify))
  const ctx = update(payload, stars)
  const { handleSuccessfulPayment } = await import('@/handlers/paymentHandlers')
  await handleSuccessfulPayment(ctx as never)
  return {
    ctx,
    said: ctx.reply.mock.calls.map(c => String(c[0])).join('\n'),
    team: ctx.telegram.sendMessage.mock.calls.map(c => String(c[1])).join('\n'),
  }
}

const UNTIL = '2026-10-31T00:00:00.000Z'
function verdict(booked: number, packageId = 'blogger') {
  return {
    ok: true,
    booked: Array.from({ length: booked }, (_, i) => ({
      telegramId: String(PAYER),
      packageId,
      charge: 'month',
      stars: 10000,
      starTxId: `tx${i}`,
      until: UNTIL,
    })),
    packages: [
      { id: 'manager', active: false, until: null },
      { id: 'blogger', active: true, until: UNTIL },
      { id: 'twin', active: false, until: null },
    ],
  }
}

let db: ReturnType<typeof strictEventsDb>
beforeEach(() => {
  setPayments.mockReset()
  botsOf.mockReset()
  extend.mockReset()
  db = strictEventsDb()
  setEventsPoolForTests(db)
  process.env.RENDER_API_KEY = KEY
})
afterEach(() => {
  setEventsPoolForTests(null)
  vi.unstubAllGlobals()
})

describe('an agent package charge', () => {
  it('asks the render to book it for the payer, and writes no archive row', async () => {
    botsOf.mockResolvedValue([])
    const { said } = await pay(
      `agentpkg:blogger:month:${PAYER}`,
      10000,
      verdict(1)
    )
    expect(setPayments).not.toHaveBeenCalled()
    expect(wire).toEqual([
      {
        url: `https://vibee-render-production.up.railway.app/api/agents/packages/verify?telegram_id=${PAYER}`,
        method: 'POST',
        key: KEY,
      },
    ])
    expect(said).toContain('Месяц работы агента оплачен')
    expect(said).toContain('31 октября 2026')
  })

  it("pays the payer's one agent bot forward by 30 days, with the package's media", async () => {
    botsOf.mockResolvedValue([{ botUsername: 'my_agent_bot', status: 'live' }])
    extend.mockResolvedValue({
      botId: 1,
      botUsername: 'my_agent_bot',
      ownerId: PAYER,
      media: true,
      paidUntil: new Date(UNTIL),
    })
    const { team } = await pay(
      `agentpkg:blogger:month:${PAYER}`,
      10000,
      verdict(1)
    )
    expect(extend).toHaveBeenCalledWith('my_agent_bot', 30, true)
    expect(team).toContain('@my_agent_bot paid until 2026-10-31')
  })

  it('the Manager Agent stays text only', async () => {
    botsOf.mockResolvedValue([{ botUsername: 'crm_bot', status: 'live' }])
    extend.mockResolvedValue(null)
    await pay(`agentpkg:manager:month:${PAYER}`, 6250, verdict(1, 'manager'))
    expect(extend).toHaveBeenCalledWith('crm_bot', 30, false)
  })

  it('does not extend twice: a charge the sweep booked first goes to the team', async () => {
    botsOf.mockResolvedValue([{ botUsername: 'my_agent_bot', status: 'live' }])
    const { team, said } = await pay(
      `agentpkg:blogger:month:${PAYER}`,
      10000,
      verdict(0)
    )
    expect(extend).not.toHaveBeenCalled()
    expect(team).toContain('/agentbot')
    expect(said).toContain('Месяц работы агента оплачен')
  })

  it('with several bots it does not guess which one', async () => {
    botsOf.mockResolvedValue([
      { botUsername: 'a_bot' },
      { botUsername: 'b_bot' },
    ])
    const { team } = await pay(
      `agentpkg:twin:once:${PAYER}`,
      12500,
      verdict(1, 'twin')
    )
    expect(extend).not.toHaveBeenCalled()
    expect(team).toContain('payer owns 2')
  })

  it('survives the render being down: the person is told, the team is told', async () => {
    const { said, team } = await pay(
      `agentpkg:blogger:month:${PAYER}`,
      10000,
      'down'
    )
    expect(setPayments).not.toHaveBeenCalled()
    expect(extend).not.toHaveBeenCalled()
    expect(said).toContain('в течение часа')
    expect(team).toContain('Agent package paid: blogger (month)')
  })

  it('is a row in the funnel', async () => {
    botsOf.mockResolvedValue([])
    await pay(`agentpkg:blogger:month:${PAYER}`, 10000, verdict(1))
    await vi.waitFor(() =>
      expect(db.rows('user_events').map(r => r.event)).toEqual([
        'agent_package_paid',
      ])
    )
  })
})

describe('what is not a package charge does not take the package branch', () => {
  it('rejects unknown packages and malformed payloads', async () => {
    const { parseAgentPackageChargePayload } = await import(
      '@/services/agentPackageSale'
    )
    expect(
      parseAgentPackageChargePayload(`agentpkg:blogger:month:${PAYER}`)
    ).toEqual({
      packageId: 'blogger',
      charge: 'month',
      telegramId: String(PAYER),
    })
    for (const bad of [
      `agentpkg:nobody:month:${PAYER}`,
      `agentpkg:blogger:year:${PAYER}`,
      'agentpkg:blogger:month:',
      `agentpkg:blogger:setup:${PAYER}`,
      `agentpkg_blogger`,
      `club:10000:${PAYER}`,
      `tokens:150:${PAYER}`,
      null,
    ]) {
      expect(parseAgentPackageChargePayload(bad), String(bad)).toBeNull()
    }
  })

  it('mirrors the payload the catalogue mints', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(
      join(
        __dirname,
        '../../../apps/vibee-editor/packages/vibee-atoms/src/agent-packages.ts'
      ),
      'utf8'
    )
    expect(src).toContain('/^agentpkg:([a-z]{2,20}):(month|once):(\\d{5,15})$/')
  })
})
