/**
 * A RAW APP URL NEVER REACHES A BUSINESS CLIENT.
 *
 * Owner, 2026-09-22: outside Telegram the app has no signature and does not
 * open. A Business message cannot carry a web_app button either, so the only
 * door that works there is the bot's t.me link. The agent may still write
 * `https://app.t27.ai/...` from memory; the reply path rewrites it before the
 * client sees it (navigation/helpers/appLinks.ts, rewriteAppUrls).
 *
 * Harness copied from businessTypingStaysOn.test.ts: the real middleware, a
 * fake agent, a fake Telegram client; ids are invented (9000000xx).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const answers: Array<(text: string) => void> = []
vi.mock('@/services/trinityAgent', () => ({
  /* cyrillic-ok */ спроситьАгента: () =>
    new Promise(resolve => {
      answers.push(t => resolve({ текст: t })) // cyrillic-ok: pre-existing field
    }),
  recordTurns: vi.fn(async () => undefined),
  fetchHistory: vi.fn(async () => []),
  markSurface: (content: string) => content,
}))
vi.mock('@/services/aiChatService', () => ({
  chatWithAI: vi.fn(async () => 'fallback, never expected here'),
}))
vi.mock('@/services/modelSwitch', () => ({
  mirrorDm: vi.fn(async () => ({ ok: true })),
  ingestChats: vi.fn(async () => ({})),
}))

const OWNER = 900000061
const CLIENT = 900000062
const CONN = 'conn-app-links'

let messageId = 1
const dm = (text: string) => ({
  message_id: ++messageId,
  date: Math.floor(Date.now() / 1000),
  chat: { id: CLIENT, first_name: 'Client', type: 'private' },
  from: { id: CLIENT, first_name: 'Client' },
  text,
  business_connection_id: CONN,
})

async function setup() {
  vi.resetModules()
  const svc = await import('@/services/businessBotService')
  svc.handleBusinessConnection({
    id: CONN,
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
  const sendMessage = vi.fn(async () => ({ message_id: 700 }))
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
  const deliver = (msg: unknown) =>
    middleware({ update: { business_message: msg } }, async () => {})
  const toClient = () =>
    sendMessage.mock.calls
      .filter((c: any[]) => c[2]?.business_connection_id === CONN)
      .map((c: any[]) => String(c[1]))
  return { deliver, toClient }
}

beforeEach(() => {
  answers.length = 0
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('business replies carry in-Telegram links only', () => {
  it('rewrites every raw app URL in the answer into the bot’s t.me link', async () => {
    const { deliver, toClient } = await setup()
    await deliver(dm('где посмотреть?'))
    await vi.advanceTimersByTimeAsync(1500)
    expect(answers).toHaveLength(1)

    answers[0](
      'Смотрите в ленте: https://app.t27.ai/feed, а агент тут https://vibee-editor-production.up.railway.app/chat.'
    )
    await vi.advanceTimersByTimeAsync(0)

    const sent = toClient()
    expect(sent).toHaveLength(1)
    expect(sent[0]).toBe(
      'Смотрите в ленте: https://t.me/probe_bot?start=app_feed, а агент тут https://t.me/probe_bot?start=app_chat.'
    )
    expect(sent[0]).not.toMatch(/app\.t27\.ai|vibee-editor-production/)
  })

  it('leaves an answer without app URLs exactly as the agent wrote it', async () => {
    const { deliver, toClient } = await setup()
    await deliver(dm('привет'))
    await vi.advanceTimersByTimeAsync(1500)
    answers[0]('Здравствуйте! Чем помочь? https://t27.ai')
    await vi.advanceTimersByTimeAsync(0)
    expect(toClient()).toEqual(['Здравствуйте! Чем помочь? https://t27.ai'])
  })
})
