/**
 * Tests for textToSpeechWizard
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import { Composer } from 'telegraf'
import { textToSpeechWizard } from '../../src/scenes/textToSpeechWizard'
import makeMockContext from '../utils/mockTelegrafContext'

// Import original modules for spyOn
import * as languageHelper from '../../src/helpers/language'
import * as helpCancelHandler from '../../src/handlers/handleHelpCancel'
import * as supabaseCore from '../../src/core/supabase'
import * as ttsService from '../../src/services/generateTextToSpeech'

// Remove module-level mocks
// jest.mock('../../src/helpers/language', () => ({ isRussian: jest.fn() }))
// jest.mock('../../src/handlers/handleHelpCancel', () => ({ handleHelpCancel: jest.fn() }))
// jest.mock('../../src/core/supabase', () => ({ getVoiceId: jest.fn() }))
// jest.mock('../../src/services/generateTextToSpeech', () => ({ generateTextToSpeech: jest.fn() }))

describe('textToSpeechWizard', () => {
  beforeEach(() => {
    jest.restoreAllMocks() // Use restoreAllMocks with spyOn
  })

  it('step 0: prompts and calls next()', async () => {
    const ctx = makeMockContext({ message: { text: 'initial' } })
    // Use spyOn instead of module mock
    const isRussianSpy = jest.spyOn(languageHelper, 'isRussian').mockReturnValueOnce(true)
    const step0 = Composer.unwrap(textToSpeechWizard.steps[0])
    await step0(ctx, async () => {})
    expect(isRussianSpy).toHaveBeenCalledWith(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      '🎙️ Отправьте текст, для преобразования его в голос'
    )
  })

  it('step 1: no text message prompts ask', async () => {
    const ctx = makeMockContext({ message: { text: 'initial', from: { id: 1, is_bot: false, first_name: 'Test', language_code: 'en' } } })
    // Use spyOn
    const isRussianSpy = jest.spyOn(languageHelper, 'isRussian').mockReturnValueOnce(false)
    const step1 = Composer.unwrap(textToSpeechWizard.steps[1])
    await step1(ctx, async () => {})
    expect(isRussianSpy).toHaveBeenCalledWith(ctx)
    expect(ctx.reply).toHaveBeenCalledWith('✍️ Please send text')
  })

  it('step 1: cancel leaves scene', async () => {
    const ctx = makeMockContext({ message: { text: 'Cancel', from: { id: 2, is_bot: false, first_name: 'Test', language_code: 'en' } } })
    // Use spyOn
    const isRussianSpy = jest.spyOn(languageHelper, 'isRussian').mockReturnValueOnce(false)
    const handleHelpCancelSpy = jest.spyOn(helpCancelHandler, 'handleHelpCancel').mockResolvedValueOnce(true)
    const step1 = Composer.unwrap(textToSpeechWizard.steps[1])
    await step1(ctx, async () => {})
    expect(isRussianSpy).toHaveBeenCalledWith(ctx)
    expect(handleHelpCancelSpy).toHaveBeenCalledWith(ctx)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step 1: no voice_id prompts training message and leaves', async () => {
    const ctx = makeMockContext({ message: { text: 'Hello', from: { id: 3, language_code: 'ru', is_bot: false, first_name: 'Test' } } })
    // Use spyOn
    const isRussianSpy = jest.spyOn(languageHelper, 'isRussian').mockReturnValueOnce(true)
    const handleHelpCancelSpy = jest.spyOn(helpCancelHandler, 'handleHelpCancel').mockResolvedValueOnce(false)
    const getVoiceIdSpy = jest.spyOn(supabaseCore, 'getVoiceId').mockResolvedValueOnce(undefined) // Use undefined as per function signature

    const step1 = Composer.unwrap(textToSpeechWizard.steps[1])
    await step1(ctx, async () => {})

    expect(isRussianSpy).toHaveBeenCalledWith(ctx)
    expect(handleHelpCancelSpy).toHaveBeenCalledWith(ctx)
    expect(getVoiceIdSpy).toHaveBeenCalledWith('3') // Assuming ctx.from.id is used
    expect(ctx.reply).toHaveBeenCalledWith(
      '🎯 Для корректной работы обучите аватар используя 🎤 Голос для аватара в главном меню'
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step 1: generates text to speech and leaves', async () => {
    const ctx = makeMockContext({ message: { text: 'Hello', from: { id: 4, username: 'u', language_code: 'en', is_bot: false, first_name: 'Test' } } })
    // Use spyOn
    const isRussianSpy = jest.spyOn(languageHelper, 'isRussian').mockReturnValueOnce(false)
    const handleHelpCancelSpy = jest.spyOn(helpCancelHandler, 'handleHelpCancel').mockResolvedValueOnce(false)
    const getVoiceIdSpy = jest.spyOn(supabaseCore, 'getVoiceId').mockResolvedValueOnce('voice123')
    const generateTextToSpeechSpy = jest.spyOn(ttsService, 'generateTextToSpeech').mockResolvedValueOnce(undefined) // Assuming it returns Promise<void> or similar

    const step1 = Composer.unwrap(textToSpeechWizard.steps[1])
    await step1(ctx, async () => {})

    expect(isRussianSpy).toHaveBeenCalledWith(ctx)
    expect(handleHelpCancelSpy).toHaveBeenCalledWith(ctx)
    expect(getVoiceIdSpy).toHaveBeenCalledWith('4')
    expect(generateTextToSpeechSpy).toHaveBeenCalledWith(
      'Hello',
      'voice123',
      4,
      'u',
      false, // isRu
      undefined // bot_name
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })
})
