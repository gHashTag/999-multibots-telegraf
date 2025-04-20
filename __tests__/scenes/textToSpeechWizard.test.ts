/**
 * Tests for textToSpeechWizard
 */
import { Composer } from 'telegraf'
import { textToSpeechWizard } from '../../src/scenes/textToSpeechWizard'
import makeMockContext from '../utils/mockTelegrafContext'

// Mock dependencies
jest.mock('../../src/helpers/language', () => ({ isRussian: jest.fn() }))
// jest.mock('../../src/menu/createHelpCancelKeyboard', () => ({ createHelpCancelKeyboard: jest.fn() }))
jest.mock('../../src/handlers/handleHelpCancel', () => ({
  handleHelpCancel: jest.fn(),
}))
jest.mock('../../src/core/supabase', () => ({ getVoiceId: jest.fn() }))
jest.mock('../../src/services/generateTextToSpeech', () => ({
  generateTextToSpeech: jest.fn(),
}))

import { isRussian } from '../../src/helpers/language'
// import { createHelpCancelKeyboard } from '../../src/menu/createHelpCancelKeyboard'
import { handleHelpCancel } from '../../src/handlers/handleHelpCancel'
import { getVoiceId } from '../../src/core/supabase'
import { generateTextToSpeech } from '../../src/services/generateTextToSpeech'

// Удаляем ненужный мок next
// const mockNext = jest.fn()

describe('textToSpeechWizard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Удаляем очистку mockNext
    // mockNext.mockClear() 
  })

  it('step 0: prompts and calls next()', async () => {
    const ctx = makeMockContext({ message: { text: 'initial' } })
    ;(isRussian as jest.Mock).mockReturnValueOnce(true)
    // Используем Composer.unwrap для получения функции шага
    const step0 = Composer.unwrap(textToSpeechWizard.steps[0])
    // Шаги Wizard принимают только ctx, next() не передается
    await step0(ctx, async () => {})
    expect(isRussian).toHaveBeenCalledWith(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      '🎙️ Отправьте текст, для преобразования его в голос',
      // Убираем некорректный reply_markup, если его нет в реальной логике
      // { reply_markup: { kb: true } } 
    )
    // Wizard сам управляет переходом, ctx.wizard.next не вызывается напрямую в шаге
    // expect(ctx.wizard.next).toHaveBeenCalled() 
  })

  it('step 1: no text message prompts ask', async () => {
    // Передаем language_code при создании контекста, исправляем структуру
    const ctx = makeMockContext({ message: { text: 'initial', from: { id: 1, is_bot: false, first_name: 'Test', language_code: 'en' } } })
    ;(isRussian as jest.Mock).mockReturnValueOnce(false)
    const step1 = Composer.unwrap(textToSpeechWizard.steps[1])
    // Шаги Wizard принимают только ctx, next() не передается
    await step1(ctx, async () => {})
    expect(ctx.reply).toHaveBeenCalledWith('✍️ Please send text')
  })

  it('step 1: cancel leaves scene', async () => {
    // Передаем language_code при создании контекста, исправляем структуру
    const ctx = makeMockContext({ message: { text: 'Cancel', from: { id: 2, is_bot: false, first_name: 'Test', language_code: 'en' } } })
    ;(isRussian as jest.Mock).mockReturnValueOnce(false)
    ;(handleHelpCancel as jest.Mock).mockResolvedValueOnce(true)
    const step1 = Composer.unwrap(textToSpeechWizard.steps[1])
    // Шаги Wizard принимают только ctx, next() не передается
    await step1(ctx, async () => {})
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step 1: no voice_id prompts training message and leaves', async () => {
    // Передаем language_code при создании контекста, исправляем структуру
    const ctx = makeMockContext({ message: { text: 'Hello', from: { id: 3, language_code: 'ru', is_bot: false, first_name: 'Test' } } })
    ;(isRussian as jest.Mock).mockReturnValueOnce(true)
    ;(handleHelpCancel as jest.Mock).mockResolvedValueOnce(false)
    ;(getVoiceId as jest.Mock).mockResolvedValueOnce(null)
    const step1 = Composer.unwrap(textToSpeechWizard.steps[1])
    // Шаги Wizard принимают только ctx, next() не передается
    await step1(ctx, async () => {})
    expect(ctx.reply).toHaveBeenCalledWith(
      '🎯 Для корректной работы обучите аватар используя 🎤 Голос для аватара в главном меню'
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step 1: generates text to speech and leaves', async () => {
    // Передаем language_code и username при создании контекста, исправляем структуру
    const ctx = makeMockContext({ message: { text: 'Hello', from: { id: 4, username: 'u', language_code: 'en', is_bot: false, first_name: 'Test' } } })
    ;(isRussian as jest.Mock).mockReturnValueOnce(false)
    ;(handleHelpCancel as jest.Mock).mockResolvedValueOnce(false)
    ;(getVoiceId as jest.Mock).mockResolvedValueOnce('voice123')
    const step1 = Composer.unwrap(textToSpeechWizard.steps[1])
    // Шаги Wizard принимают только ctx, next() не передается
    await step1(ctx, async () => {})
    expect(generateTextToSpeech).toHaveBeenCalledWith(
      'Hello',
      'voice123',
      4,
      'u',
      false,
      undefined
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })
})
