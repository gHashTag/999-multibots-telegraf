/**
 * Regression test: rapid messages to the AI chat wizard must fire ONE paid
 * chatWithAI call at a time, not one per message.
 *
 * conversationStep calls chatWithAI (a Replicate prediction, ~30s) once per
 * incoming text with no serialization, so a user sending several messages in
 * quick succession fired several concurrent paid predictions on the platform
 * REPLICATE_API_TOKEN. Same cost-amplification class as the business auto-reply
 * (#1213) and the same in-flight-guard shape as the voice-avatar double-submit.
 *
 * This drives the REAL wizard step through the scene middleware with a real
 * Telegraf Context (cursor at step 2); only the AI provider edge is mocked.
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

const chat = chatWithAI as unknown as Mock

function makeCtx(session: Record<string, unknown>) {
  const update: any = {
    update_id: 1,
    message: {
      message_id: 1,
      date: 0,
      chat: { id: 7, type: 'private' },
      from: { id: 223757230, is_bot: false, first_name: 'U', username: 'u' },
      text: 'hello there',
    },
  }
  const telegram: any = {
    token: 'TESTTOKEN',
    sendMessage: async () => ({ message_id: 2 }),
    deleteMessage: async () => true,
  }
  const ctx: any = new Context(update, telegram, {
    username: 'test_bot',
  } as any)
  ctx.scene = {
    leave: async () => {},
    enter: async () => {},
    current: { id: 'aiChatWizard' },
    state: {},
    session: { cursor: 1 }, // run step 2 (conversationStep)
  }
  ctx.session = session
  return ctx
}

const run = (ctx: any) =>
  (aiChatWizard as any).middleware()(ctx, async () => {})

describe('ai chat: rapid messages fire one paid call at a time', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Keep the AI call pending so the second message lands while the first is
    // still in flight — the real race.
    chat.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve('the answer'), 50))
    )
  })

  it('calls chatWithAI once when two messages arrive concurrently', async () => {
    const session: Record<string, unknown> = {
      wizardData: { selectedModel: 'gpt4', chatHistory: [] },
    }
    await Promise.all([run(makeCtx(session)), run(makeCtx(session))])
    expect(chat).toHaveBeenCalledTimes(1)
  })

  it('releases the guard after a run so a later message calls again', async () => {
    const session: Record<string, unknown> = {
      wizardData: { selectedModel: 'gpt4', chatHistory: [] },
    }
    await run(makeCtx(session))
    expect(chat).toHaveBeenCalledTimes(1)
    expect(session.aiChatInProgress).toBe(false)

    await run(
      makeCtx({ wizardData: { selectedModel: 'gpt4', chatHistory: [] } })
    )
    expect(chat).toHaveBeenCalledTimes(2)
  })

  it('releases the guard when the AI call fails, so the user can retry', async () => {
    chat.mockRejectedValue(new Error('replicate down'))
    const session: Record<string, unknown> = {
      wizardData: { selectedModel: 'gpt4', chatHistory: [] },
    }
    await run(makeCtx(session))
    expect(session.aiChatInProgress).toBe(false)
  })
})
