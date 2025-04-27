import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Telegraf, type Context } from 'telegraf'
import { registerExampleHears } from './hears-reply-example'
import type { Update, Message } from '@telegraf/types' // Используем мок typegram

// Мокируем зависимости (если есть)
// vi.mock('@/utils/logger');

describe('Example: Hears Reply', () => {
  let bot: Telegraf<Context>
  let mockContext: Context
  let hearsHandler: (ctx: Context) => Promise<void>

  beforeEach(() => {
    // Создаем новый экземпляр бота
    bot = new Telegraf<Context>('fake-token-hears-example')

    // Используем шпиона для метода hears, чтобы захватить обработчик
    const hearsSpy = vi.spyOn(bot, 'hears')

    // Регистрируем обработчик
    registerExampleHears(bot)

    // Находим и сохраняем обработчик для 'hello'
    const callArgs = hearsSpy.mock.calls.find(call => call[0] === 'hello')
    if (callArgs && typeof callArgs[1] === 'function') {
      hearsHandler = callArgs[1] as (ctx: Context) => Promise<void>
    } else {
      throw new Error("Handler for hears('hello') not registered")
    }

    // Создаем минимальный мок контекста для текстового сообщения
    mockContext = {
      // Базовые свойства
      update: { update_id: 1 } as Update,
      telegram: {} as any,
      botInfo: { id: 1, username: 'testbot', is_bot: true, first_name: 'Test' },
      // Свойства для текстового сообщения
      message: {
        message_id: 100,
        date: Date.now(),
        chat: { id: 12345, type: 'private' },
        text: 'hello',
      } as Message.TextMessage,
      // Мокируем метод reply
      reply: vi.fn(),
      // ... другие свойства контекста, если они понадобятся
      // Например, state, если он используется в реальном коде
      state: {},
    } as Context

    // Очищаем моки
    vi.clearAllMocks()
    hearsSpy.mockClear()
    ;(mockContext.reply as ReturnType<typeof vi.fn>).mockClear()
  })

  it('should call ctx.reply with "world" when hears "hello"', async () => {
    expect(hearsHandler).toBeDefined()
    if (!hearsHandler) return // Type guard

    // Вызываем захваченный обработчик
    await hearsHandler(mockContext)

    // Проверяем, что ctx.reply был вызван с ожидаемым текстом
    expect(mockContext.reply).toHaveBeenCalledTimes(1)
    expect(mockContext.reply).toHaveBeenCalledWith('world')
  })
})
