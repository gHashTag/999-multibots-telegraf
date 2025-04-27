import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Telegraf, type Context } from 'telegraf'
import { registerExampleStartCommand } from './start-command-example'
import type { Update, Message } from '@telegraf/types'

describe('Example: Start Command Reply', () => {
  let bot: Telegraf<Context>
  let mockContext: Context
  let startHandler: (ctx: Context) => Promise<void>

  beforeEach(() => {
    bot = new Telegraf<Context>('fake-token-start-example')
    const startSpy = vi.spyOn(bot, 'start') // Используем bot.start
    registerExampleStartCommand(bot)

    // Захватываем обработчик bot.start
    if (
      startSpy.mock.calls.length > 0 &&
      typeof startSpy.mock.calls[0][0] === 'function'
    ) {
      startHandler = startSpy.mock.calls[0][0] as (
        ctx: Context
      ) => Promise<void>
    } else {
      throw new Error('Handler for bot.start() not registered')
    }

    mockContext = {
      update: { update_id: 6 } as Update,
      telegram: {} as any,
      botInfo: {
        id: 1,
        username: 'start_bot',
        is_bot: true,
        first_name: 'StartBot',
      },
      message: {
        message_id: 700,
        date: Date.now(),
        chat: { id: 33445, type: 'private' },
        text: '/start', // Текст команды
      } as Message.TextMessage,
      reply: vi.fn(),
      state: {},
    } as Context
    mockContext.update = {
      update_id: 6,
      message: mockContext.message,
    } as Update.MessageUpdate

    vi.clearAllMocks()
    startSpy.mockClear()
    if (vi.isMockFunction(mockContext.reply)) {
      ;(mockContext.reply as ReturnType<typeof vi.fn>).mockClear()
    }
  })

  it('should call ctx.reply with "Welcome!" when /start command is received', async () => {
    expect(startHandler).toBeDefined()
    if (!startHandler) return

    await startHandler(mockContext)

    expect(mockContext.reply).toHaveBeenCalledTimes(1)
    expect(mockContext.reply).toHaveBeenCalledWith('Welcome!')
  })
})
