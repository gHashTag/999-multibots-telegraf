import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MyContext } from '@/interfaces'
import { handleTechSupport } from '@/commands/handleTechSupport/index'
import { Markup } from 'telegraf'
import { mockIsRussian } from '../setup'
import type { User, Chat } from '@telegraf/types'

// Функция для создания mock-контекста (улучшенная)
const createMockContext = (
  languageCode: 'ru' | 'en' | undefined = 'en'
): MyContext => {
  const defaultUser: User = {
    id: 987654321,
    is_bot: false,
    first_name: 'Tester',
    username: 'testsupportuser',
    language_code: languageCode, // Используем переданный код
  }

  const defaultChat: Chat.PrivateChat = {
    id: 987654321,
    type: 'private',
    first_name: 'Tester',
    username: 'testsupportuser',
  }

  const ctx: Partial<MyContext> = {
    from: defaultUser,
    chat: defaultChat,
    message: {
      // Добавляем базовое сообщение, если нужно
      message_id: 1,
      date: Math.floor(Date.now() / 1000),
      chat: defaultChat,
      from: defaultUser,
      text: '/support',
    } as any,
    reply: vi.fn().mockResolvedValue({ message_id: 111 }),
    telegram: {
      // Добавляем базовый мок telegram API
      sendMessage: vi.fn().mockResolvedValue({}),
    } as any,
    session: {} as any, // Добавляем пустую сессию
    scene: {} as any, // Добавляем пустую сцену
    wizard: {} as any, // Добавляем пустой визард
    // Добавляем другие необходимые поля, если isRussian их использует
  }
  // Больше не используем as unknown
  return ctx as MyContext
}

describe('handleTechSupport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Настраиваем моки
    // mockIsRussian настраивается в каждом тесте отдельно
  })

  it('should send the Russian support message for ru language code', async () => {
    // Arrange
    const ctx = createMockContext('ru')
    mockIsRussian.mockReturnValue(true)
    const expectedMessage =
      '🛠 Для обращения в техподдержку, напишите @neuro_sage\n\n' +
      'Пожалуйста, опишите вашу проблему максимально подробно.\n\nДля возврата в главное меню, нажмите /menu'

    // Act
    await handleTechSupport(ctx)

    // Assert
    expect(mockIsRussian).toHaveBeenCalledWith(ctx)
    expect(ctx.reply).toHaveBeenCalledOnce()
    expect(ctx.reply).toHaveBeenCalledWith(
      expectedMessage,
      Markup.removeKeyboard()
    )
  })

  it('should send the English support message for en language code', async () => {
    // Arrange
    const ctx = createMockContext('en')
    mockIsRussian.mockReturnValue(false)
    const expectedMessage =
      '🛠 To contact tech support, write to @neuro_sage\n\n' +
      'Please describe your problem in as much detail as possible.\n\nTo return to the main menu, click /menu'

    // Act
    await handleTechSupport(ctx)

    // Assert
    expect(mockIsRussian).toHaveBeenCalledWith(ctx)
    expect(ctx.reply).toHaveBeenCalledOnce()
    expect(ctx.reply).toHaveBeenCalledWith(
      expectedMessage,
      Markup.removeKeyboard()
    )
  })

  it('should send the **Russian** support message if language code is undefined', async () => {
    // Arrange
    const ctx = createMockContext(undefined as any) // Симулируем отсутствие language_code
    mockIsRussian.mockReturnValue(true)
    // Ожидаем РУССКИЙ текст как fallback
    const expectedMessage =
      '🛠 Для обращения в техподдержку, напишите @neuro_sage\n\n' +
      'Пожалуйста, опишите вашу проблему максимально подробно.\n\nДля возврата в главное меню, нажмите /menu'

    // Act
    await handleTechSupport(ctx)

    // Assert
    expect(mockIsRussian).toHaveBeenCalledWith(ctx)
    expect(ctx.reply).toHaveBeenCalledOnce()
    expect(ctx.reply).toHaveBeenCalledWith(
      expectedMessage,
      Markup.removeKeyboard()
    )
  })
})
