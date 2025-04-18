import { jest, describe, beforeEach, it, expect } from '@jest/globals'
import makeMockContext from '../utils/mockTelegrafContext'
import { textToImageWizard } from '../../src/scenes/textToImageWizard'
import { isRussian } from '@/helpers/language'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { createHelpCancelKeyboard } from '@/menu'

// Mock dependencies
jest.mock('@/helpers/language', () => ({ isRussian: jest.fn() }))
jest.mock('@/handlers/handleHelpCancel', () => ({ handleHelpCancel: jest.fn() }))
jest.mock('@/menu', () => ({ createHelpCancelKeyboard: jest.fn(() => ({ reply_markup: {} })) }))

describe('textToImageWizard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('step0: sends model selection prompt and calls next()', async () => {
    ;(isRussian as jest.Mock).mockReturnValueOnce(false)
    ;(handleHelpCancel as jest.Mock).mockResolvedValueOnce(false)
    const ctx = makeMockContext()
    // @ts-ignore
    const step0 = textToImageWizard.steps[0]
    await step0(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      '🎨 Choose a model for generation:',
      { reply_markup: expect.any(Object) }
    )
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('step0: leaves scene if cancelled', async () => {
    ;(handleHelpCancel as jest.Mock).mockResolvedValueOnce(true)
    const ctx = makeMockContext()
    // @ts-ignore
    const step0 = textToImageWizard.steps[0]
    await step0(ctx)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })
})