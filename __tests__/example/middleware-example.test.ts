import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Telegraf, type Context } from 'telegraf'
import { registerExampleMiddleware } from './middleware-example'
import type { Update, Message, User } from '@telegraf/types'

describe('Example: Simple Middleware', () => {
  let bot: Telegraf<Context>
  let mockContext: Context

  const mockBotInfo: User = {
    id: 1,
    is_bot: true,
    first_name: 'MiddlewareBot',
    username: 'middleware_bot',
  }

  beforeEach(() => {
    bot = new Telegraf<Context>('fake-token-middleware-example')

    // Мокируем API getMe, т.к. handleUpdate его вызывает
    vi.spyOn(bot.telegram, 'callApi').mockImplementation(async method => {
      if (method === 'getMe') return mockBotInfo
      return {}
    })

    // --- Регистрируем Middleware ---
    registerExampleMiddleware(bot)
    // -----------------------------

    // Создаем базовый контекст для update
    mockContext = {
      update: { update_id: 5 } as Update,
      telegram: bot.telegram,
      botInfo: mockBotInfo,
      // Добавляем message для простоты, чтобы update прошел через middleware
      message: {
        message_id: 600,
        date: Date.now(),
        chat: { id: 11223, type: 'private' },
        text: 'trigger middleware',
      } as Message.TextMessage,
      reply: vi.fn(), // На всякий случай
      state: {}, // Важно для проверки установки значения middleware
    } as Context
    // Присваиваем message в update
    mockContext.update = {
      update_id: 5,
      message: mockContext.message,
    } as Update.MessageUpdate

    vi.clearAllMocks()
    vi.spyOn(bot.telegram, 'callApi').mockClear()
    if (vi.isMockFunction(mockContext.reply)) {
      ;(mockContext.reply as ReturnType<typeof vi.fn>).mockClear()
    }
  })

  it('should run the middleware and set ctx.state.middlewareRan to true', async () => {
    // Создаем мок функции next, чтобы проверить ее вызов
    const next = vi.fn()

    // Эмулируем обработку update
    // handleUpdate вызывает цепочку middleware
    await bot.handleUpdate(mockContext.update)

    // Проверяем, что middleware изменило state
    // Важно: Эта проверка сработает, только если middleware было вызвано
    // в процессе handleUpdate. Если handleUpdate не вызывает use(), тест не покажет этого.
    // Более надежно было бы захватить сам middleware, если это возможно.
    expect(mockContext.state.middlewareRan).toBe(true)

    // TODO: Как проверить вызов next()?
    // Прямой вызов next() из этого теста невозможен.
    // Проверка вызова reply ниже может косвенно подтвердить, что next() был вызван
    // (если после middleware есть обработчик, который вызывает reply).

    // Опционально: Если после middleware есть обработчик, который должен был вызваться
    // bot.on('message', (ctx) => ctx.reply('Handler after middleware'));
    // expect(mockContext.reply).toHaveBeenCalledWith('Handler after middleware');
  })

  // Тестирование middleware сложнее, т.к. нужно эмулировать цепочку вызовов.
  // Возможно, потребуется мокировать composer или использовать другие подходы.
})
