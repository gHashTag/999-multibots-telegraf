/**
 * THE FALLBACK SELLS THE HOUSE'S CATALOGUE ONLY IN THE HOUSE'S OWN DMS.
 *
 * Owner, 2026-10-03: "why does it make my CTA and not the client's?" When the
 * agent is down, the tool-less fallback answers a business DM in the name of
 * the account that connected it. Its prompt was the house's pitch for every
 * account: our services, tokens for Telegram stars, our bot. A seller who
 * connected his own account had OUR catalogue sold to HIS client in his name.
 *
 * Proved on the real path (handleBusinessMessage, the agent throwing, the
 * fallback's model call captured), all data invented: a seller who is not an
 * admin of this bot gets the neutral prompt; the house's own DM keeps its
 * pitch; and the builder's default is the neutral one.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const chatWithAI = vi.fn(async () => 'fallback reply')
vi.mock('@/services/aiChatService', () => ({
  chatWithAI: (...a: unknown[]) => chatWithAI(...(a as [])),
  AI_CHAT_MODELS: {},
}))
vi.mock('@/core/supabase', () => ({
  getUserLanguageFromDB: vi.fn(async () => null),
}))

let history: Array<{ role: string; content: string; surface?: string }> = []
vi.mock('@/services/trinityAgent', () => ({
  /* cyrillic-ok */ спроситьАгента: async () => {
    // cyrillic-ok: pre-existing identifier
    throw new Error('This operation was aborted')
  },
  recordTurns: async () => 'recorded',
  fetchHistory: async () => history,
  markSurface: (content: string) => content,
}))
vi.mock('@/services/modelSwitch', () => ({
  ingestChats: vi.fn(async () => ({ people: 0, messages_new: 0 })),
  mirrorDm: vi.fn(async () => ({ ok: true })),
}))

const CONN = 'conn-house-marks-1'
const SELLER = 900000001
const BOT = 'house_bot_fixture'
const CLIENT = 900000077

const connection = () => ({
  id: CONN,
  user: { id: SELLER, first_name: 'Seller' },
  user_chat_id: 900000002,
  date: 1,
  is_enabled: true,
  rights: { can_reply: true },
})
const dm = (text: string) => ({
  message_id: 41,
  date: 1757348157,
  chat: { id: CLIENT, first_name: 'Client', type: 'private' },
  from: { id: CLIENT, first_name: 'Client' },
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

/** The house's marks: its catalogue, its currency, its bot. */
const HOUSE_MARKS = ['NeuroPhoto', 'Услуги', 'звёзд', 'токен', `@${BOT}`]

/** The system prompt the fallback handed to the model on one DM. */
async function fallbackPromptFor(adminIds: string, text = 'а сколько стоит?') {
  process.env.ADMIN_IDS = adminIds
  vi.resetModules()
  const svc = await import('@/services/businessBotService')
  svc.handleBusinessConnection(connection() as any)
  await svc.handleBusinessMessage(dm(text) as any, fakeBot() as any, BOT)
  expect(chatWithAI, 'the fallback never ran').toHaveBeenCalled()
  const sent = chatWithAI.mock.calls[0][0] as unknown as Array<{
    role: string
    content: string
  }>
  return String(sent[0].content)
}

const ADMINS_WERE = process.env.ADMIN_IDS
beforeEach(() => {
  chatWithAI.mockClear()
  history = []
})
afterEach(() => {
  process.env.ADMIN_IDS = ADMINS_WERE
})

describe("the fallback in a seller's DM speaks for him, not for the house", () => {
  it('a seller who is not the house gets no catalogue, no price, no bot', async () => {
    const sys = await fallbackPromptFor('1')
    for (const mark of HOUSE_MARKS) expect(sys).not.toContain(mark)
    expect(sys).toContain('передашь его владельцу')
    expect(sys).toContain('Не предлагай оплату')
  })

  it("the house's own DM keeps its catalogue and its bot", async () => {
    const sys = await fallbackPromptFor(String(SELLER))
    expect(sys).toContain('NeuroPhoto')
    expect(sys).toContain('токенами за звёзды')
    expect(sys).toContain(`Бот: @${BOT}.`)
  })

  it('a continuing thread keeps the continuation rule on either side', async () => {
    history = [
      { role: 'user', content: 'А можно записаться на завтра?' },
      { role: 'assistant', content: 'Уточню у владельца.' },
    ]
    const sys = await fallbackPromptFor('1', 'Давай')
    expect(sys).toContain('ЭТО ПРОДОЛЖЕНИЕ РАЗГОВОРА')
    for (const mark of HOUSE_MARKS) expect(sys).not.toContain(mark)
  })

  it('the builder sells nothing of ours unless told the seller is the house', async () => {
    vi.resetModules()
    const { buildBusinessMessages } = await import(
      '@/services/businessBotService'
    )
    const sys = String(buildBusinessMessages('привет', 'Гость', BOT)[0].content)
    for (const mark of HOUSE_MARKS) expect(sys).not.toContain(mark)
  })
})
