import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  askAgent: vi.fn(),
  recordTurns: vi.fn(),
  fallback: vi.fn(),
}))
vi.mock('@/core/supabase', () => ({}))
vi.mock('@/store', () => ({ defaultSession: { mode: null } }))
vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: () => false,
}))
vi.mock('@/services/trinityAgent', () => ({
  ['спроситьАгента']: mocks.askAgent,
  recordTurns: mocks.recordTurns,
}))
vi.mock('@/services/aiChatService', () => ({
  chatWithAI: mocks.fallback,
  AI_CHAT_MODELS: {},
}))
vi.mock('@/services/agentAttachments', () => ({
  attachmentFromMessage: (message: any) =>
    message.photo ? { kind: 'image' } : null,
  buildAgentMessage: async (_telegram: unknown, message: any) => ({
    text: message.text || message.caption || 'Attached image',
  }),
}))

import { registerCommands } from '@/navigation/registerCommands'

function agentMiddleware() {
  const middleware: Array<(ctx: any, next: any) => Promise<void>> = []
  const bot: any = {
    command: () => bot,
    use: (handler: any) => {
      middleware.push(handler)
      return bot
    },
    on: () => bot,
    action: () => bot,
    hears: () => bot,
    catch: () => bot,
    telegram: { getMe: vi.fn(async () => ({ id: 1, username: 'test_bot' })) },
    botInfo: { username: 'test_bot' },
  }
  registerCommands({ bot })
  const handler = middleware.at(-1)
  expect(handler).toBeTypeOf('function')
  return handler!
}

function context(message: any, chatType = 'private') {
  return {
    message,
    chat: { id: 123456789, type: chatType },
    from: { id: 123456789, language_code: 'en' },
    session: {},
    scene: { current: null },
    state: {},
    reply: vi.fn(async () => undefined),
    sendChatAction: vi.fn(async () => undefined),
    telegram: {},
  }
}

describe('registered bot delivery uses agent task actions', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each([
    { text: 'Open my content plan' },
    {
      photo: [{ file_id: 'unit-test-photo' }],
      caption: 'Make a video from this',
    },
  ])('delivers the action for a text or media turn: %j', async message => {
    mocks.askAgent.mockResolvedValue({
      ['текст']: '',
      ['инструменты']: ['open_app'],
      actions: [{ type: 'open_mini_app', destination: 'plan' }],
    })
    const ctx = context(message)
    await agentMiddleware()(ctx, vi.fn())
    expect(ctx.reply).toHaveBeenCalledExactlyOnceWith(
      'Open the next screen in the app.',
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: 'Open plan',
                web_app: { url: 'https://app.t27.ai/profile?tab=plan' },
              },
            ],
          ],
        },
      }
    )
    expect(mocks.fallback).not.toHaveBeenCalled()
  })

  it('keeps a continuation button when the plain-model fallback answers', async () => {
    mocks.askAgent.mockRejectedValue(new Error('unit-test agent unavailable'))
    mocks.fallback.mockResolvedValue('Here is the fallback answer.')
    const ctx = context({ text: 'Help with my script' })
    await agentMiddleware()(ctx, vi.fn())
    expect(ctx.reply).toHaveBeenCalledExactlyOnceWith(
      'Here is the fallback answer.',
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: 'Continue in app',
                web_app: { url: 'https://app.t27.ai/chat' },
              },
            ],
          ],
        },
      }
    )
    expect(mocks.recordTurns).toHaveBeenCalledWith('123456789', [
      { role: 'user', content: 'Help with my script' },
      { role: 'assistant', content: 'Here is the fallback answer.' },
    ])
  })
})
