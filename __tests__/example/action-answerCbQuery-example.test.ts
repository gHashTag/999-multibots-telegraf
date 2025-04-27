import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Telegraf, type Context } from 'telegraf'
import { registerExampleAction } from './action-answerCbQuery-example'
import type { Update, CallbackQuery } from '@telegraf/types' // Используем мок typegram

describe('Example: Action Answer Callback Query', () => {
  let bot: Telegraf<Context>
  let mockContext: Context
  let actionHandler: (ctx: Context) => Promise<void>

  beforeEach(() => {
    bot = new Telegraf<Context>('fake-token-action-example')
    const actionSpy = vi.spyOn(bot, 'action')
    registerExampleAction(bot)

    const callArgs = actionSpy.mock.calls.find(
      call => call[0] === 'test_action'
    )
    if (callArgs && typeof callArgs[1] === 'function') {
      actionHandler = callArgs[1] as (ctx: Context) => Promise<void>
    } else {
      throw new Error("Handler for action('test_action') not registered")
    }

    // Создаем мок контекста для callback query
    mockContext = {
      update: {
        update_id: 1,
        callback_query: {
          id: 'cb_query_id_123',
          from: { id: 111, is_bot: false, first_name: 'TestUser' },
          chat_instance: 'chat_instance_id',
          data: 'test_action',
          // message обязательно для callback_query
          message: {
            message_id: 200,
            date: Date.now(),
            chat: { id: 12345, type: 'private' },
            text: 'Original message',
          },
        } as CallbackQuery.DataCallbackQuery, // Указываем тип
      } as Update.CallbackQueryUpdate, // Указываем тип update
      telegram: {} as any,
      botInfo: { id: 1, username: 'testbot', is_bot: true, first_name: 'Test' },
      // Мокируем нужные методы контекста
      answerCbQuery: vi.fn(),
      reply: vi.fn(), // На всякий случай
      editMessageText: vi.fn(), // На случай будущих тестов
      state: {},
    } as Context

    vi.clearAllMocks()
    actionSpy.mockClear()
    ;(mockContext.answerCbQuery as ReturnType<typeof vi.fn>).mockClear()
  })

  it('should call ctx.answerCbQuery when action "test_action" is triggered', async () => {
    expect(actionHandler).toBeDefined()
    if (!actionHandler) return // Type guard

    await actionHandler(mockContext)

    expect(mockContext.answerCbQuery).toHaveBeenCalledTimes(1)
    expect(mockContext.answerCbQuery).toHaveBeenCalledWith('Action received!')
  })
})
