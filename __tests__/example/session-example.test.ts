import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Telegraf, type Context } from 'telegraf'
import { session } from 'telegraf'
// Убираем статический импорт
// import { registerSessionExample } from './session-example'
import type { Update, Message, User } from '@telegraf/types'

// Тип контекста из примера
interface SessionContext extends Context {
  session?: {
    counter?: number
  }
}

describe('Example: Session Usage', () => {
  let bot: Telegraf<SessionContext>
  const chatId = 12345
  const userId = 54321

  beforeEach(async () => {
    // Делаем beforeEach асинхронным
    bot = new Telegraf<SessionContext>('fake-token-session-example')

    // Динамически импортируем и регистрируем обработчик ПОСЛЕ создания bot
    const { registerSessionExample } = await import('./session-example')
    registerSessionExample(bot)

    // Очищаем все моки (включая глобальные)
    vi.clearAllMocks()
  })

  // Хелпер для создания мока Update и Context
  const createMockUpdateAndContext = (text: string): SessionContext => {
    const update = {
      update_id: Date.now(), // Просто уникальный ID
      message: {
        message_id: Date.now() + 1,
        from: { id: userId, is_bot: false, first_name: 'TestUser' },
        chat: { id: chatId, type: 'private' },
        date: Math.floor(Date.now() / 1000),
        text: text,
      } as Message.TextMessage,
    } as Update.MessageUpdate

    // Создаем контекст через bot.context
    // bot.context должен быть замокан в глобальном моке
    const ctx = bot.context(update)
    // Добавляем reply как шпион, если глобальный мок context его не добавил
    if (!ctx.reply) {
      ctx.reply = vi.fn()
    }
    return ctx as SessionContext
  }

  it('should increment session counter on multiple calls', async () => {
    const ctx1 = createMockUpdateAndContext('/count')
    // Используем bot.handleUpdate, который должен вызвать use и command
    await bot.handleUpdate(ctx1.update)
    expect(vi.mocked(ctx1.reply)).toHaveBeenCalledWith('Counter: 1')
    expect(ctx1.session?.counter).toBe(1)
    vi.mocked(ctx1.reply).mockClear()

    const ctx2 = createMockUpdateAndContext('/count')
    await bot.handleUpdate(ctx2.update)
    expect(vi.mocked(ctx2.reply)).toHaveBeenCalledWith('Counter: 2')
    expect(ctx2.session?.counter).toBe(2)
    vi.mocked(ctx2.reply).mockClear()

    const ctx3 = createMockUpdateAndContext('/count')
    await bot.handleUpdate(ctx3.update)
    expect(vi.mocked(ctx3.reply)).toHaveBeenCalledWith('Counter: 3')
    expect(ctx3.session?.counter).toBe(3)
  })

  it('should initialize counter if session is empty', async () => {
    const ctx = createMockUpdateAndContext('/count')
    await bot.handleUpdate(ctx.update)
    expect(vi.mocked(ctx.reply)).toHaveBeenCalledWith('Counter: 1')
    expect(ctx.session).toBeDefined()
    expect(ctx.session?.counter).toBe(1)
  })
})
