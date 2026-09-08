/**
 * Media in the owner's business DM is never a dead end.
 *
 * Live 2026-09-08 14:18:57 UTC: a customer sent a photo into the owner's DM and
 * the bot answered "I only read text". The owner's words: photos, videos and
 * files "do not load". Now every customer media message is (1) re-sent into
 * the owner's own chat with the bot, captioned with the sender and a link to
 * the chat (file_ids are bot-scoped, so the id from the business update works
 * there), and (2) answered: a caption goes to the LLM as text with a note about
 * the media; bare media gets a service offer with a deep-link button. A failed
 * relay degrades to a text pointer, never to silence.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const chatWithAI = vi.fn(async () => 'ok reply')
vi.mock('@/services/aiChatService', () => ({
  chatWithAI: (...a: unknown[]) => chatWithAI(...(a as [])),
  AI_CHAT_MODELS: {},
}))
vi.mock('@/core/supabase', () => ({
  getUserLanguageFromDB: vi.fn(async () => null),
}))

const CONN = 'conn-media-1'
const OWNER_CHAT = 999000111
const BOT = 'neuro_blogger_bot'
const connection = () => ({
  id: CONN,
  user: { id: 144022504, first_name: 'Owner' },
  user_chat_id: OWNER_CHAT,
  date: 1,
  is_enabled: true,
  rights: { can_reply: true },
})
const dm = (extra: Record<string, unknown>, chatId = 555) => ({
  message_id: 7,
  date: 1,
  chat: { id: chatId, first_name: 'Ann <i>', type: 'private' },
  from: { id: chatId, first_name: 'Ann <i>', username: 'ann' },
  business_connection_id: CONN,
  ...extra,
})
function fakeBot() {
  const m = () => vi.fn(async () => ({ message_id: 3 }))
  return {
    botInfo: { username: BOT },
    telegram: {
      sendMessage: vi.fn(async () => ({ message_id: 1 })),
      sendChatAction: vi.fn(async () => true),
      sendPhoto: m(),
      sendVideo: m(),
      sendDocument: m(),
      sendVoice: m(),
      sendAudio: m(),
      sendVideoNote: m(),
      sendAnimation: m(),
      callApi: vi.fn(async () => connection()),
    },
  }
}
const viaConn = (bot: any) =>
  bot.telegram.sendMessage.mock.calls.filter(
    (c: any[]) => c[2]?.business_connection_id === CONN
  )
const ownerTexts = (bot: any) =>
  bot.telegram.sendMessage.mock.calls.filter((c: any[]) => c[0] === OWNER_CHAT)

async function fresh() {
  vi.resetModules()
  const svc = await import('@/services/businessBotService')
  svc.handleBusinessConnection(connection() as any)
  return svc
}
beforeEach(() => chatWithAI.mockClear())

describe('customer media in the owner DM', () => {
  it.each([
    ['video', { video: { file_id: 'v1' } }, 'sendVideo', 'svc_avatar'],
    [
      'document',
      { document: { file_id: 'd1', file_name: 'brief.pdf' } },
      'sendDocument',
      'svc_chat',
    ],
    ['voice', { voice: { file_id: 'a1' } }, 'sendVoice', 'svc_voice'],
    [
      'animation',
      { animation: { file_id: 'g1' } },
      'sendAnimation',
      'svc_image2video',
    ],
  ])(
    '%s is relayed to the owner and answered with an offer',
    async (_k, media, method, card) => {
      const svc = await fresh()
      const bot = fakeBot()
      await svc.handleBusinessMessage(dm(media) as any, bot as any, BOT)
      const relay = (bot.telegram as any)[method]
      expect(relay).toHaveBeenCalledTimes(1)
      const [to, fileId, extra] = relay.mock.calls[0]
      expect(to).toBe(OWNER_CHAT)
      expect(fileId).toBe(Object.values(media as any)[0].file_id)
      expect(extra.parse_mode).toBe('HTML')
      expect(extra.caption).toContain('Ann &lt;i&gt;')
      expect(extra.caption).not.toContain('<i>')
      expect(extra.caption).toContain('tg://user?id=555')
      expect(viaConn(bot)).toHaveLength(1)
      expect(viaConn(bot)[0][2].reply_markup.inline_keyboard[0][0].url).toBe(
        `https://t.me/${BOT}?start=${card}`
      )
      expect(chatWithAI).not.toHaveBeenCalled()
    }
  )

  it('a video note has no caption: the file goes first, the text pointer second', async () => {
    const svc = await fresh()
    const bot = fakeBot()
    await svc.handleBusinessMessage(
      dm({ video_note: { file_id: 'n1' } }) as any,
      bot as any,
      BOT
    )
    expect(bot.telegram.sendVideoNote).toHaveBeenCalledWith(OWNER_CHAT, 'n1')
    expect(
      ownerTexts(bot).some((c: any[]) =>
        String(c[1]).includes('Видеосообщение')
      )
    ).toBe(true)
  })

  it('a photo WITH a caption is relayed and the caption is answered by the LLM with a media note', async () => {
    const svc = await fresh()
    const bot = fakeBot()
    await svc.handleBusinessMessage(
      dm({
        photo: [{ file_id: 'p1' }],
        caption: 'сделайте из этого аватар',
      }) as any,
      bot as any,
      BOT
    )
    expect(bot.telegram.sendPhoto).toHaveBeenCalledTimes(1)
    expect((bot.telegram.sendPhoto.mock.calls[0] as any)[2].caption).toContain(
      'сделайте из этого аватар'
    )
    expect(chatWithAI).toHaveBeenCalledTimes(1)
    const userTurn = (chatWithAI.mock.calls[0] as any)[0][1].content as string
    expect(userTurn).toContain('Клиент прислал фото')
    expect(userTurn).toContain('сделайте из этого аватар')
    expect(viaConn(bot)).toHaveLength(1)
    expect(viaConn(bot)[0][1]).toBe('ok reply')
  })

  it('a failed relay degrades to a text pointer for the owner; the customer is still answered', async () => {
    const svc = await fresh()
    const bot = fakeBot()
    bot.telegram.sendPhoto.mockImplementationOnce(async () => {
      throw new Error('Bad Request: wrong file identifier')
    })
    await svc.handleBusinessMessage(
      dm({ photo: [{ file_id: 'p1' }] }) as any,
      bot as any,
      BOT
    )
    const pointer = ownerTexts(bot).find((c: any[]) =>
      String(c[1]).includes('переслать сам файл не удалось')
    )
    expect(pointer).toBeDefined()
    expect(pointer![1]).toContain('tg://user?id=555')
    expect(viaConn(bot)).toHaveLength(1)
  })

  it("the owner's own media inside a customer chat only pauses the AI, nothing is relayed", async () => {
    const svc = await fresh()
    const bot = fakeBot()
    await svc.handleBusinessMessage(
      dm({
        photo: [{ file_id: 'p1' }],
        from: { id: 144022504, first_name: 'Owner' },
      }) as any,
      bot as any,
      BOT
    )
    expect(bot.telegram.sendPhoto).not.toHaveBeenCalled()
    expect(viaConn(bot)).toHaveLength(0)
  })
})
