/**
 * A STICKER IN THE BUSINESS DM IS NEVER DROPPED IN SILENCE.
 *
 * Salvage study 2026-09-22, matrix row "Stickers / Business DM": there was no
 * sticker entry in MEDIA_KINDS, so a client who answered with a sticker got
 * no reply at all, the agent never heard of it and the owner never saw it --
 * the one message type lost completely. Pinned here:
 *
 *   1. a static sticker is a WebP picture: fetched once, put on OUR shelf and
 *      handed to the agent as an image marker, so it is looked at;
 *   2. an animated or video sticker is not a picture: it is NAMED by its
 *      emoji, and nothing is downloaded;
 *   3. either way the owner gets it (a sticker cannot carry a caption, so the
 *      pointer follows as its own message) and the client gets an answer.
 *
 * The Telegram double refuses every method it was not taught: a relay through
 * a method that does not exist must fail here, not be swallowed as success.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const askAgent = vi.fn(async () => ({ текст: 'ха, отлично!' })) // cyrillic-ok: pre-existing field
vi.mock('@/services/trinityAgent', () => ({
  спроситьАгента: (...a: unknown[]) => askAgent(...(a as [])), // cyrillic-ok: pre-existing identifier
  recordTurns: vi.fn(async () => 'recorded'),
}))
const chatWithAI = vi.fn(async () => 'fallback reply')
vi.mock('@/services/aiChatService', () => ({
  chatWithAI: (...a: unknown[]) => chatWithAI(...(a as [])),
  AI_CHAT_MODELS: {},
}))
vi.mock('@/core/supabase', () => ({
  getUserLanguageFromDB: vi.fn(async () => null),
}))
const putBytes = vi.fn(async (_bytes: Buffer, _name: string) => ({
  url: 'https://shelf.example/s3/sticker.webp',
  path: '/tmp/sticker.webp',
  size: 16,
}))
vi.mock('@/services/contentFactory/storage', () => ({
  putBytes: (...a: unknown[]) => putBytes(...(a as [Buffer, string])),
}))
const rememberClientMedia = vi.fn(async () => ({ ok: true, fresh: 1 }))
vi.mock('@/services/mediaLibrary', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/services/mediaLibrary')>()
  return {
    ...actual,
    rememberClientMedia: (...a: unknown[]) => rememberClientMedia(...(a as [])),
    rememberClientMediaQuietly: (...a: unknown[]) => {
      void rememberClientMedia(...(a as []))
    },
  }
})

const TOKEN_LINK =
  'https://api.telegram.org/file/bot123456:TEST-NOT-A-SECRET/stickers/file_9.webp'
const CONN = 'conn-sticker-1'
const OWNER_CHAT = 900000041
const OWNER_ID = 900000042
const CLIENT = 900000043
const BOT = 'neuro_blogger_bot'

const connection = () => ({
  id: CONN,
  user: { id: OWNER_ID, first_name: 'Owner' },
  user_chat_id: OWNER_CHAT,
  date: 1,
  is_enabled: true,
  rights: { can_reply: true },
})
const dm = (extra: Record<string, unknown>) => ({
  message_id: 77,
  date: 1757750000,
  chat: { id: CLIENT, first_name: 'Client', type: 'private' },
  from: { id: CLIENT, first_name: 'Client' },
  business_connection_id: CONN,
  ...extra,
})

/** Telegram, taught exactly what this path needs; anything else throws. */
function strictBot() {
  const taught: Record<string, ReturnType<typeof vi.fn>> = {
    sendMessage: vi.fn(async () => ({ message_id: 1 })),
    sendChatAction: vi.fn(async () => true),
    sendSticker: vi.fn(async () => ({ message_id: 2 })),
    getFileLink: vi.fn(async () => new URL(TOKEN_LINK)),
    callApi: vi.fn(async () => connection()),
  }
  const telegram = new Proxy(taught, {
    get(target, prop: string) {
      if (prop in target) return target[prop]
      if (prop === 'then') return undefined
      throw new Error(`strict telegram double: ${prop} was not taught`)
    },
  })
  return { botInfo: { username: BOT }, telegram, taught }
}
const toClient = (bot: ReturnType<typeof strictBot>) =>
  bot.taught.sendMessage.mock.calls.filter(
    (c: any[]) => c[2]?.business_connection_id === CONN
  )
const toOwner = (bot: ReturnType<typeof strictBot>) =>
  bot.taught.sendMessage.mock.calls.filter((c: any[]) => c[0] === OWNER_CHAT)

async function fresh() {
  vi.resetModules()
  const svc = await import('@/services/businessBotService')
  svc.handleBusinessConnection(connection() as any)
  return svc
}

const fetchSpy = vi.fn(async (url: string) => {
  if (String(url) === TOKEN_LINK) {
    return new Response(Buffer.from('RIFF....WEBPVP8 '), { status: 200 })
  }
  return new Response('{}', { status: 200 })
})

beforeEach(() => {
  askAgent.mockClear()
  chatWithAI.mockClear()
  putBytes.mockClear()
  rememberClientMedia.mockClear()
  fetchSpy.mockClear()
  vi.stubGlobal('fetch', fetchSpy)
})

describe('a sticker in the business DM', () => {
  it('a static sticker is looked at like a photo, and answered', async () => {
    const svc = await fresh()
    const bot = strictBot()
    await svc.handleBusinessMessage(
      dm({
        sticker: {
          file_id: 's1',
          file_unique_id: 'AQADs1',
          emoji: '😂',
          is_animated: false,
          is_video: false,
          file_size: 16,
        },
      }) as any,
      bot as any,
      BOT
    )

    // The owner saw it: the sticker itself, then who sent it.
    await vi.waitFor(() =>
      expect(bot.taught.sendSticker).toHaveBeenCalledWith(OWNER_CHAT, 's1')
    )
    await vi.waitFor(() => expect(toOwner(bot).length).toBeGreaterThan(0))
    expect(String(toOwner(bot).at(-1)?.[1])).toContain('Стикер')

    // The agent got the picture, not a sentence about it.
    expect(askAgent).toHaveBeenCalledTimes(1)
    const text = String((askAgent.mock.calls[0] as unknown[])[1])
    expect(text).toContain('Клиент прислал стикер 😂')
    expect(text).toContain('[attached image:')
    expect(text).toContain('https://shelf.example/s3/sticker.webp')
    expect(text).not.toContain('api.telegram.org')
    expect(putBytes).toHaveBeenCalledTimes(1)
    expect(rememberClientMedia).toHaveBeenCalledTimes(1)

    // And the client got an answer.
    expect(toClient(bot)).toHaveLength(1)
    expect(toClient(bot)[0][1]).toBe('ха, отлично!')
  })

  it('an animated sticker is named by its emoji, and nothing is downloaded', async () => {
    const svc = await fresh()
    const bot = strictBot()
    await svc.handleBusinessMessage(
      dm({
        sticker: {
          file_id: 's2',
          file_unique_id: 'AQADs2',
          emoji: '🔥',
          is_animated: true,
          is_video: false,
        },
      }) as any,
      bot as any,
      BOT
    )

    await vi.waitFor(() =>
      expect(bot.taught.sendSticker).toHaveBeenCalledWith(OWNER_CHAT, 's2')
    )
    expect(askAgent).toHaveBeenCalledTimes(1)
    const text = String((askAgent.mock.calls[0] as unknown[])[1])
    expect(text).toBe('[Клиент прислал анимированный стикер 🔥]')
    // Lottie is not a picture: nothing fetched, nothing stored.
    expect(bot.taught.getFileLink).not.toHaveBeenCalled()
    expect(putBytes).not.toHaveBeenCalled()
    expect(toClient(bot)).toHaveLength(1)
  })

  it('a video sticker is named as one', async () => {
    const svc = await fresh()
    expect(svc.stickerNote({ file_id: 'x', emoji: '👍', is_video: true })).toBe(
      'Клиент прислал видеостикер 👍'
    )
    expect(svc.stickerNote({ file_id: 'x' })).toBe('Клиент прислал стикер')
  })
})
