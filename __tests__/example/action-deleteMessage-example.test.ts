import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Telegraf, type Context } from 'telegraf'
import { registerExampleDeleteAction } from './action-deleteMessage-example'
import type { Update, CallbackQuery, Message } from '@telegraf/types'

describe('Example: Action Delete Message', () => {
  let bot: Telegraf<Context>
  let mockContext: Context
  let actionHandler: (ctx: Context) => Promise<void>

  beforeEach(() => {
    bot = new Telegraf<Context>('fake-token-delete-example')
    const actionSpy = vi.spyOn(bot, 'action')
    registerExampleDeleteAction(bot)

    const callArgs = actionSpy.mock.calls.find(call => call[0] === 'delete_me')
    if (callArgs && typeof callArgs[1] === 'function') {
      actionHandler = callArgs[1] as (ctx: Context) => Promise<void>
    } else {
      throw new Error("Handler for action('delete_me') not registered")
    }

    mockContext = {
      update: {
        update_id: 4,
        callback_query: {
          id: 'cb_query_id_789',
          from: { id: 333, is_bot: false, first_name: 'DeleteUser' },
          chat_instance: 'chat_instance_id_3',
          data: 'delete_me',
          message: {
            message_id: 500, // ID сообщения для удаления
            date: Date.now(),
            chat: { id: 98765, type: 'private' },
            text: 'Message to delete',
          } as Message.TextMessage, // Важно, чтобы message было определено
        } as CallbackQuery.DataCallbackQuery,
      } as Update.CallbackQueryUpdate,
      telegram: {} as any,
      botInfo: { id: 1, username: 'testbot', is_bot: true, first_name: 'Test' },
      answerCbQuery: vi.fn(),
      deleteMessage: vi.fn(), // Мокируем целевой метод
      reply: vi.fn(),
      state: {},
    } as Context

    vi.clearAllMocks()
    actionSpy.mockClear()
    if (vi.isMockFunction(mockContext.deleteMessage)) {
      ;(mockContext.deleteMessage as ReturnType<typeof vi.fn>).mockClear()
    }
    if (vi.isMockFunction(mockContext.answerCbQuery)) {
      ;(mockContext.answerCbQuery as ReturnType<typeof vi.fn>).mockClear()
    }
  })

  it('should call ctx.deleteMessage when action "delete_me" is triggered', async () => {
    expect(actionHandler).toBeDefined()
    if (!actionHandler) return

    await actionHandler(mockContext)

    // Проверяем, что deleteMessage был вызван
    expect(mockContext.deleteMessage).toHaveBeenCalledTimes(1)
    // Можно проверить аргументы, если deleteMessage вызывается с ними (обычно без аргументов)
    // expect(mockContext.deleteMessage).toHaveBeenCalledWith(...);

    // Проверим, что на callback query ответили
    expect(mockContext.answerCbQuery).toHaveBeenCalledTimes(1)
  })
})
