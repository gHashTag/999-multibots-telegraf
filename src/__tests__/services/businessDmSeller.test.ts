/**
 * The owner-DM seller: what happens around the AI reply.
 *
 * - The owner learns about a new customer ONCE per chat per day, in the
 *   owner's own private chat (user_chat_id), never through the business
 *   connection (that would post into the customer's chat), with the customer's
 *   name HTML-escaped (a name like "<b>x" would otherwise make Telegram reject
 *   the message and the lead would vanish silently).
 * - Every AI reply carries one url button into the bot, deep-linked to the
 *   service the customer asked about (svc_<key>) or to the bot itself.
 * - Telegram's away/greeting messages (is_from_offline) and the bot's own
 *   outgoing messages (sender_business_bot) are never answered: answering them
 *   loops.
 * - When the owner types in a chat themselves, the AI goes silent there for
 *   OWNER_TAKEOVER_MS and resumes afterwards.
 * - A photo/voice/video/document gets a short "text only" reply and is
 *   counted; a sticker gets nothing. Neither reaches the LLM.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const chatWithAI = vi.fn(async () => 'ok reply')
vi.mock('@/services/aiChatService', () => ({
  chatWithAI: (...args: unknown[]) => chatWithAI(...(args as [])),
}))
// The render's answer to "did the agent send this message?" -- false unless a
// test says otherwise; never the network.
const wasAgentSent = vi.fn(async () => false)
vi.mock('@/services/modelSwitch', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/modelSwitch')>()),
  wasAgentSent: (...args: unknown[]) => wasAgentSent(...(args as [])),
}))

const CONN = 'conn-seller-1'
const OWNER_ID = 144022504
const OWNER_CHAT = 999000111
const BOT = 'neuro_blogger_bot'

const connection = () => ({
  id: CONN,
  user: { id: OWNER_ID, first_name: 'Owner' },
  user_chat_id: OWNER_CHAT,
  date: 1,
  is_enabled: true,
  rights: { can_reply: true },
})

const dm = (extra: Record<string, unknown> = {}, chatId = 555) => ({
  message_id: 7,
  date: 1,
  chat: { id: chatId, first_name: 'Customer', type: 'private' },
  from: { id: chatId, first_name: 'Customer', username: 'cust' },
  text: 'Хочу видео из текста',
  business_connection_id: CONN,
  ...extra,
})

function fakeBot() {
  return {
    botInfo: { username: BOT },
    telegram: {
      sendMessage: vi.fn(async () => ({ message_id: 1 })),
      sendChatAction: vi.fn(async () => true),
      sendPhoto: vi.fn(async () => ({ message_id: 3 })),
      sendVideo: vi.fn(async () => ({ message_id: 3 })),
      sendDocument: vi.fn(async () => ({ message_id: 3 })),
      sendVoice: vi.fn(async () => ({ message_id: 3 })),
      callApi: vi.fn(async () => connection()),
    },
  }
}

async function fresh() {
  vi.resetModules()
  const svc = await import('@/services/businessBotService')
  svc.handleBusinessConnection(connection() as any)
  return svc
}

const ownerDms = (bot: ReturnType<typeof fakeBot>) =>
  bot.telegram.sendMessage.mock.calls.filter(
    (c: any[]) => !(c[2] && c[2].business_connection_id)
  )
const customerSends = (bot: ReturnType<typeof fakeBot>) =>
  bot.telegram.sendMessage.mock.calls.filter(
    (c: any[]) => c[2] && c[2].business_connection_id === CONN
  )

beforeEach(() => {
  chatWithAI.mockClear()
  wasAgentSent.mockClear()
  wasAgentSent.mockResolvedValue(false)
})
afterEach(() => {
  vi.useRealTimers()
})

describe('owner lead notification', () => {
  it('goes once per chat per day to user_chat_id, without business_connection_id, HTML-escaped', async () => {
    const svc = await fresh()
    const bot = fakeBot()
    await svc.handleBusinessMessage(
      dm({
        from: { id: 555, first_name: '<b>Eve</b> & co', username: 'e<v' },
      }) as any,
      bot as any,
      BOT
    )
    await svc.handleBusinessMessage(
      dm({ text: 'ещё вопрос' }) as any,
      bot as any,
      BOT
    )
    const dms = ownerDms(bot)
    expect(dms).toHaveLength(1)
    expect(dms[0][0]).toBe(OWNER_CHAT)
    expect(dms[0][2]).toMatchObject({ parse_mode: 'HTML' })
    expect(dms[0][1]).toContain('&lt;b&gt;Eve&lt;/b&gt; &amp; co')
    expect(dms[0][1]).toContain('@e&lt;v')
    expect(dms[0][1]).not.toContain('<b>Eve')
    expect(dms[0][1]).toContain(`tg://user?id=555`)
    expect(customerSends(bot)).toHaveLength(2)
    expect(svc.getBusinessStats().todayLeads).toBe(1)

    await svc.handleBusinessMessage(dm({}, 556) as any, bot as any, BOT)
    expect(ownerDms(bot)).toHaveLength(2)
  })

  it('a failed notification never blocks the reply and is retried on the next message', async () => {
    const svc = await fresh()
    const bot = fakeBot()
    bot.telegram.sendMessage.mockImplementationOnce(async () => {
      throw new Error('Forbidden: bot was blocked by the user')
    })
    await svc.handleBusinessMessage(dm() as any, bot as any, BOT)
    expect(customerSends(bot)).toHaveLength(1)
    await svc.handleBusinessMessage(dm() as any, bot as any, BOT)
    expect(ownerDms(bot)).toHaveLength(2)
  })
})

describe('reply button', () => {
  it('deep-links to the service the customer asked about, or to the bot itself', async () => {
    const svc = await fresh()
    const bot = fakeBot()
    await svc.handleBusinessMessage(dm() as any, bot as any, BOT)
    const [, , extra] = customerSends(bot)[0]
    expect(extra.reply_markup.inline_keyboard[0][0].url).toBe(
      `https://t.me/${BOT}?start=svc_text2video`
    )
    await svc.handleBusinessMessage(
      dm({ text: 'Привет, вы кто?' }, 556) as any,
      bot as any,
      BOT
    )
    const [, , extra2] = customerSends(bot)[1]
    expect(extra2.reply_markup.inline_keyboard[0][0].url).toBe(
      `https://t.me/${BOT}?start=dm`
    )
    expect(bot.telegram.sendChatAction).toHaveBeenCalledWith(555, 'typing', {
      business_connection_id: CONN,
    })
  })
})

describe('messages that must never be answered', () => {
  it('is_from_offline and sender_business_bot: no reply, no LLM, no lead', async () => {
    for (const extra of [
      { is_from_offline: true },
      { sender_business_bot: { id: 1 } },
    ]) {
      const svc = await fresh()
      const bot = fakeBot()
      await svc.handleBusinessMessage(dm(extra) as any, bot as any, BOT)
      expect(bot.telegram.sendMessage).not.toHaveBeenCalled()
      expect(chatWithAI).not.toHaveBeenCalled()
    }
  })

  it('the owner typing in the chat silences the AI there for OWNER_TAKEOVER_MS, then it resumes', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-08T12:00:00Z'))
    const svc = await fresh()
    const bot = fakeBot()
    await svc.handleBusinessMessage(
      dm({
        from: { id: OWNER_ID, first_name: 'Owner' },
        text: 'Здравствуйте, это я',
      }) as any,
      bot as any,
      BOT
    )
    // Nothing goes to the customer; the owner is told once that the AI is
    // paused there (before 2026-09-13 the pause was silent).
    expect(customerSends(bot)).toHaveLength(0)
    expect(ownerDms(bot)).toHaveLength(1)
    expect(String(ownerDms(bot)[0][1])).toContain('молчит')
    await svc.handleBusinessMessage(
      dm({
        from: { id: OWNER_ID, first_name: 'Owner' },
        text: 'и ещё',
      }) as any,
      bot as any,
      BOT
    )
    expect(ownerDms(bot)).toHaveLength(1)
    await svc.handleBusinessMessage(
      dm({ text: 'ок, жду' }) as any,
      bot as any,
      BOT
    )
    expect(chatWithAI).not.toHaveBeenCalled()
    expect(svc.getBusinessStats().todayTakeoverSkipped).toBe(1)
    // Another chat is unaffected.
    await svc.handleBusinessMessage(dm({}, 556) as any, bot as any, BOT)
    expect(chatWithAI).toHaveBeenCalledTimes(1)

    vi.setSystemTime(new Date(Date.now() + svc.OWNER_TAKEOVER_MS + 1000))
    await svc.handleBusinessMessage(
      dm({ text: 'вы тут?' }) as any,
      bot as any,
      BOT
    )
    expect(chatWithAI).toHaveBeenCalledTimes(2)
  })

  it('a photo is relayed to the owner and answered with a service offer; a sticker gets nothing; neither reaches the LLM', async () => {
    const svc = await fresh()
    const bot = fakeBot()
    await svc.handleBusinessMessage(
      dm({
        text: undefined,
        photo: [{ file_id: 'small' }, { file_id: 'big' }],
      }) as any,
      bot as any,
      BOT
    )
    expect(bot.telegram.sendPhoto).toHaveBeenCalledTimes(1)
    const [to, fileId, extra] = bot.telegram.sendPhoto.mock.calls[0] as any[]
    expect(to).toBe(OWNER_CHAT)
    expect(fileId).toBe('big')
    expect(extra.caption).toContain('Customer')
    expect(extra.caption).toContain('tg://user?id=555')
    expect(customerSends(bot)).toHaveLength(1)
    expect(customerSends(bot)[0][1]).toContain('передал')
    expect(
      customerSends(bot)[0][2].reply_markup.inline_keyboard[0][0].url
    ).toBe(`https://t.me/${BOT}?start=svc_image2video`)
    await svc.handleBusinessMessage(
      dm({ text: undefined, sticker: { file_id: 's' } }, 556) as any,
      bot as any,
      BOT
    )
    expect(customerSends(bot)).toHaveLength(1)
    expect(chatWithAI).not.toHaveBeenCalled()
    expect(svc.getBusinessStats().todayNonText).toBe(2)
    expect(svc.getBusinessStats().todayMediaRelayed).toBe(1)
  })
  it('a message the agent sent as the owner (confirmed proposal) does NOT pause the AI', async () => {
    const svc = await fresh()
    const bot = fakeBot()
    wasAgentSent.mockResolvedValueOnce(true)
    await svc.handleBusinessMessage(
      dm({
        message_id: 4242,
        from: { id: OWNER_ID, first_name: 'Owner' },
        text: 'Ответ агента, отправленный с аккаунта владельца',
      }) as any,
      bot as any,
      BOT
    )
    expect(wasAgentSent).toHaveBeenCalledWith(OWNER_ID, 555, 4242)
    expect(bot.telegram.sendMessage).not.toHaveBeenCalled()
    await svc.handleBusinessMessage(
      dm({ text: 'а можно подробнее?' }) as any,
      bot as any,
      BOT
    )
    expect(chatWithAI).toHaveBeenCalledTimes(1)
    expect(svc.getBusinessStats().todayTakeoverSkipped).toBe(0)
  })

  it('resumeAiFor gives the chat back to the AI before the pause runs out', async () => {
    const svc = await fresh()
    const bot = fakeBot()
    await svc.handleBusinessMessage(
      dm({ from: { id: OWNER_ID, first_name: 'Owner' }, text: 'я сам' }) as any,
      bot as any,
      BOT
    )
    await svc.handleBusinessMessage(dm({ text: 'ок' }) as any, bot as any, BOT)
    expect(chatWithAI).not.toHaveBeenCalled()
    // A stranger cannot resume it; the owner can.
    expect(svc.resumeAiFor(555, OWNER_ID + 1)).toBe(0)
    expect(svc.resumeAiFor(555, OWNER_ID)).toBe(1)
    expect(svc.resumeAiFor(555, OWNER_ID)).toBe(0)
    await svc.handleBusinessMessage(
      dm({ text: 'вы тут?' }) as any,
      bot as any,
      BOT
    )
    expect(chatWithAI).toHaveBeenCalledTimes(1)
  })
})
