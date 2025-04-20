/**
 * Тесты для сцены voiceAvatarWizard
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { voiceAvatarWizard } from '../../src/scenes/voiceAvatarWizard'
import makeMockContext from '../utils/mockTelegrafContext'

// Мокаем внешние зависимости
jest.mock('@/helpers/language', () => ({
  // @ts-ignore
  isRussian: jest.fn(() => true),
}))
jest.mock('@/core/supabase', () => ({
  // @ts-ignore
  getUserBalance: jest.fn(),
}))
jest.mock('@/price/helpers', () => ({
  // @ts-ignore
  sendInsufficientStarsMessage: jest.fn(),
  // @ts-ignore
  sendBalanceMessage: jest.fn(),
  voiceConversationCost: 5,
}))
jest.mock('@/menu', () => ({
  // @ts-ignore
  createHelpCancelKeyboard: jest.fn(() => ({ reply_markup: {} })),
}))
jest.mock('@/handlers', () => ({
  // @ts-ignore
  handleHelpCancel: jest.fn(() => false),
}))
jest.mock('@/services/generateVoiceAvatar', () => ({
  // @ts-ignore
  generateVoiceAvatar: jest.fn(),
}))

describe('voiceAvatarWizard - первый шаг', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('недостаточно средств: отправляет сообщение об ошибке и leave()', async () => {
    const ctx = makeMockContext()
    // @ts-ignore
    const balanceMock = jest.requireMock('@/core/supabase').getUserBalance
    balanceMock.mockResolvedValueOnce(2)
    // @ts-ignore
    const step0 = voiceAvatarWizard.steps[0]
    await step0(ctx)
    expect(
      jest.requireMock('@/price/helpers').sendInsufficientStarsMessage
    ).toHaveBeenCalledWith(ctx, 2, true)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('достаточно средств: отправляет баланс, просит голос и next()', async () => {
    const ctx = makeMockContext()
    ctx.from = { id: 10, language_code: 'ru' }
    // @ts-ignore
    const balanceMock = jest.requireMock('@/core/supabase').getUserBalance
    balanceMock.mockResolvedValueOnce(10)
    // @ts-ignore
    const step0 = voiceAvatarWizard.steps[0]
    await step0(ctx)
    expect(
      jest.requireMock('@/price/helpers').sendBalanceMessage
    ).toHaveBeenCalledWith(ctx, 10, 5, true)
    expect(ctx.reply).toHaveBeenCalledWith(
      '🎙️ Пожалуйста, отправьте голосовое сообщение для создания голосового аватара',
      expect.any(Object)
    )
    expect(ctx.wizard.next).toHaveBeenCalled()
  })
})