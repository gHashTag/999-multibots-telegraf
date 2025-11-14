import { describe, it, expect, beforeEach, vi } from 'vitest'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { ModeEnum } from '@/interfaces/modes'

/**
 * Интеграционные тесты для handleHelpCancel
 * Без моков - проверка реальной интеграции
 */
describe('handleHelpCancel Integration Tests', () => {
  let mockContext: Partial<MyContext>
  let mockSceneEnter: any
  let mockSceneLeave: any
  let mockReply: any

  beforeEach(() => {
    mockSceneEnter = vi.fn().mockResolvedValue(undefined)
    mockSceneLeave = vi.fn().mockResolvedValue(undefined)
    mockReply = vi.fn().mockResolvedValue(undefined)

    mockContext = {
      from: { id: 123456 } as any,
      message: undefined,
      callbackQuery: undefined,
      scene: {
        leave: mockSceneLeave,
        enter: mockSceneEnter
      } as any,
      reply: mockReply,
      answerCbQuery: vi.fn().mockResolvedValue(undefined),
      // Установим state.userLanguage для centralizedLanguage
      state: {
        userLanguage: 'ru' as 'ru' | 'en'
      } as any,
      session: {
        __scenes: {}
      } as any
    }
  })

  it('должна обрабатывать справку на русском', async () => {
    mockContext.message = { text: 'справка' } as any
    mockContext.state = { userLanguage: 'ru' } as any

    const result = await handleHelpCancel(mockContext as MyContext)

    expect(result).toBe(true)
    expect(mockSceneEnter).toHaveBeenCalledWith('helpScene')
  })

  it('должна обрабатывать справку на английском', async () => {
    mockContext.message = { text: 'help' } as any
    mockContext.state = { userLanguage: 'en' } as any

    const result = await handleHelpCancel(mockContext as MyContext)

    expect(result).toBe(true)
    expect(mockSceneEnter).toHaveBeenCalledWith('helpScene')
  })

  it('должна обрабатывать отмену на русском', async () => {
    mockContext.message = { text: 'Отмена' } as any
    mockContext.state = { userLanguage: 'ru' } as any

    const result = await handleHelpCancel(mockContext as MyContext)

    expect(result).toBe(true)
    expect(mockSceneLeave).toHaveBeenCalled()
    expect(mockSceneEnter).toHaveBeenCalledWith(ModeEnum.MainMenu)
  })

  it('должна обрабатывать отмену на английском', async () => {
    mockContext.message = { text: 'Cancel' } as any
    mockContext.state = { userLanguage: 'en' } as any

    const result = await handleHelpCancel(mockContext as MyContext)

    expect(result).toBe(true)
    expect(mockSceneLeave).toHaveBeenCalled()
    expect(mockSceneEnter).toHaveBeenCalledWith(ModeEnum.MainMenu)
  })
})
