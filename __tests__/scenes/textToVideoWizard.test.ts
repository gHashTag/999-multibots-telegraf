/**
 * Tests for textToVideoWizard
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { textToVideoWizard } from '../../src/scenes/textToVideoWizard'
import makeMockContext from '../utils/mockTelegrafContext'

// Mock dependencies
jest.mock('@/helpers/language', () => ({ isRussian: jest.fn() }))
jest.mock('@/menu', () => ({ videoModelKeyboard: jest.fn(), sendGenericErrorMessage: jest.fn() }))
jest.mock('@/core/supabase', () => ({ getUserBalance: jest.fn() }))
jest.mock('@/price/helpers', () => ({
  validateAndCalculateVideoModelPrice: jest.fn(),
  sendBalanceMessage: jest.fn(),
}))
jest.mock('@/services/generateTextToVideo', () => ({ generateTextToVideo: jest.fn() }))
jest.mock('@/handlers', () => ({ handleHelpCancel: jest.fn() }))

import { isRussian } from '@/helpers/language'
import { videoModelKeyboard, sendGenericErrorMessage } from '@/menu'
import { getUserBalance } from '@/core/supabase'
import { validateAndCalculateVideoModelPrice, sendBalanceMessage } from '@/price/helpers'
import { generateTextToVideo } from '@/services/generateTextToVideo'
import { handleHelpCancel } from '@/handlers'

describe('textToVideoWizard', () => {
  let ctx: ReturnType<typeof makeMockContext>
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
    ctx.from = { id: 7, username: 'user', language_code: 'ru' }
    ctx.telegram.token = 'TOKEN'
  })

  it('step0: prompts model selection and calls next()', async () => {
    ;(isRussian as jest.Mock).mockReturnValueOnce(true)
    const kb = { reply_markup: { keys: [1] } }
    ;(videoModelKeyboard as jest.Mock).mockReturnValueOnce(kb)
    // @ts-ignore
    const step0 = textToVideoWizard.steps[0]
    await step0(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      'Выберите модель для генерации:',
      { reply_markup: kb.reply_markup }
    )
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('step0: handles exception and leaves scene', async () => {
    ;(isRussian as jest.Mock).mockReturnValueOnce(false)
    ;(videoModelKeyboard as jest.Mock).mockImplementationOnce(() => { throw new Error('fail') })
    // @ts-ignore
    const step0 = textToVideoWizard.steps[0]
    await step0(ctx)
    expect(ctx.reply).toHaveBeenCalledWith('❌ An error occurred: fail')
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step1: no text throws error', async () => {
    ctx.message = { }
    // @ts-ignore
    const step1 = textToVideoWizard.steps[1]
    await expect(step1(ctx)).rejects.toThrow('Could not identify model')
  })

  it('step1: cancel leaves scene', async () => {
    ctx.message = { text: 'cancel' }
    ;(isRussian as jest.Mock).mockReturnValueOnce(false)
    ;(handleHelpCancel as jest.Mock).mockResolvedValueOnce(true)
    ;(videoModelKeyboard as jest.Mock).mockClear()
    ;(validateAndCalculateVideoModelPrice as jest.Mock).mockClear()
    ;(sendBalanceMessage as jest.Mock).mockClear()
    ;(getUserBalance as jest.Mock).mockClear()
    // @ts-ignore
    const step1 = textToVideoWizard.steps[1]
    await step1(ctx)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step1: insufficient funds leaves scene', async () => {
    ctx.message = { text: 'modelx' }
    ;(isRussian as jest.Mock).mockReturnValueOnce(true)
    ;(handleHelpCancel as jest.Mock).mockResolvedValueOnce(false)
    ;(getUserBalance as jest.Mock).mockResolvedValueOnce(10)
    ;(validateAndCalculateVideoModelPrice as jest.Mock).mockResolvedValueOnce(null)
    // @ts-ignore
    const step1 = textToVideoWizard.steps[1]
    await step1(ctx)
    expect(validateAndCalculateVideoModelPrice).toHaveBeenCalled()
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step1: valid selection sends balance and next', async () => {
    ctx.message = { text: 'modelx' }
    ;(isRussian as jest.Mock).mockReturnValueOnce(false)
    ;(handleHelpCancel as jest.Mock).mockResolvedValueOnce(false)
    ;(getUserBalance as jest.Mock).mockResolvedValueOnce(100)
    ;(validateAndCalculateVideoModelPrice as jest.Mock).mockResolvedValueOnce(20)
    // @ts-ignore
    const step1 = textToVideoWizard.steps[1]
    await step1(ctx)
    expect(sendBalanceMessage).toHaveBeenCalledWith(ctx, 100, 20, false)
    expect(ctx.reply).toHaveBeenCalledWith('Please send a text description', expect.any(Object))
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('step2: processes prompt and generates video then leave', async () => {
    ctx.session.videoModel = 'm1'
    ctx.message = { text: 'hello' }
    ;(isRussian as jest.Mock).mockReturnValueOnce(true)
    ;(generateTextToVideo as jest.Mock).mockResolvedValueOnce(undefined)
    // @ts-ignore
    const step2 = textToVideoWizard.steps[2]
    await step2(ctx)
    expect(generateTextToVideo).toHaveBeenCalledWith(
      'hello', 'm1', '7', 'user', true
    )
    expect(ctx.session.prompt).toBe('hello')
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step2: no text sends error and leaves', async () => {
    ctx.session.videoModel = 'm1'
    ctx.message = {}
    ;(isRussian as jest.Mock).mockReturnValueOnce(false)
    // @ts-ignore
    const step2 = textToVideoWizard.steps[2]
    await step2(ctx)
    expect(sendGenericErrorMessage).toHaveBeenCalledWith(ctx, false)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })
})