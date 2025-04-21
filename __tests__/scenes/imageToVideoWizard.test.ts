import makeMockContext from '../utils/mockTelegrafContext'
import { imageToVideoWizard } from '../../src/scenes/imageToVideoWizard'
import { isRussian } from '@/helpers/language'
import { handleHelpCancel, getBotToken } from '@/handlers'
import {
  videoModelKeyboard,
  createHelpCancelKeyboard,
  sendGenerationCancelledMessage,
  sendGenericErrorMessage,
} from '@/menu'
import {
  processBalanceVideoOperation,
  ProcessBalanceResult,
} from '@/price/helpers/processBalanceVideoOperation'
import { sendBalanceMessage } from '@/price/helpers'
import { generateImageToVideo } from '@/services/generateImageToVideo'
import { Composer } from 'telegraf'
import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { MySession } from '@/interfaces'

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
jest.mock('@/services/generateImageToVideo', () => ({
  generateImageToVideo: jest.fn(),
}))

// Типизируем моки
const mockedIsRussian = isRussian as jest.Mock<() => boolean>
const mockedHandleHelpCancel = handleHelpCancel as jest.Mock<
  (...args: any[]) => Promise<boolean>
>
const mockedProcessBalance = processBalanceVideoOperation as jest.Mock<
  (...args: any[]) => Promise<ProcessBalanceResult>
>
const mockedVideoModelKeyboard = videoModelKeyboard as jest.Mock
const mockedCreateHelpCancelKeyboard = createHelpCancelKeyboard as jest.Mock
const mockedSendGenCancelled = sendGenerationCancelledMessage as jest.Mock
const mockedSendGenericError = sendGenericErrorMessage as jest.Mock
const mockedSendBalanceMessage = sendBalanceMessage as jest.Mock

describe('imageToVideoWizard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  const steps = Composer.unwrap(imageToVideoWizard.middleware())
  const step0 = steps[0]
  const step1 = steps[1]
  const mockNext = (): Promise<void> => Promise.resolve()

  it('step0: prompts model selection and next()', async () => {
    mockedIsRussian.mockReturnValueOnce(false)
    const keyboard = { reply_markup: {} }
    mockedVideoModelKeyboard.mockReturnValueOnce(keyboard)
    const ctx = makeMockContext()
    await step0(ctx, mockNext)
    expect(ctx.reply).toHaveBeenCalledWith('Choose generation model:', {
      reply_markup: {},
    })
  })

  it('step1: cancellation leaves scene', async () => {
    mockedIsRussian.mockReturnValueOnce(true)
    const ctx = makeMockContext({ message: { text: 'отмена' } })
    mockedHandleHelpCancel.mockResolvedValueOnce(true)
    await step1(ctx, mockNext)
    expect(mockedSendGenCancelled).toHaveBeenCalledWith(ctx, true)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step1: valid model processes balance and proceeds', async () => {
    mockedIsRussian.mockReturnValue(false)
    const ctx = makeMockContext({ message: { text: 'model1' } })
    const sessionData: Partial<MySession> = {}
    ctx.session = sessionData as MySession

    mockedHandleHelpCancel.mockResolvedValueOnce(false)
    mockedProcessBalance.mockResolvedValueOnce({
      newBalance: 10,
      success: true,
      modePrice: 5,
    })
    const keyboard = { reply_markup: {} }
    mockedCreateHelpCancelKeyboard.mockReturnValue(keyboard)
    await step1(ctx, mockNext)
    expect(mockedProcessBalance).toHaveBeenCalledWith({
      ctx,
      videoModel: 'model1',
      telegram_id: ctx.from.id,
      is_ru: false,
    })
    expect(mockedSendBalanceMessage).toHaveBeenCalledWith(ctx, 10, 5, false)
    expect(ctx.session.videoModel).toBe('model1')
    expect(ctx.session.paymentAmount).toBe(5)
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('You have chosen the generation model: model1'),
      { reply_markup: expect.objectContaining({ remove_keyboard: true }) }
    )
  })

  it('step1: invalid message replies generic error and leaves', async () => {
    const ctx = makeMockContext({ message: { text: 'invalid' } })
    mockedIsRussian.mockReturnValueOnce(true)
    mockedHandleHelpCancel.mockResolvedValueOnce(false)
    await step1(ctx, mockNext)
    expect(mockedSendGenericError).toHaveBeenCalledWith(ctx, true)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })
})
