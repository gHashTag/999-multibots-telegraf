/**
 * Tests for digitalAvatarBodyWizard
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { digitalAvatarBodyWizard } from '../../src/scenes/digitalAvatarBodyWizard'
import makeMockContext from '../utils/mockTelegrafContext'

// Mock dependencies
jest.mock('../../src/menu/getStepSelectionMenu', () => ({ getStepSelectionMenu: jest.fn() }))
jest.mock('@/helpers/language', () => ({ isRussian: jest.fn() }))
jest.mock('@/price/priceCalculator', () => ({
  calculateCost: jest.fn(),
  generateCostMessage: jest.fn(),
  stepOptions: [1, 2],
}))
jest.mock('@/price/helpers', () => ({ handleTrainingCost: jest.fn() }))
jest.mock('../../src/handlers/handleHelpCancel', () => ({ handleHelpCancel: jest.fn() }))

import { getStepSelectionMenu } from '../../src/menu/getStepSelectionMenu'
import { isRussian } from '@/helpers/language'
import { calculateCost, generateCostMessage } from '@/price/priceCalculator'
import { handleTrainingCost } from '@/price/helpers'
import { handleHelpCancel } from '../../src/handlers/handleHelpCancel'

describe.skip('digitalAvatarBodyWizard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('step 0: sends cost message and calls next()', async () => {
    const ctx = makeMockContext()
    (isRussian as jest.Mock).mockReturnValue(true)
    (calculateCost as jest.Mock).mockReturnValueOnce(10).mockReturnValueOnce(20)
    (generateCostMessage as jest.Mock).mockReturnValue('COST MSG')
    (getStepSelectionMenu as jest.Mock).mockReturnValue({ keyboard: [['X']] })

    // @ts-ignore
    const step0 = digitalAvatarBodyWizard.steps[0]
    await step0(ctx)

    expect(calculateCost).toHaveBeenCalledTimes(2)
    expect(generateCostMessage).toHaveBeenCalledWith([10, 20], true)
    expect(ctx.reply).toHaveBeenCalledWith('COST MSG', { keyboard: [['X']] })
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('step 1: leaveScene true -> leaves scene', async () => {
    const ctx = makeMockContext({}, { message: { text: '3' } })
    (isRussian as jest.Mock).mockReturnValue(false)
    ;(handleTrainingCost as jest.Mock).mockResolvedValue({ leaveScene: true, trainingCostInStars: 0, currentBalance: 0 })

    // @ts-ignore
    const step1 = digitalAvatarBodyWizard.steps[1]
    await step1(ctx)

    expect(handleTrainingCost).toHaveBeenCalledWith(ctx, 3, false)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step 1: leaveScene false -> replies and enters next scene', async () => {
    const ctx = makeMockContext({}, { message: { text: '5' } })
    (isRussian as jest.Mock).mockReturnValue(true)
    ;(handleTrainingCost as jest.Mock).mockResolvedValue({ leaveScene: false, trainingCostInStars: 5, currentBalance: 42 })

    // @ts-ignore
    const step1 = digitalAvatarBodyWizard.steps[1]
    await step1(ctx)

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Стоимостью 5'),
      expect.any(Object)
    )
    expect(ctx.scene.enter).toHaveBeenCalledWith('trainFluxModelWizard')
  })
})