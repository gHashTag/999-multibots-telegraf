/**
 * Tests for trainFluxModelWizard
 */
import { trainFluxModelWizard } from '../../src/scenes/trainFluxModelWizard'
import makeMockContext from '../utils/mockTelegrafContext'

// Mock dependencies
jest.mock('@/helpers/language', () => ({ isRussian: jest.fn() }))
jest.mock('@/handlers/handleHelpCancel', () => ({ handleHelpCancel: jest.fn() }))

import { isRussian } from '@/helpers/language'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'

describe('trainFluxModelWizard', () => {
  let ctx
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
    ctx.session = {}
    ctx.from = { id: 111, username: 'Bob', language_code: 'en' }
  })

  it('step 0: valid message sets session and advances wizard', async () => {
    (isRussian as jest.Mock).mockReturnValueOnce(false)
    ctx.message = { text: '/trainFluxModelWizard 9876 Bob' }
    // @ts-ignore
    const step0 = trainFluxModelWizard.steps[0]
    await step0(ctx)
    expect(ctx.session.images).toEqual([])
    expect(ctx.session.modelName).toBe('bob')
    expect(ctx.session.targetUserId).toBe(9876)
    expect(ctx.session.username).toBe('Bob')
    expect(ctx.session.triggerWord).toBe('bob')
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Please send images'),
      expect.any(Object)
    )
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('step 0: missing username replies error and leaves', async () => {
    (isRussian as jest.Mock).mockReturnValueOnce(false)
    ctx.message = { text: '/trainFluxModelWizard 1234' }
    // @ts-ignore
    const step0 = trainFluxModelWizard.steps[0]
    await step0(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      '❌ You need to set a username in Telegram settings to train a model'
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step 1: /done with <10 images prompts count and does not leave', async () => {
    (isRussian as jest.Mock).mockReturnValueOnce(false)
    ctx.session.images = []
    ctx.message = { text: '/done' }
    // @ts-ignore
    const step1 = trainFluxModelWizard.steps[1]
    await step1(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      '📸 Minimum 10 images required. Current: 0'
    )
    expect(ctx.scene.enter).not.toHaveBeenCalled()
    expect(ctx.scene.leave).not.toHaveBeenCalled()
  })

  it('step 1: /done with >=10 images enters upload scene', async () => {
    (isRussian as jest.Mock).mockReturnValueOnce(false)
    ctx.session.images = Array(10).fill({})
    ctx.message = { text: '/done' }
    // @ts-ignore
    const step1 = trainFluxModelWizard.steps[1]
    await step1(ctx)
    expect(ctx.scene.enter).toHaveBeenCalledWith('uploadTrainFluxModelScene')
  })

  it('step 1: cancel leaves the scene', async () => {
    (isRussian as jest.Mock).mockReturnValueOnce(false)
    ;(handleHelpCancel as jest.Mock).mockResolvedValueOnce(true)
    ctx.message = { text: '/done' }
    // @ts-ignore
    const step1 = trainFluxModelWizard.steps[1]
    await step1(ctx)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })
})