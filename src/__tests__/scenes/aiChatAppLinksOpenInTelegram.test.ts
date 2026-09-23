/**
 * THE MENU'S 'AI CHAT' ANSWER OPENS INSIDE TELEGRAM TOO.
 *
 * Every other model answer in the bot leaves through `buttonsForAnswer`,
 * which rewrites a bare app.t27.ai into this bot's t.me link: outside
 * Telegram the app has no signed launch data and shows a wall, so a raw app
 * URL is a link that looks alive and leads nowhere. The AI chat wizard has no
 * act: markers to parse, so it never called `buttonsForAnswer` -- and was the
 * one path left carrying the bare host (review of #2870, issue #2878).
 *
 * This drives the REAL wizard step (cursor at step 2, as in
 * aiChatSingleFlight.test.ts); only the model edge is faked. Ids and bot
 * names are invented.
 */
import { describe, it, expect, beforeEach, vi, Mock } from 'vitest'

vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: vi.fn(() => false),
}))
vi.mock('@/services/aiChatService', () => ({
  chatWithAI: vi.fn(),
  AI_CHAT_MODELS: {
    gpt4: { id: 'gpt4', label_ru: 'GPT-4', label_en: 'GPT-4' },
  },
  getModelLabel: vi.fn(() => 'GPT-4'),
}))
vi.mock('@/services/chatMemoryService', () => ({
  loadHistory: vi.fn(async () => []),
  clearHistory: vi.fn(async () => {}),
  getUserContext: vi.fn(async () => ''),
}))
vi.mock('@/navigation', () => ({
  sendGenericErrorMessage: vi.fn(async () => {}),
  showMainMenu: vi.fn(async () => {}),
}))
vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import { Context } from 'telegraf'
import { aiChatWizard } from '@/scenes/aiChatWizard'
import { chatWithAI } from '@/services/aiChatService'
import { forgetMainWebAppForTests } from '@/navigation/helpers/appLinks'

const chat = chatWithAI as unknown as Mock
const BOT = 'example_farm_bot'

function makeCtx(session: Record<string, unknown>) {
  const sent: Array<{ text: string; extra?: any }> = []
  const update: any = {
    update_id: 1,
    message: {
      message_id: 1,
      date: 0,
      chat: { id: 900000077, type: 'private' },
      from: {
        id: 900000077,
        is_bot: false,
        first_name: 'Someone',
        username: 'someone',
      },
      text: 'where is the hive?',
    },
  }
  const telegram: any = {
    token: 'TESTTOKEN',
    sendMessage: async (_chatId: unknown, text: string, extra?: any) => {
      sent.push({ text, extra })
      return { message_id: sent.length + 1 }
    },
    deleteMessage: async () => true,
  }
  const ctx: any = new Context(update, telegram, { username: BOT } as any)
  ctx.scene = {
    leave: async () => {},
    enter: async () => {},
    current: { id: 'aiChatWizard' },
    state: {},
    session: { cursor: 1 }, // run step 2 (conversationStep)
  }
  ctx.session = session
  return { ctx, sent }
}

const run = (ctx: any) =>
  (aiChatWizard as any).middleware()(ctx, async () => {})

describe("the AI chat's answer opens inside Telegram", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    forgetMainWebAppForTests()
  })

  it('a bare app host in the answer becomes this bot’s t.me link', async () => {
    chat.mockResolvedValue('Open https://app.t27.ai/hive to see the board.')
    const { ctx, sent } = makeCtx({})
    await run(ctx)

    const answer = sent.map(s => s.text).join('\n')
    expect(answer).toContain('https://t.me/example_farm_bot?start=app_hive')
    expect(answer).not.toContain('app.t27.ai')
  })

  it('the session history keeps what the person actually read', async () => {
    chat.mockResolvedValue('See app.t27.ai/club')
    const { ctx } = makeCtx({})
    await run(ctx)

    const history = (ctx.session.wizardData?.chatHistory ?? []) as Array<{
      role: string
      content: string
    }>
    const last = history[history.length - 1]
    expect(last.role).toBe('assistant')
    expect(last.content).toBe(
      'See https://t.me/example_farm_bot?start=app_club'
    )
  })

  it('an answer with no app URL is passed through untouched', async () => {
    chat.mockResolvedValue('The hive is the map of the game.')
    const { ctx, sent } = makeCtx({})
    await run(ctx)
    expect(sent.map(s => s.text).join('\n')).toContain(
      'The hive is the map of the game.'
    )
  })

  it('a file on the app host stays a file link', async () => {
    chat.mockResolvedValue('Cover: https://app.t27.ai/covers/poster.jpeg')
    const { ctx, sent } = makeCtx({})
    await run(ctx)
    expect(sent.map(s => s.text).join('\n')).toContain(
      'https://app.t27.ai/covers/poster.jpeg'
    )
  })
})
