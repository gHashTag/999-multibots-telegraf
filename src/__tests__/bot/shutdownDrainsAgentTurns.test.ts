/**
 * SHUTDOWN WAITS FOR THE TURNS IT ALREADY ACCEPTED.
 *
 * Handlers only accept now; the agent turns run in the lanes. A client's
 * message is confirmed to Telegram when it is fetched, so the next process
 * will never see it again. `gracefulShutdown` used to call process.exit(0)
 * straight after stopping the bots -- and Railway's default grace between
 * SIGTERM and SIGKILL is 0 s -- which cut any answer in flight.
 *
 * Three things are held here:
 *   1. the wiring: gracefulShutdown stops polling, THEN awaits the drain, THEN
 *      exits (structural, in the style of shutdownDoesNotPageTheOwner);
 *   2. the budget: the drain ends before Railway's kill (railway.toml
 *      drainingSeconds), and a broken SHUTDOWN_DRAIN_MS does not turn it off;
 *   3. the leftovers: a business client still unanswered when the drain gives
 *      up is named to their seller, once -- and nobody is told anything when
 *      nothing was left.
 */
import { describe, it, expect, vi } from 'vitest'
import fs from 'fs'
import path from 'path'

vi.mock('@/services/trinityAgent', () => ({
  // A turn that never ends: what the drain has to give up on.
  /* cyrillic-ok */ спроситьАгента: () => new Promise(() => {}),
  recordTurns: vi.fn(async () => undefined),
  fetchHistory: vi.fn(async () => []),
  markSurface: (content: string) => content,
}))
vi.mock('@/services/aiChatService', () => ({
  chatWithAI: vi.fn(async () => 'unused'),
}))
vi.mock('@/services/modelSwitch', () => ({
  mirrorDm: vi.fn(async () => ({ ok: true })),
  ingestChats: vi.fn(async () => ({})),
}))

const REPO = path.join(__dirname, '..', '..', '..')
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('gracefulShutdown drains the agent lanes before it exits', () => {
  const src = strip(fs.readFileSync(path.join(REPO, 'src/index.ts'), 'utf8'))
  const start = src.indexOf('async function gracefulShutdown(')
  const end = src.indexOf("process.once('SIGTERM'", start)
  const body = src.slice(start, end)

  it('the function and its boundary are where this test looks', () => {
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    expect(body).toMatch(/process\.exit\(0\)/)
  })

  it('stops polling, then awaits the drain, then tells owners, then exits', () => {
    const stop = body.search(/await\s+stopBotsQuietly\(/)
    const drain = body.search(/await\s+agentLanes\.drain\(/)
    const tell = body.search(/tellOwnersWhoWasLeftUnanswered\(unfinished\)/)
    const exit = body.search(/process\.exit\(0\)/)
    expect(stop, 'stopBotsQuietly is awaited').toBeGreaterThan(-1)
    expect(
      drain,
      'the drain is awaited, not fired and forgotten'
    ).toBeGreaterThan(-1)
    expect(tell).toBeGreaterThan(-1)
    expect(stop).toBeLessThan(drain)
    expect(drain).toBeLessThan(tell)
    expect(tell).toBeLessThan(exit)
    // The budget comes from the one parser, not from a bare Number(...).
    expect(body).toMatch(/shutdownDrainMs\(process\.env\.SHUTDOWN_DRAIN_MS\)/)
  })
})

describe('the drain budget', () => {
  it('SHUTDOWN_DRAIN_MS: a number is used, anything else is the 25 s default -- never 0 by accident', async () => {
    const { shutdownDrainMs, SHUTDOWN_DRAIN_DEFAULT_MS } = await import(
      '@/services/agentLanes'
    )
    expect(SHUTDOWN_DRAIN_DEFAULT_MS).toBe(25_000)
    expect(shutdownDrainMs(undefined)).toBe(25_000)
    expect(shutdownDrainMs('')).toBe(25_000)
    expect(shutdownDrainMs('soon')).toBe(25_000)
    expect(shutdownDrainMs('-5')).toBe(25_000)
    expect(shutdownDrainMs('10000')).toBe(10_000)
    expect(shutdownDrainMs('0')).toBe(0)
  })

  it('ends before Railway kills the container: drainingSeconds in [deploy] is longer than the drain', async () => {
    const { SHUTDOWN_DRAIN_DEFAULT_MS } = await import('@/services/agentLanes')
    const toml = fs.readFileSync(path.join(REPO, 'railway.toml'), 'utf8')
    const deploy = /\n\[deploy\]\n([\s\S]*?)(\n\[|$)/.exec(toml)?.[1] ?? ''
    const seconds = Number(
      /^drainingSeconds\s*=\s*(\d+)\s*$/m.exec(deploy)?.[1]
    )
    expect(Number.isFinite(seconds)).toBe(true)
    // At least five seconds left for the owners' notices and the exit.
    expect(seconds * 1000 - SHUTDOWN_DRAIN_DEFAULT_MS).toBeGreaterThanOrEqual(
      5000
    )
  })
})

describe('who was left unanswered is told to their seller', () => {
  async function acceptOne(clientId: number, name: string) {
    vi.resetModules()
    const svc = await import('@/services/businessBotService')
    const { agentLanes } = await import('@/services/agentLanes')
    const OWNER = 900000101
    svc.handleBusinessConnection({
      id: 'conn-shutdown',
      user: { id: OWNER, first_name: 'Owner' },
      user_chat_id: OWNER,
      date: 1,
      is_enabled: true,
      rights: { can_reply: true },
    } as any)
    let middleware: (
      ctx: any,
      next: () => Promise<void>
    ) => Promise<void> = async () => {}
    const sendMessage = vi.fn(async () => ({ message_id: 1 }))
    const bot = {
      botInfo: { username: 'probe_bot' },
      telegram: {
        sendMessage,
        sendChatAction: vi.fn(async () => true),
        callApi: vi.fn(),
      },
      use: (fn: typeof middleware) => {
        middleware = fn
      },
    }
    svc.createBusinessMiddleware(bot as any)
    await middleware(
      {
        update: {
          business_message: {
            message_id: 1,
            date: Math.floor(Date.now() / 1000),
            chat: { id: clientId, first_name: name, type: 'private' },
            from: { id: clientId, first_name: name },
            text: 'здравствуйте',
            business_connection_id: 'conn-shutdown',
          },
        },
      },
      async () => {}
    )
    return { svc, agentLanes, sendMessage, OWNER }
  }

  it('a turn that outlives the drain is reported: one message to the seller naming the client', async () => {
    const CLIENT = 900000102
    const { svc, agentLanes, sendMessage, OWNER } = await acceptOne(
      CLIENT,
      'Client A'
    )
    const { unfinished } = await agentLanes.drain(300)
    expect(unfinished).toEqual([`biz:conn-shutdown:${CLIENT}`])

    sendMessage.mockClear()
    const told = await svc.tellOwnersWhoWasLeftUnanswered([
      ...unfinished,
      'dm:900000103',
      'crm:900000101',
    ])
    expect(told).toBe(1)
    expect(sendMessage).toHaveBeenCalledTimes(1)
    const [chatId, text, extra] = sendMessage.mock.calls[0] as unknown as [
      number,
      string,
      any,
    ]
    expect(chatId).toBe(OWNER)
    expect(text).toContain('Client A')
    expect(text).toContain(`tg://user?id=${CLIENT}`)
    // To the seller's own chat, never into the client's chat.
    expect(extra?.business_connection_id).toBeUndefined()
  })

  it('nothing unfinished, nothing sent', async () => {
    const { svc, sendMessage } = await acceptOne(900000104, 'Client B')
    sendMessage.mockClear()
    expect(await svc.tellOwnersWhoWasLeftUnanswered([])).toBe(0)
    expect(sendMessage).not.toHaveBeenCalled()
  })
})
