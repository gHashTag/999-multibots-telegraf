import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Telegraf, type Context } from 'telegraf'
import { registerExampleLeaveCommand } from './leave-chat-example'
import type { Update, Message, User } from '@telegraf/types'

describe('Example: Leave Chat Command', () => {
  let bot: Telegraf<Context>
  let mockContext: Context
  let commandHandler: (ctx: Context) => Promise<void>

  const mockBotInfo: User = {
    id: 1,
    is_bot: true,
    first_name: 'LeaveBot',
    username: 'leave_bot',
  }
  const chatIdToLeave = 123456 // ID чата, из которого бот должен выйти

  beforeEach(() => {
    bot = new Telegraf<Context>('fake-token-leave-example')

    // --- Мок API ---
    const apiSpy = vi
      .spyOn(bot.telegram, 'callApi')
      .mockImplementation(async (method, payload) => {
        if (method === 'getMe') return mockBotInfo
        if (method === 'leaveChat') {
          // Проверяем, что ID чата передан правильно
          expect((payload as any)?.chat_id).toBe(chatIdToLeave)
          console.log(
            `Mock API: Handled leaveChat for chat ID: ${(payload as any)?.chat_id}`
          )
          return true // Имитируем успех
        }
        console.warn(`Unhandled API call in mock: ${method}`)
        return {}
      })
    // ---------------

    const commandSpy = vi.spyOn(bot, 'command')
    registerExampleLeaveCommand(bot)

    const callArgs = commandSpy.mock.calls.find(call => call[0] === 'leave')
    if (callArgs && typeof callArgs[1] === 'function') {
      commandHandler = callArgs[1] as (ctx: Context) => Promise<void>
    } else {
      throw new Error('Handler for /leave command not registered')
    }

    mockContext = {
      update: { update_id: 10 } as Update,
      telegram: bot.telegram,
      botInfo: mockBotInfo,
      message: {
        message_id: 1100,
        date: Date.now(),
        chat: { id: chatIdToLeave, type: 'group' }, // Указываем ID чата для выхода
        text: '/leave',
      } as Message.TextMessage,
      // Убедимся, что метод leaveChat существует в контексте
      // Telegraf обычно добавляет его автоматически
      leaveChat: () => bot.telegram.leaveChat(chatIdToLeave), // Примерная реализация
      reply: vi.fn(),
      state: {},
    } as Context
    mockContext.update = {
      update_id: 10,
      message: mockContext.message,
    } as Update.MessageUpdate

    vi.clearAllMocks()
    apiSpy.mockClear()
    commandSpy.mockClear()
    if (vi.isMockFunction(mockContext.reply)) {
      ;(mockContext.reply as ReturnType<typeof vi.fn>).mockClear()
    }
    // Шпионим за leaveChat, чтобы проверить вызов
    vi.spyOn(mockContext, 'leaveChat')
  })

  it('should call ctx.leaveChat when /leave command is received', async () => {
    expect(commandHandler).toBeDefined()
    if (!commandHandler) return

    await commandHandler(mockContext)

    // Проверяем, что ctx.leaveChat был вызван
    expect(mockContext.leaveChat).toHaveBeenCalledTimes(1)
    // Проверяем, что API leaveChat был вызван внутри (через мок callApi)
    expect(bot.telegram.callApi).toHaveBeenCalledWith('leaveChat', {
      chat_id: chatIdToLeave,
    })
  })
})
