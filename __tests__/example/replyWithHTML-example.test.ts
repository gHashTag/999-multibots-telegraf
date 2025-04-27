import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Telegraf, type Context } from 'telegraf'
import { registerExampleHTMLCommand } from './replyWithHTML-example'
import type { Update, Message } from '@telegraf/types'

describe('Example: Reply With HTML', () => {
  let bot: Telegraf<Context>
  let mockContext: Context
  let commandHandler: (ctx: Context) => Promise<void>

  beforeEach(() => {
    bot = new Telegraf<Context>('fake-token-html-example')
    const commandSpy = vi.spyOn(bot, 'command')
    registerExampleHTMLCommand(bot)

    const callArgs = commandSpy.mock.calls.find(call => call[0] === 'html')
    if (callArgs && typeof callArgs[1] === 'function') {
      commandHandler = callArgs[1] as (ctx: Context) => Promise<void>
    } else {
      throw new Error('Handler for /html command not registered')
    }

    mockContext = {
      update: { update_id: 7 } as Update,
      telegram: {} as any,
      botInfo: {
        id: 1,
        username: 'html_bot',
        is_bot: true,
        first_name: 'HTMLBot',
      },
      message: {
        message_id: 800,
        date: Date.now(),
        chat: { id: 55667, type: 'private' },
        text: '/html',
      } as Message.TextMessage,
      replyWithHTML: vi.fn(), // Мокируем целевой метод
      reply: vi.fn(), // На всякий случай
      state: {},
    } as Context
    mockContext.update = {
      update_id: 7,
      message: mockContext.message,
    } as Update.MessageUpdate

    vi.clearAllMocks()
    commandSpy.mockClear()
    if (vi.isMockFunction(mockContext.replyWithHTML)) {
      ;(mockContext.replyWithHTML as ReturnType<typeof vi.fn>).mockClear()
    }
  })

  it('should call ctx.replyWithHTML with correct HTML string', async () => {
    expect(commandHandler).toBeDefined()
    if (!commandHandler) return

    await commandHandler(mockContext)

    expect(mockContext.replyWithHTML).toHaveBeenCalledTimes(1)
    expect(mockContext.replyWithHTML).toHaveBeenCalledWith(
      '<b>Hello</b> <i>World!</i>'
    )
  })
})
