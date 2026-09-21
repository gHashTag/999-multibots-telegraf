/**
 * THE OWNER TYPED ONE LINE AND THE ASSISTANT DISAPPEARED FOR HALF AN HOUR.
 *
 * The DM surface is Telegram Business: a customer writes to the owner's own
 * account and the bot answers on their behalf. When the owner answers by hand
 * in such a chat, the assistant steps aside for OWNER_TAKEOVER_MS -- correct,
 * and not what broke.
 *
 * What broke is that the stepping aside was invisible and one-way. Production,
 * 2026-09-21, connection 8ibS7...uRA, chat 229866794:
 *
 *   11:56:38  [Business] Reply sent                    <- the last answer
 *   12:00:15  [Business] Owner replied manually, AI paused
 *   12:00:45  [Business] Owner takeover active, AI silent
 *   12:03:44  [Business] Owner takeover active, AI silent
 *   12:08:40  [Business] Owner takeover active, AI silent
 *   12:08:57  [Business] Owner takeover active, AI silent
 *
 * Four customer messages dropped. Every line above is `info`, which goes to a
 * log file and nowhere near a phone, and the only control that existed was
 * `pauseAiFor` -- a mute with no un-mute, offered under a button that reads
 * "I will answer myself". So the owner reported a dead agent, and from where
 * they sat that is precisely what it looked like.
 *
 * Pinned here: the pause announces itself once per window, in the OWNER's own
 * chat and never in the customer's, carrying the way back; and `resumeAiFor`
 * really does make the next customer message answerable again.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const chatWithAI = vi.fn(async () => 'ok reply')
vi.mock('@/services/aiChatService', () => ({
  chatWithAI: (...args: unknown[]) => chatWithAI(...(args as [])),
}))
vi.mock('@/core/supabase', () => ({
  getUserLanguageFromDB: vi.fn(async () => null),
}))

const CONN = 'conn-owner-1'
const BOT = 'neuro_blogger_bot'
const OWNER = 144022504
const CUSTOMER = 229866794

// The CRM buttons are only offered to an admin of this bot -- a farm owner
// outside ADMIN_IDS would press controls nobody answers. Set before the
// service (and with it `@/config`) is ever imported.
process.env.ADMIN_IDS = String(OWNER)

const connection = () => ({
  id: CONN,
  user: { id: OWNER, first_name: 'Owner' },
  user_chat_id: OWNER,
  date: 1,
  is_enabled: true,
  rights: { can_reply: true },
})

/** A message the customer sends into the owner's DM. */
const fromCustomer = (text = 'How much is it?') => ({
  message_id: 7,
  date: 1,
  chat: { id: CUSTOMER, first_name: 'Customer', type: 'private' },
  from: { id: CUSTOMER, first_name: 'Customer' },
  text,
  business_connection_id: CONN,
})

/**
 * The owner answering by hand. Telegram delivers it through the same stream:
 * the chat is still the CUSTOMER's, only `from` is the owner -- which is why
 * the notice must read the name off the chat and not off the sender.
 */
const fromOwner = (text = 'I will take this one') => ({
  message_id: 8,
  date: 2,
  chat: { id: CUSTOMER, first_name: 'Customer', type: 'private' },
  from: { id: OWNER, first_name: 'Owner' },
  text,
  business_connection_id: CONN,
})

/** Anything sent through the connection lands in the customer's chat. */
const toCustomer = (bot: any) =>
  bot.telegram.sendMessage.mock.calls.filter(
    (c: any[]) => c[2] && c[2].business_connection_id === CONN
  )

/** Anything sent to the owner's own chat, outside the connection. */
const toOwner = (bot: any) =>
  bot.telegram.sendMessage.mock.calls.filter(
    (c: any[]) => c[0] === OWNER && !(c[2] && c[2].business_connection_id)
  )

function fakeBot() {
  const sendMessage = vi.fn(async () => ({ message_id: 1 }))
  const sendChatAction = vi.fn(async () => true)
  const callApi = vi.fn(async () => connection())
  return {
    botInfo: { username: BOT },
    telegram: { sendMessage, sendChatAction, callApi },
  }
}

async function freshService() {
  vi.resetModules()
  const svc = await import('@/services/businessBotService')
  svc.handleBusinessConnection(connection() as any)
  return svc
}

beforeEach(() => {
  chatWithAI.mockClear()
})

describe('the owner takes a chat over by typing in it', () => {
  it('still stops the assistant answering the customer', async () => {
    // The pause itself is wanted -- this is the control for everything below.
    const svc = await freshService()
    const bot = fakeBot()

    await svc.handleBusinessMessage(fromOwner() as any, bot as any, BOT)
    await svc.handleBusinessMessage(fromCustomer() as any, bot as any, BOT)

    expect(toCustomer(bot), 'the assistant talked over the owner').toEqual([])
    expect(chatWithAI).not.toHaveBeenCalled()
  })

  it('tells the OWNER it has gone quiet, and for how long', async () => {
    const svc = await freshService()
    const bot = fakeBot()

    await svc.handleBusinessMessage(fromOwner() as any, bot as any, BOT)

    const notices = toOwner(bot)
    expect(
      notices,
      'the pause was silent, as it was in production'
    ).toHaveLength(1)
    const said = String(notices[0][1])
    // Who, and how long: without both, the owner still cannot tell what broke.
    expect(said).toContain('Customer')
    expect(said).toContain(String(Math.round(svc.OWNER_TAKEOVER_MS / 60_000)))
  })

  it('never sends that notice into the chat the customer can see', async () => {
    const svc = await freshService()
    const bot = fakeBot()

    await svc.handleBusinessMessage(fromOwner() as any, bot as any, BOT)

    expect(toCustomer(bot)).toEqual([])
  })

  it('says it once per pause, not once per typed line', async () => {
    // The owner answering three times is one takeover, not three notices.
    const svc = await freshService()
    const bot = fakeBot()

    await svc.handleBusinessMessage(fromOwner('one') as any, bot as any, BOT)
    await svc.handleBusinessMessage(fromOwner('two') as any, bot as any, BOT)
    await svc.handleBusinessMessage(fromOwner('three') as any, bot as any, BOT)

    expect(toOwner(bot)).toHaveLength(1)
  })

  it('carries the button that ends the pause', async () => {
    const svc = await freshService()
    const bot = fakeBot()

    await svc.handleBusinessMessage(fromOwner() as any, bot as any, BOT)

    const markup = toOwner(bot)[0][2]?.reply_markup
    const data = JSON.stringify(markup?.inline_keyboard ?? [])
    expect(data, 'a pause with no way out is the defect itself').toContain(
      `crm:unmute:${CUSTOMER}`
    )
  })
})

describe('handing the chat back', () => {
  it('lets the assistant answer the next customer message', async () => {
    const svc = await freshService()
    const bot = fakeBot()

    await svc.handleBusinessMessage(fromOwner() as any, bot as any, BOT)
    expect(svc.resumeAiFor(CUSTOMER, OWNER)).toBe(1)
    await svc.handleBusinessMessage(fromCustomer() as any, bot as any, BOT)

    expect(toCustomer(bot).length).toBeGreaterThan(0)
  })

  it('reports nothing to undo when the assistant was never muted', async () => {
    const svc = await freshService()

    expect(svc.resumeAiFor(CUSTOMER, OWNER)).toBe(0)
  })

  it('refuses to un-mute on behalf of a different owner', async () => {
    // One process serves many business connections; a press from one owner
    // must not reach into another owner's conversation.
    const svc = await freshService()
    const bot = fakeBot()

    await svc.handleBusinessMessage(fromOwner() as any, bot as any, BOT)

    expect(svc.resumeAiFor(CUSTOMER, 999999)).toBe(0)
    await svc.handleBusinessMessage(fromCustomer() as any, bot as any, BOT)
    expect(toCustomer(bot)).toEqual([])
  })

  it('announces the next takeover again after the chat was handed back', async () => {
    // The "say it once" guard must be cleared by the hand-back, or a second
    // takeover would be as invisible as the first one was.
    const svc = await freshService()
    const bot = fakeBot()

    await svc.handleBusinessMessage(fromOwner() as any, bot as any, BOT)
    svc.resumeAiFor(CUSTOMER, OWNER)
    await svc.handleBusinessMessage(fromOwner() as any, bot as any, BOT)

    expect(toOwner(bot)).toHaveLength(2)
  })
})

describe('the pause is readable as a number of minutes', () => {
  it('counts down while the owner holds the chat', async () => {
    const svc = await freshService()
    const bot = fakeBot()

    expect(svc.aiPausedMinutes(CUSTOMER, OWNER)).toBe(0)
    await svc.handleBusinessMessage(fromOwner() as any, bot as any, BOT)

    const left = svc.aiPausedMinutes(CUSTOMER, OWNER)
    expect(left).toBeGreaterThan(0)
    expect(left).toBeLessThanOrEqual(Math.ceil(svc.OWNER_TAKEOVER_MS / 60_000))
  })

  it('reads zero for a chat nobody took over', async () => {
    const svc = await freshService()
    const bot = fakeBot()

    await svc.handleBusinessMessage(fromOwner() as any, bot as any, BOT)

    expect(svc.aiPausedMinutes(555111222, OWNER)).toBe(0)
  })
})
