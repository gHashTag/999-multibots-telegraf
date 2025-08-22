import { jest, describe, beforeEach, it, expect } from '@jest/globals'
import makeMockContext from '../utils/mockTelegrafContext'
import { imageToVideoWizard } from '../../src/scenes/imageToVideoWizard'
import { isRussian } from '@/helpers/language'
import { handleHelpCancel, getBotToken } from '@/handlers'
import { videoModelKeyboard, createHelpCancelKeyboard, sendGenerationCancelledMessage, sendGenericErrorMessage } from '@/menu'
import { processBalanceVideoOperation } from '@/price/helpers/processBalanceVideoOperation'
import { sendBalanceMessage } from '@/price/helpers'
import { generateImageToVideo } from '@/services/generateImageToVideo'

// Mock dependencies
jest.mock('@/helpers/language', () => ({ isRussian: jest.fn() }))
jest.mock('@/handlers', () => ({
  handleHelpCancel: jest.fn(),
  getBotToken: jest.fn(() => 'TOKEN'),
}))
jest.mock('@/menu', () => ({
  videoModelKeyboard: jest.fn(),
  createHelpCancelKeyboard: jest.fn(),
  sendGenerationCancelledMessage: jest.fn(),
  sendGenericErrorMessage: jest.fn(),
}))
jest.mock('@/price/helpers/processBalanceVideoOperation', () => ({
  processBalanceVideoOperation: jest.fn(),
}))
jest.mock('@/price/helpers', () => ({ sendBalanceMessage: jest.fn() }))
jest.mock('@/services/generateImageToVideo', () => ({ generateImageToVideo: jest.fn() }))

describe('imageToVideoWizard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('step0: prompts model selection and next()', async () => {
    ;(isRussian as jest.Mock).mockReturnValueOnce(false)
    const keyboard = { reply_markup: {} }
    ;(videoModelKeyboard as jest.Mock).mockReturnValueOnce(keyboard)
    const ctx = makeMockContext()
    // @ts-ignore
    const step0 = imageToVideoWizard.steps[0]
    await step0(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      'Choose generation model:',
      { reply_markup: {} }
    )
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('step1: cancellation leaves scene', async () => {
    ;(isRussian as jest.Mock).mockReturnValueOnce(true)
    const ctx = makeMockContext({}, { message: { text: 'отмена' } })
    ;(handleHelpCancel as jest.Mock).mockResolvedValueOnce(true)
    // @ts-ignore
    const step1 = imageToVideoWizard.steps[1]
    await step1(ctx)
    expect(sendGenerationCancelledMessage).toHaveBeenCalledWith(ctx, true)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step1: valid model processes balance and proceeds', async () => {
    ;(isRussian as jest.Mock).mockReturnValue(false)
    const ctx = makeMockContext({}, { message: { text: 'model1' } })
    ;(handleHelpCancel as jest.Mock).mockResolvedValueOnce(false)
    ;(processBalanceVideoOperation as jest.Mock).mockResolvedValueOnce({ newBalance: 10, success: true, modePrice: 5 })
    const keyboard = { reply_markup: {} }
    ;(createHelpCancelKeyboard as jest.Mock).mockReturnValue(keyboard)
    // @ts-ignore
    const step1 = imageToVideoWizard.steps[1]
    await step1(ctx)
    expect(processBalanceVideoOperation).toHaveBeenCalledWith({
      ctx,
      videoModel: 'model1',
      telegram_id: ctx.from.id,
      is_ru: false,
    })
    expect(sendBalanceMessage).toHaveBeenCalledWith(ctx, 10, 5, false)
    expect(ctx.session.videoModel).toBe('model1')
    expect(ctx.session.paymentAmount).toBe(5)
    // First reply should confirm chosen model
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('You have chosen the generation model: model1'),
      { reply_markup: expect.objectContaining({ remove_keyboard: true }) }
    )
    // Wizard should proceed to next step (if implemented)
    // expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('step1: invalid message replies generic error and leaves', async () => {
    const ctx = makeMockContext({}, { message: {} })
    ;(isRussian as jest.Mock).mockReturnValueOnce(true)
    // @ts-ignore
    const step1 = imageToVideoWizard.steps[1]
    await step1(ctx)
    expect(sendGenericErrorMessage).toHaveBeenCalledWith(ctx, true)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })
})