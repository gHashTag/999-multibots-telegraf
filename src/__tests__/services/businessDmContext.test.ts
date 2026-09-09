/**
 * The business DM, context-first: the memory fills the moment the account is
 * connected and the moment an exchange happens; the pay button appears only
 * when the client themselves asked to pay.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const chatWithAI = vi.fn(async () => 'fallback reply')
vi.mock('@/services/aiChatService', () => ({
  chatWithAI: (...a: unknown[]) => chatWithAI(...(a as [])),
  AI_CHAT_MODELS: {},
}))
vi.mock('@/core/supabase', () => ({
  getUserLanguageFromDB: vi.fn(async () => null),
}))
let agentSays = 'Рада помочь. Расскажи, какой рилс нужен?'
vi.mock('@/services/trinityAgent', () => ({
  /* cyrillic-ok */ спроситьАгента: async () => ({ текст: agentSays }), // cyrillic-ok: pre-existing identifiers
  recordTurns: async () => 'recorded',
}))
const ingestChats = vi.fn(async () => ({
  people: 3,
  messages_new: 12,
  zep_mirrored: 12,
}))
const mirrorDm = vi.fn(async () => ({ ok: true, fresh: 2, zep: 2 }))
vi.mock('@/services/modelSwitch', () => ({
  ingestChats: (...a: unknown[]) => ingestChats(...(a as [])),
  mirrorDm: (...a: unknown[]) => mirrorDm(...(a as [])),
}))

process.env.ADMIN_IDS = '144022504'
const CONN = 'conn-ctx-1'
const OWNER = 144022504
const BOT = 'neuro_blogger_bot'
const connection = (id = CONN) => ({
  id,
  user: { id: OWNER, first_name: 'Owner' },
  user_chat_id: 999000111,
  date: 1,
  is_enabled: true,
  rights: { can_reply: true },
})
const dm = (text: string, chatId = 900000001) => ({
  message_id: 41,
  date: 1757348157,
  chat: { id: chatId, first_name: 'Pilot', type: 'private' },
  from: { id: chatId, first_name: 'Pilot', username: 'pilot_client' },
  business_connection_id: CONN,
  text,
})
function fakeBot() {
  return {
    botInfo: { username: BOT },
    telegram: {
      sendMessage: vi.fn(async () => ({ message_id: 42 })),
      sendChatAction: vi.fn(async () => true),
      callApi: vi.fn(async () => connection()),
    },
  }
}
const flush = () => new Promise(r => setTimeout(r, 5))
/** The reply sent as the owner into the client's chat, not the owner's notification. */
const asOwner = (bot: ReturnType<typeof fakeBot>) =>
  bot.telegram.sendMessage.mock.calls.find(
    (c: any[]) => c[2]?.business_connection_id === CONN
  ) as any[]

beforeEach(() => {
  vi.resetModules()
  ingestChats.mockClear()
  mirrorDm.mockClear()
  chatWithAI.mockClear()
  agentSays = 'Рада помочь. Расскажи, какой рилс нужен?'
})

describe('the memory starts when the account is connected', () => {
  it('a new business connection ingests the correspondence as the owner, once', async () => {
    const svc = await import('@/services/businessBotService')
    svc.handleBusinessConnection(connection() as any)
    svc.handleBusinessConnection(connection() as any)
    await flush()
    expect(ingestChats).toHaveBeenCalledTimes(1)
    expect(ingestChats).toHaveBeenCalledWith(String(OWNER))
    svc.handleBusinessConnection(connection('conn-ctx-2') as any)
    await flush()
    expect(ingestChats).toHaveBeenCalledTimes(2)
  })

  it('a disabled connection ingests nothing', async () => {
    const svc = await import('@/services/businessBotService')
    svc.handleBusinessConnection({ ...connection(), is_enabled: false } as any)
    await flush()
    expect(ingestChats).not.toHaveBeenCalled()
  })
})

describe('the exchange goes into the memory at once', () => {
  it("the client's message and the answer, with Telegram's own ids, as the owner", async () => {
    const svc = await import('@/services/businessBotService')
    svc.handleBusinessConnection(connection() as any)
    const bot = fakeBot()
    await svc.handleBusinessMessage(
      dm('привет, а рилсы делаешь?') as any,
      bot as any,
      BOT
    )
    await flush()
    expect(mirrorDm).toHaveBeenCalledTimes(1)
    const [owner, lead, name, messages] = mirrorDm.mock.calls[0] as unknown as [
      string,
      string,
      string,
      any[],
    ]
    expect(owner).toBe(String(OWNER))
    expect(lead).toBe('900000001')
    expect(name).toBe('Pilot')
    expect(messages).toEqual([
      {
        msg_id: 41,
        at: 1757348157,
        out: false,
        text: 'привет, а рилсы делаешь?',
      },
      { msg_id: 42, at: expect.any(Number), out: true, text: agentSays },
    ])
  })
})

describe('the link and the button at once -- only when they asked to pay', () => {
  it('an ordinary answer carries no pay button', async () => {
    const svc = await import('@/services/businessBotService')
    svc.handleBusinessConnection(connection() as any)
    const bot = fakeBot()
    await svc.handleBusinessMessage(dm('привет') as any, bot as any, BOT)
    const extra = asOwner(bot)[2] as any
    const rows = extra.reply_markup.inline_keyboard
    expect(rows).toHaveLength(1)
    expect(rows[0][0].text).toContain('Открыть в боте')
  })

  it('an answer with the invoice link gets a pay button above the bot button', async () => {
    agentSays =
      'Счёт на 50 токенов — 65 ⭐, оплата в один тап: https://t.me/$abc_DEF-123'
    const svc = await import('@/services/businessBotService')
    svc.handleBusinessConnection(connection() as any)
    const bot = fakeBot()
    await svc.handleBusinessMessage(dm('хочу оплатить') as any, bot as any, BOT)
    const extra = asOwner(bot)[2] as any
    const rows = extra.reply_markup.inline_keyboard
    expect(rows).toHaveLength(2)
    expect(rows[0][0]).toEqual({
      text: 'Оплатить 65 ⭐',
      url: 'https://t.me/$abc_DEF-123',
    })
    expect(rows[1][0].text).toContain('Открыть в боте')
  })

  it('payButton: link required, stars optional, nothing else counts', async () => {
    const { payButton } = await import('@/services/businessBotService')
    expect(payButton('открой https://t.me/$inv_1 и оплати')).toEqual({
      text: 'Оплатить ⭐',
      url: 'https://t.me/$inv_1',
    })
    expect(payButton('45 ⭐ здесь https://t.me/$x9')?.text).toBe(
      'Оплатить 45 ⭐'
    )
    expect(payButton('зайди на https://t.me/neuro_blogger_bot')).toBeNull()
    expect(payButton('без ссылок')).toBeNull()
  })
})

describe('the fallback prompt does not push payment either', () => {
  it('says: do not offer payment first', async () => {
    const { buildBusinessMessages } = await import(
      '@/services/businessBotService'
    )
    const sys = String(buildBusinessMessages('привет', 'Гость', BOT)[0].content)
    expect(sys).toContain('НЕ ПРЕДЛАГАЙ ОПЛАТУ ПЕРВЫМ')
    expect(sys).toContain('Тарифов и подписок НЕТ')
  })
})

describe("the owner's notification carries the DM menu", () => {
  it('an admin owner gets who / mute / prepare / later / refuse under the lead notification', async () => {
    const svc = await import('@/services/businessBotService')
    svc.handleBusinessConnection(connection() as any)
    const bot = fakeBot()
    await svc.handleBusinessMessage(
      dm('привет, а рилсы делаешь?') as any,
      bot as any,
      BOT
    )
    const toOwner = bot.telegram.sendMessage.mock.calls.find(
      (c: any[]) => c[0] === 999000111
    ) as any[]
    expect(toOwner, 'no notification reached the owner').toBeTruthy()
    expect(toOwner[2].parse_mode).toBe('HTML')
    const data = toOwner[2].reply_markup.inline_keyboard
      .flat()
      .map((b: any) => b.callback_data)
    expect(data).toEqual([
      'crm:lead:900000001',
      'crm:mute:900000001',
      'crm:prep:900000001',
      'crm:later:900000001',
      'crm:refuse:900000001',
    ])
  })

  it('pauseAiFor silences the AI in that chat for the connections of that owner only', async () => {
    const svc = await import('@/services/businessBotService')
    svc.handleBusinessConnection(connection() as any)
    expect(svc.pauseAiFor(900000001, undefined, 999)).toBe(0)
    expect(svc.pauseAiFor(900000001, undefined, OWNER)).toBe(1)
    const bot = fakeBot()
    await svc.handleBusinessMessage(dm('ещё вопрос') as any, bot as any, BOT)
    // Paused: nothing is sent into the client chat as the owner.
    expect(asOwner(bot)).toBeUndefined()
  })
})

describe('a farm owner who is not an admin of this bot', () => {
  it('gets the notification exactly as before: HTML, no buttons nobody would answer', async () => {
    const was = process.env.ADMIN_IDS
    process.env.ADMIN_IDS = '1'
    try {
      vi.resetModules()
      const svc = await import('@/services/businessBotService')
      svc.handleBusinessConnection(connection() as any)
      const bot = fakeBot()
      await svc.handleBusinessMessage(dm('привет') as any, bot as any, BOT)
      const toOwner = bot.telegram.sendMessage.mock.calls.find(
        (c: any[]) => c[0] === 999000111
      ) as any[]
      expect(toOwner).toBeTruthy()
      expect(toOwner[2]).toEqual({ parse_mode: 'HTML' })
    } finally {
      process.env.ADMIN_IDS = was
    }
  })
})

describe('the client never sees bracket soup, and a long answer arrives whole', () => {
  it('markers are stripped before the send, the memory and the mirror', async () => {
    agentSays = 'Готово, держи [[Пополнить|act:topup]] и вот [[Х|act:nope]]'
    const svc = await import('@/services/businessBotService')
    svc.handleBusinessConnection(connection() as any)
    const bot = fakeBot()
    await svc.handleBusinessMessage(dm('привет') as any, bot as any, BOT)
    await flush()
    const reply = asOwner(bot)
    expect(reply[1]).toBe('Готово, держи  и вот')
    expect(reply[1]).not.toContain('[[')
    const [, , , messages] = mirrorDm.mock.calls[0] as unknown as [
      string,
      string,
      string,
      any[],
    ]
    expect(messages[1].text).not.toContain('[[')
  })

  it('a 9000-character answer goes out in chunks, the keyboard on the last one only', async () => {
    agentSays = 'слово '.repeat(1500)
    const svc = await import('@/services/businessBotService')
    svc.handleBusinessConnection(connection() as any)
    const bot = fakeBot()
    await svc.handleBusinessMessage(dm('расскажи всё') as any, bot as any, BOT)
    const parts = bot.telegram.sendMessage.mock.calls.filter(
      (c: any[]) => c[2]?.business_connection_id === CONN
    )
    expect(parts.length).toBeGreaterThanOrEqual(3)
    for (const p of parts) expect(String(p[1]).length).toBeLessThanOrEqual(4096)
    expect(parts.slice(0, -1).every((p: any[]) => !p[2].reply_markup)).toBe(
      true
    )
    expect(
      parts
        .at(-1)?.[2]
        .reply_markup.inline_keyboard.flat()
        .map((b: any) => b.text)
    ).toContain('🚀 Открыть в боте')
  })
})
