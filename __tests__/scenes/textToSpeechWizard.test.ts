import { Composer } from 'telegraf'
import textToSpeechWizard from '@/scenes/textToSpeechWizard'
import { isRussian } from '@/helpers/language'
import { getVoiceId } from '@/core/supabase'
import { generateTextToSpeech } from '@/services/generateTextToSpeech'
import { createHelpCancelKeyboard } from '@/menu'
import { handleHelpCancel } from '@/handlers'
import { MiddlewareFn } from 'telegraf'
import { ModeEnum } from '@/enums/mode'
import { processServiceBalanceOperation } from '@/services/processServiceBalanceOperation'
import { logger } from '@/utils/logger'

jest.mock('@/helpers/language', () => ({ isRussian: jest.fn() }))
jest.mock('@/core/supabase', () => ({ getVoiceId: jest.fn() }))
jest.mock('@/services/generateTextToSpeech', () => ({
  generateTextToSpeech: jest.fn(),
}))
jest.mock('@/menu', () => ({ createHelpCancelKeyboard: jest.fn() }))
jest.mock('@/handlers', () => ({ handleHelpCancel: jest.fn() }))
jest.mock('@/services/processServiceBalanceOperation', () => ({
  processServiceBalanceOperation: jest.fn(),
}))
jest.mock('@/utils/logger', () => ({
  logger: {
    error: jest.fn(),
  },
}))

describe('textToSpeechWizard', () => {
  let mockCtx: MyWizardContext
  let next: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    mockCtx = makeMockWizardContext() as MyWizardContext
    next = jest.fn()
  })

  // Step 1: Enter handler
  it('step 1: should prompt for text', async () => {
    const step1Handler = textToSpeechWizard
      .steps[0] as MiddlewareFn<MyWizardContext>
    await step1Handler(mockCtx, next)

    expect(mockCtx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Введите текст для озвучки')
    )
    expect(mockCtx.wizard.next).toHaveBeenCalledTimes(1)
  })

  // Step 2: Text handler & Processing
  it('step 2: should process text, generate speech, and send audio', async () => {
    // Simulate receiving text
    mockCtx.message = { ...mockCtx.message, text: 'Привет, мир!' }
    mockCtx.updateType = 'message'

    // Mock helper functions
    mockedGenerateTextToSpeech.mockResolvedValue('http://audio.url/result.mp3')
    mockedProcessServiceBalanceOperation.mockResolvedValue(true)

    const step2Handler = textToSpeechWizard
      .steps[1] as MiddlewareFn<MyWizardContext>
    await step2Handler(mockCtx, next)

    // Check balance operation
    expect(mockedProcessServiceBalanceOperation).toHaveBeenCalledWith(
      mockCtx,
      ModeEnum.TextToSpeech
    )

    // Check speech generation
    expect(mockedGenerateTextToSpeech).toHaveBeenCalledWith(
      'Привет, мир!',
      expect.any(String) // Assuming voiceId is fetched or default
    )

    // Check reply with audio
    expect(mockCtx.replyWithAudio).toHaveBeenCalledWith(
      'http://audio.url/result.mp3'
    )

    // Check scene leave
    expect(mockCtx.scene.leave).toHaveBeenCalledTimes(1)
  })

  it('step 2: should handle balance check failure', async () => {
    // Simulate receiving text
    mockCtx.message = { ...mockCtx.message, text: 'Недостаточно средств' }
    mockCtx.updateType = 'message'

    // Mock balance failure
    mockedProcessServiceBalanceOperation.mockResolvedValue(false)

    const step2Handler = textToSpeechWizard
      .steps[1] as MiddlewareFn<MyWizardContext>
    await step2Handler(mockCtx, next)

    expect(mockedProcessServiceBalanceOperation).toHaveBeenCalledTimes(1)
    expect(mockedGenerateTextToSpeech).not.toHaveBeenCalled()
    expect(mockCtx.replyWithAudio).not.toHaveBeenCalled()
    expect(mockCtx.scene.leave).toHaveBeenCalledTimes(1) // Should leave after balance failure
  })

  it('step 2: should handle generation failure', async () => {
    // Simulate receiving text
    mockCtx.message = { ...mockCtx.message, text: 'Ошибка генерации' }
    mockCtx.updateType = 'message'

    // Mock successful balance, failed generation
    mockedProcessServiceBalanceOperation.mockResolvedValue(true)
    mockedGenerateTextToSpeech.mockRejectedValue(
      new Error('Generation API failed')
    )
    const loggerSpy = jest.spyOn(logger, 'error').mockImplementation(() => {})

    const step2Handler = textToSpeechWizard
      .steps[1] as MiddlewareFn<MyWizardContext>
    await step2Handler(mockCtx, next)

    expect(mockedProcessServiceBalanceOperation).toHaveBeenCalledTimes(1)
    expect(mockedGenerateTextToSpeech).toHaveBeenCalledTimes(1)
    expect(mockCtx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Ошибка при генерации аудио')
    )
    expect(mockCtx.scene.leave).toHaveBeenCalledTimes(1)
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining('Ошибка в textToSpeechWizard'),
      expect.any(Error)
    )
    loggerSpy.mockRestore()
  })

  it('step 2: should reject non-text message', async () => {
    // Simulate receiving a photo
    mockCtx.message = { ...mockCtx.message, photo: [{ file_id: 'photo_id' }] }
    mockCtx.updateType = 'message'

    const step2Handler = textToSpeechWizard
      .steps[1] as MiddlewareFn<MyWizardContext>
    await step2Handler(mockCtx, next)

    expect(mockCtx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Пожалуйста, введите текст')
    )
    expect(mockedProcessServiceBalanceOperation).not.toHaveBeenCalled()
    expect(mockedGenerateTextToSpeech).not.toHaveBeenCalled()
    expect(mockCtx.scene.leave).not.toHaveBeenCalled() // Stay in step 2
  })
})
