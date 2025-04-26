import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MyContext } from '@/interfaces'
import { handleTechSupport } from '@/commands/handleTechSupport'
import { Markup } from 'telegraf'
import { initializeMocks, mockIsRussian } from '../mocks/setup'

// Функция для создания мока контекста
const createMockContext = (languageCode: 'ru' | 'en' = 'ru'): MyContext => {
  const ctx = {
    reply: vi.fn().mockResolvedValue({ message_id: 111 }),
    from: {
      id: 987654321,
      is_bot: false,
      first_name: 'Tester',
      language_code: languageCode,
    },
    // Добавляем другие необходимые свойства контекста, если они понадобятся
    // scene: { leave: vi.fn() } // Не нужно для handleTechSupport напрямую
  } as unknown as MyContext
  return ctx
}

describe('handleTechSupport', () => {
  beforeEach(() => {
    initializeMocks()
    mockIsRussian.mockClear()
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
