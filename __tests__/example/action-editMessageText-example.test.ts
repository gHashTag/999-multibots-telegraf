import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Telegraf, type Context } from 'telegraf'
import { registerExampleEditAction } from './action-editMessageText-example'
import type { Update, CallbackQuery, Message } from '@telegraf/types'

describe('Example: Action Edit Message Text', () => {
  let bot: Telegraf<Context>
  let mockContext: Context
  let actionHandler: (ctx: Context) => Promise<void>

  beforeEach(() => {
    bot = new Telegraf<Context>('fake-token-edit-example')
    const actionSpy = vi.spyOn(bot, 'action')
    registerExampleEditAction(bot)

    const callArgs = actionSpy.mock.calls.find(call => call[0] === 'edit_me')
    if (callArgs && typeof callArgs[1] === 'function') {
      actionHandler = callArgs[1] as (ctx: Context) => Promise<void>
    } else {
      throw new Error("Handler for action('edit_me') not registered")
    }

    // Создаем мок контекста для callback query с сообщением
    mockContext = {
      update: {
        update_id: 2,
        callback_query: {
          id: 'cb_query_id_456',
          from: { id: 222, is_bot: false, first_name: 'EditUser' },
          chat_instance: 'chat_instance_id_2',
          data: 'edit_me',
          // Важно: нужно полное сообщение, чтобы editMessageText сработал
          message: {
            message_id: 300,
            date: Date.now(),
            chat: { id: 54321, type: 'private' },
            text: 'Original Text',
            // Возможно, понадобятся еще поля, если логика edit сложнее
          } as Message.TextMessage,
        } as CallbackQuery.DataCallbackQuery,
      } as Update.CallbackQueryUpdate,
      telegram: {} as any,
      botInfo: { id: 1, username: 'testbot', is_bot: true, first_name: 'Test' },
      answerCbQuery: vi.fn(),
      editMessageText: vi.fn(), // Мокируем целевой метод
      reply: vi.fn(),
      state: {},
    } as Context

    vi.clearAllMocks()
    actionSpy.mockClear()
    ;(mockContext.editMessageText as ReturnType<typeof vi.fn>).mockClear()
    ;(mockContext.answerCbQuery as ReturnType<typeof vi.fn>).mockClear()
  })

  it('should call ctx.editMessageText with new text', async () => {
    expect(actionHandler).toBeDefined()
    if (!actionHandler) return // Type guard

    await actionHandler(mockContext)

    // Проверяем, что editMessageText был вызван
    expect(mockContext.editMessageText).toHaveBeenCalledTimes(1)
    // Проверяем аргументы вызова
    expect(mockContext.editMessageText).toHaveBeenCalledWith('Text was edited!')

    // Также проверим, что на callback query ответили (хорошая практика)
    expect(mockContext.answerCbQuery).toHaveBeenCalledTimes(1)
  })
})
