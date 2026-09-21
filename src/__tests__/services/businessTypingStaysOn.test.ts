/**
 * "TYPING…" IS ON FOR THE WHOLE ANSWER, AND OFF WHEN IT IS DONE.
 *
 * Telegram shows a chat action for about five seconds. The business path sent
 * it exactly once, before a turn that takes tens of seconds, so the client saw
 * "typing…" flicker and then silence indistinguishable from a dead assistant.
 * Now it starts the moment the message is accepted -- before any relay,
 * upload or debounce -- repeats every 4 s through the turn, survives the gap
 * between a turn and its follow-up, and stops when the last turn ends.
 *
 * Fake timers drive the lane's quiet window and the 4 s repeat together.
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

const OWNER = 900000051
const CLIENT = 900000052
const CONN = 'conn-typing'

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
  const sendChatAction = vi.fn(async () => true)
  const sendMessage = vi.fn(async () => ({ message_id: 700 }))
  const bot = {
    botInfo: { username: 'probe_bot' },
    telegram: { sendMessage, sendChatAction, callApi: vi.fn() },
    use: (fn: typeof middleware) => {
      middleware = fn
    },
  }
  svc.createBusinessMiddleware(bot as any)
  const deliver = (msg: unknown) =>
    middleware({ update: { business_message: msg } }, async () => {})
  const typing = () =>
    sendChatAction.mock.calls.filter(
      (c: any[]) =>
        c[0] === CLIENT &&
        c[1] === 'typing' &&
        c[2]?.business_connection_id === CONN
    ).length
  const toClient = () =>
    sendMessage.mock.calls.filter(
      (c: any[]) => c[2]?.business_connection_id === CONN
    ).length
  return { deliver, typing, toClient }
}

beforeEach(() => {
  answers.length = 0
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('typing in the client chat', () => {
  it('starts at accept, repeats every 4 s through the turn, and stops when the turn ends', async () => {
    const { deliver, typing, toClient } = await setup()

    await deliver(dm('хочу рилс'))
    // At accept, before the quiet window has even ended.
    expect(typing()).toBe(1)
    expect(answers).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(1500)
    expect(answers).toHaveLength(1)

    // A 20-second turn: the action is renewed every 4 s all the way through.
    await vi.advanceTimersByTimeAsync(18_500)
    expect(typing()).toBe(1 + 5)

    answers[0]('Готово.')
    await vi.advanceTimersByTimeAsync(0)
    expect(toClient()).toBe(1)
    const atEnd = typing()

    // Nothing after the answer: a lingering "typing…" would promise more.
    await vi.advanceTimersByTimeAsync(60_000)
    expect(typing()).toBe(atEnd)
  })

  it('stays on between a turn and the follow-up that answers what came during it', async () => {
    const { deliver, typing, toClient } = await setup()

    await deliver(dm('первый вопрос'))
    await vi.advanceTimersByTimeAsync(1500)
    expect(answers).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(3000)
    await deliver(dm('и ещё'))
    await vi.advanceTimersByTimeAsync(500)
    answers[0]('ответ один')
    await vi.advanceTimersByTimeAsync(0)
    expect(toClient()).toBe(1)

    // The follow-up is still in its quiet window: typing must keep going.
    const before = typing()
    await vi.advanceTimersByTimeAsync(4000)
    expect(answers).toHaveLength(2)
    expect(typing()).toBeGreaterThan(before)

    answers[1]('ответ два')
    await vi.advanceTimersByTimeAsync(0)
    expect(toClient()).toBe(2)
    const atEnd = typing()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(typing()).toBe(atEnd)
  })
})
