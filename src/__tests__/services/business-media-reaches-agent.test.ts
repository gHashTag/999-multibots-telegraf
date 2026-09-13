/**
 * THE AGENT KEEPS, SEES AND HEARS WHAT A CLIENT SENDS INTO THE BUSINESS DM.
 *
 * Measured 2026-09-13 (code read of businessBotService.ts): a client's voice
 * note was re-sent to the owner, answered with a canned sentence, and the
 * bytes were dropped -- the model saw "[the client sent a voice note]", a
 * description of a file, never the file. Pinned here:
 *
 *   1. a voice note reaches the agent as a marker line with OUR shelf URL,
 *      and the Telegram file link (which carries the bot token) appears in
 *      neither the agent text nor the library call;
 *   2. the file is indexed per client (owner, lead, surface 'business');
 *   3. a file over the Bot API ceiling is refused in ONE message together
 *      with the service offer, and nothing is fetched or stored.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const askAgent = vi.fn(async () => ({ текст: 'слышу вас, отвечаю' })) // cyrillic-ok: pre-existing field
const recordTurns = vi.fn(async () => 'recorded')
vi.mock('@/services/trinityAgent', () => ({
  спроситьАгента: (...a: unknown[]) => askAgent(...(a as [])), // cyrillic-ok: pre-existing identifier
  recordTurns: (...a: unknown[]) => recordTurns(...(a as [])),
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
  url: 'https://shelf.example/s3/voice.ogg',
  path: '/tmp/voice.ogg',
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

// The link `getFileLink` answers: it holds the token and must never be stored.
const TOKEN_LINK =
  'https://api.telegram.org/file/bot123456:TEST-NOT-A-SECRET/voice/file_1.oga'

const CONN = 'conn-media-agent-1'
const OWNER_CHAT = 999000111
const OWNER_ID = 144022504
const CLIENT = 555
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
  message_id: 41,
  date: 1757750000,
  chat: { id: CLIENT, first_name: 'Ann', type: 'private' },
  from: { id: CLIENT, first_name: 'Ann', username: 'ann' },
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
      getFileLink: vi.fn(async () => new URL(TOKEN_LINK)),
      callApi: vi.fn(async () => connection()),
    },
  }
}
const viaConn = (bot: any) =>
  bot.telegram.sendMessage.mock.calls.filter(
    (c: any[]) => c[2]?.business_connection_id === CONN
  )

async function fresh() {
  vi.resetModules()
  const svc = await import('@/services/businessBotService')
  svc.handleBusinessConnection(connection() as any)
  return svc
}

const fetchSpy = vi.fn(async (url: string) => {
  if (String(url) === TOKEN_LINK) {
    return new Response(Buffer.from('OggS voice bytes'), { status: 200 })
  }
  return new Response('{}', { status: 200 })
})

beforeEach(() => {
  askAgent.mockClear()
  recordTurns.mockClear()
  chatWithAI.mockClear()
  putBytes.mockClear()
  rememberClientMedia.mockClear()
  fetchSpy.mockClear()
  vi.stubGlobal('fetch', fetchSpy)
})

describe('a voice note in the business DM', () => {
  it('reaches the agent as an audio marker on OUR shelf, never as the Telegram link', async () => {
    const svc = await fresh()
    const bot = fakeBot()
    await svc.handleBusinessMessage(
      dm({
        voice: {
          file_id: 'v1',
          file_unique_id: 'AQADv1',
          mime_type: 'audio/ogg',
          file_size: 16,
          duration: 3,
        },
      }) as any,
      bot as any,
      BOT
    )

    // Relayed to the owner as before.
    expect(bot.telegram.sendVoice).toHaveBeenCalledTimes(1)
    // Fetched once through the token link, then put on the shelf.
    expect(fetchSpy).toHaveBeenCalledWith(TOKEN_LINK)
    expect(putBytes).toHaveBeenCalledTimes(1)

    // The agent got the file, not a sentence about it.
    expect(askAgent).toHaveBeenCalledTimes(1)
    const [lead, text, opts] = askAgent.mock.calls[0] as unknown as [
      string,
      string,
      { surface: string },
    ]
    expect(lead).toBe(String(CLIENT))
    expect(opts.surface).toBe('business')
    expect(text).toContain('[attached audio:')
    expect(text).toContain('https://shelf.example/s3/voice.ogg')
    expect(text).toContain('Клиент прислал голосовое')
    expect(text).not.toContain('api.telegram.org')

    // Its answer went to the client; the canned sentence did not.
    expect(viaConn(bot)).toHaveLength(1)
    expect(viaConn(bot)[0][1]).toBe('слышу вас, отвечаю')
    expect(chatWithAI).not.toHaveBeenCalled()

    // Indexed per client with the shelf URL and the message id.
    expect(rememberClientMedia).toHaveBeenCalledTimes(1)
    const [owner, who, surface, items] = rememberClientMedia.mock
      .calls[0] as unknown as [string, string, string, any[]]
    expect(owner).toBe(String(OWNER_ID))
    expect(who).toBe(String(CLIENT))
    expect(surface).toBe('business')
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      msg_id: 41,
      kind: 'audio',
      mime: 'audio/ogg',
      url: 'https://shelf.example/s3/voice.ogg',
      tg_file_unique_id: 'AQADv1',
      out: false,
    })
    expect(JSON.stringify(items)).not.toContain('api.telegram.org')
    // The turn on record carries the marker too, so memory can open it.
    const recorded = JSON.stringify(recordTurns.mock.calls)
    expect(recorded).toContain('[attached audio:')
    expect(recorded).not.toContain('api.telegram.org')
  })

  it('a file over 20 MB is refused with the service offer in ONE message; nothing fetched or stored', async () => {
    const svc = await fresh()
    const bot = fakeBot()
    await svc.handleBusinessMessage(
      dm({
        document: {
          file_id: 'd1',
          file_unique_id: 'AQADd1',
          file_name: 'huge.zip',
          mime_type: 'application/zip',
          file_size: 21 * 1024 * 1024,
        },
      }) as any,
      bot as any,
      BOT
    )
    expect(bot.telegram.sendDocument).toHaveBeenCalledTimes(1)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(putBytes).not.toHaveBeenCalled()
    expect(rememberClientMedia).not.toHaveBeenCalled()
    expect(askAgent).not.toHaveBeenCalled()
    const sent = viaConn(bot)
    expect(sent).toHaveLength(1)
    const said = String(sent[0][1])
    expect(said).toContain('huge.zip')
    expect(said).toContain('не больше 20 МБ')
    expect(said).toContain('Файл получил')
    expect(sent[0][2].reply_markup.inline_keyboard[0][0].url).toContain(
      `https://t.me/${BOT}?start=`
    )
  })
})
