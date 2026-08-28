import { describe, it, expect, beforeEach, vi } from 'vitest'
import { handleHelpCancel } from '@/navigation'
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { ModeEnum } from '@/interfaces/modes'

// Mock logger
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

// Mock showMainMenu
vi.mock('@/navigation/helpers/menuKeyboard', () => ({
  showMainMenu: vi.fn().mockResolvedValue(undefined),
}))

// Mock centralizedLanguage
vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: vi.fn().mockReturnValue(true),
}))

import { isRussianFromState } from '@/helpers/centralizedLanguage'
import type { Mock } from 'vitest'
import type { MutableCtx } from '../helpers/mutableContext'

/**
 * Тесты для handleHelpCancel
 */
describe('handleHelpCancel Integration Tests', () => {
  let mockContext: MutableCtx
  let mockSceneEnter: any
  let mockSceneLeave: any
  let mockReply: any

  beforeEach(() => {
    vi.clearAllMocks()

    // По умолчанию - русский язык
    ;(isRussianFromState as Mock).mockReturnValue(true)

    mockSceneEnter = vi.fn().mockResolvedValue(undefined)
    mockSceneLeave = vi.fn().mockResolvedValue(undefined)
    mockReply = vi.fn().mockResolvedValue(undefined)

    mockContext = {
      from: { id: 123456 } as any,
      message: undefined,
      callbackQuery: undefined,
      scene: {
        leave: mockSceneLeave,
        enter: mockSceneEnter,
      } as any,
      reply: mockReply,
      answerCbQuery: vi.fn().mockResolvedValue(undefined),
      // Установим state.userLanguage для centralizedLanguage
      state: {
        userLanguage: 'ru' as 'ru' | 'en',
      } as any,
      session: {
        __scenes: {},
      } as any,
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
    ;(isRussianFromState as Mock).mockReturnValue(false)
    mockContext.message = { text: 'help' } as any
    mockContext.state = { userLanguage: 'en' } as any

    const result = await handleHelpCancel(mockContext as MyContext)

    expect(result).toBe(true)
    expect(mockSceneEnter).toHaveBeenCalledWith('helpScene')
  })

  it('должна обрабатывать отмену на русском', async () => {
    ;(isRussianFromState as Mock).mockReturnValue(true)
    mockContext.message = { text: 'Отмена' } as any
    mockContext.state = { userLanguage: 'ru' } as any

    const result = await handleHelpCancel(mockContext as MyContext)

    expect(result).toBe(true)
    // executeCancel вызывает scene.leave() внутри
    expect(mockSceneLeave).toHaveBeenCalled()
  })

  it('должна обрабатывать отмену на английском', async () => {
    ;(isRussianFromState as Mock).mockReturnValue(false)
    mockContext.message = { text: 'cancel' } as any
    mockContext.state = { userLanguage: 'en' } as any

    const result = await handleHelpCancel(mockContext as MyContext)

    expect(result).toBe(true)
    expect(mockSceneLeave).toHaveBeenCalled()
  })

  it('должна возвращать false для неизвестного текста', async () => {
    mockContext.message = { text: 'Привет' } as any
    mockContext.state = { userLanguage: 'ru' } as any

    const result = await handleHelpCancel(mockContext as MyContext)

    expect(result).toBe(false)
    expect(mockSceneLeave).not.toHaveBeenCalled()
    expect(mockSceneEnter).not.toHaveBeenCalled()
  })

  it('должна возвращать false если нет сообщения', async () => {
    mockContext.message = undefined
    mockContext.state = { userLanguage: 'ru' } as any

    const result = await handleHelpCancel(mockContext as MyContext)

    expect(result).toBe(false)
  })

  it('должна обрабатывать справку с эмодзи', async () => {
    ;(isRussianFromState as Mock).mockReturnValue(true)
    mockContext.message = { text: 'ℹ️ Справка' } as any
    mockContext.state = { userLanguage: 'ru' } as any

    const result = await handleHelpCancel(mockContext as MyContext)

    expect(result).toBe(true)
    expect(mockSceneEnter).toHaveBeenCalledWith('helpScene')
  })

  it('должна возвращать false для главного меню (handleHelpCancel не обрабатывает)', async () => {
    // handleHelpCancel обрабатывает только Справка и Отмена
    // Главное меню обрабатывается отдельно через CancelButtonService.handleMainMenuButton
    mockContext.message = { text: '🏠 Главное меню' } as any
    mockContext.state = { userLanguage: 'ru' } as any

    const result = await handleHelpCancel(mockContext as MyContext)

    // Главное меню НЕ обрабатывается в handleHelpCancel
    expect(result).toBe(false)
  })
})
