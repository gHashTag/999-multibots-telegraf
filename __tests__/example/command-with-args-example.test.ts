import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Telegraf, type Context } from 'telegraf'
import { registerExampleCommandWithArgs } from './command-with-args-example'
import type { Update, Message } from '@telegraf/types'

describe('Example: Command With Arguments', () => {
  let bot: Telegraf<Context>
  let mockContext: Context
  let commandHandler: (ctx: Context) => Promise<void>

  beforeEach(() => {
    bot = new Telegraf<Context>('fake-token-args-example')
    const commandSpy = vi.spyOn(bot, 'command')
    registerExampleCommandWithArgs(bot)

    const callArgs = commandSpy.mock.calls.find(call => call[0] === 'args')
    if (callArgs && typeof callArgs[1] === 'function') {
      commandHandler = callArgs[1] as (ctx: Context) => Promise<void>
    } else {
      throw new Error('Handler for /args command not registered')
    }

    mockContext = {
      update: { update_id: 8 } as Update,
      telegram: {} as any,
      botInfo: {
        id: 1,
        username: 'args_bot',
        is_bot: true,
        first_name: 'ArgsBot',
      },
      message: {
        message_id: 900,
        date: Date.now(),
        chat: { id: 77889, type: 'private' },
        text: '/args hello world 123', // Команда с аргументами
      } as Message.TextMessage,
      reply: vi.fn(),
      state: {},
    } as Context
    mockContext.update = {
      update_id: 8,
      message: mockContext.message,
    } as Update.MessageUpdate

    vi.clearAllMocks()
    commandSpy.mockClear()
    if (vi.isMockFunction(mockContext.reply)) {
      ;(mockContext.reply as ReturnType<typeof vi.fn>).mockClear()
    }
  })

  it('should extract arguments and reply with them', async () => {
    expect(commandHandler).toBeDefined()
    if (!commandHandler) return

    await commandHandler(mockContext)

    expect(mockContext.reply).toHaveBeenCalledTimes(1)
    // Проверяем, что reply вызван с правильными аргументами
    expect(mockContext.reply).toHaveBeenCalledWith(
      'Args received: hello, world, 123'
    )
  })

  it('should reply with "No args" if no arguments are provided', async () => {
    expect(commandHandler).toBeDefined()
    if (!commandHandler) return

    // Изменяем текст сообщения в контексте для этого теста
    mockContext.message.text = '/args'
    mockContext.update.message = mockContext.message // Обновляем update

    await commandHandler(mockContext)

    expect(mockContext.reply).toHaveBeenCalledTimes(1)
    expect(mockContext.reply).toHaveBeenCalledWith('No args provided.')
  })
})
