/**
 * Tests for textToSpeechWizard
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals'
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

describe('textToSpeechWizard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('step 0: prompts and calls next()', async () => {
    const ctx = makeMockContext()
    ;(isRussian as jest.Mock).mockReturnValueOnce(true)
    // @ts-ignore
    const step0 = textToSpeechWizard.steps[0]
    await step0(ctx)
    expect(isRussian).toHaveBeenCalledWith(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      '🎙️ Отправьте текст, для преобразования его в голос',
      { reply_markup: { kb: true } }
    )
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('step 1: no text message prompts ask', async () => {
    const ctx = makeMockContext()
    ctx.from.language_code = 'en'
    ;(isRussian as jest.Mock).mockReturnValueOnce(false)
    // @ts-ignore
    const step1 = textToSpeechWizard.steps[1]
    await step1(ctx)
    expect(ctx.reply).toHaveBeenCalledWith('✍️ Please send text')
  })

  it('step 1: cancel leaves scene', async () => {
    const ctx = makeMockContext({}, { message: { text: 'Cancel' } })
    ;(isRussian as jest.Mock).mockReturnValueOnce(false)
    ;(handleHelpCancel as jest.Mock).mockResolvedValueOnce(true)
    // @ts-ignore
    const step1 = textToSpeechWizard.steps[1]
    await step1(ctx)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step 1: no voice_id prompts training message and leaves', async () => {
    const ctx = makeMockContext({}, { message: { text: 'Hello' } })
    ctx.from = { id: 3, language_code: 'ru' }
    ;(isRussian as jest.Mock).mockReturnValueOnce(true)
    ;(handleHelpCancel as jest.Mock).mockResolvedValueOnce(false)
    ;(getVoiceId as jest.Mock).mockResolvedValueOnce(null)
    // @ts-ignore
    const step1 = textToSpeechWizard.steps[1]
    await step1(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      '🎯 Для корректной работы обучите аватар используя 🎤 Голос для аватара в главном меню'
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step 1: generates text to speech and leaves', async () => {
    const ctx = makeMockContext({}, { message: { text: 'Hello' } })
    ctx.from = { id: 4, username: 'u', language_code: 'en' }
    ;(isRussian as jest.Mock).mockReturnValueOnce(false)
    ;(handleHelpCancel as jest.Mock).mockResolvedValueOnce(false)
    ;(getVoiceId as jest.Mock).mockResolvedValueOnce('voice123')
    // @ts-ignore
    const step1 = textToSpeechWizard.steps[1]
    await step1(ctx)
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
