import makeMockContext from '../utils/mockTelegrafContext'

jest.mock('@/helpers/language', () => ({ isRussian: jest.fn() }))
jest.mock('@/menu/getStepSelectionMenu', () => ({ getStepSelectionMenu: jest.fn() }))
jest.mock('@/price/helpers', () => ({ handleTrainingCost: jest.fn() }))
jest.mock('@/price/priceCalculator', () => ({ generateCostMessage: jest.fn(), stepOptions: [1,2,3], calculateCost: jest.fn() }))
jest.mock('@/handlers/handleHelpCancel', () => ({ handleHelpCancel: jest.fn() }))

const { isRussian } = require('@/helpers/language')
const { getStepSelectionMenu } = require('@/menu/getStepSelectionMenu')
const { generateCostMessage, calculateCost, stepOptions } = require('@/price/priceCalculator')
const { handleTrainingCost } = require('@/price/helpers')
const { handleHelpCancel } = require('@/handlers/handleHelpCancel')
const { digitalAvatarBodyWizard } = require('@/scenes/digitalAvatarBodyWizard')
const steps = digitalAvatarBodyWizard.steps

describe('digitalAvatarBodyWizard', () => {
  let ctx
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
  })

  test('step 0: sends cost message and next', async () => {
    isRussian.mockReturnValue(true)
    calculateCost.mockReturnValueOnce(10).mockReturnValueOnce(20).mockReturnValueOnce(30)
    generateCostMessage.mockReturnValue('cost msg')
    getStepSelectionMenu.mockReturnValue({ keyboard: [] })
    await steps[0](ctx)
    expect(generateCostMessage).toHaveBeenCalledWith([10,20,30], true)
    expect(ctx.reply).toHaveBeenCalledWith('cost msg', {keyboard: []})
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  test('step 1: numeric input, leaveScene=false', async () => {
    isRussian.mockReturnValue(false)
    handleTrainingCost.mockResolvedValue({ leaveScene: false, trainingCostInStars: 5, currentBalance: 100 })
    ctx.message = { text: '2' }
    await steps[1](ctx)
    expect(ctx.session.steps).toBe(2)
    expect(ctx.reply).toHaveBeenCalledWith(
      '✅ You selected 2 steps costing 5⭐️ stars\n\nYour balance: 100 ⭐️',
      expect.any(Object)
    )
    expect(ctx.scene.enter).toHaveBeenCalledWith('trainFluxModelWizard')
  })

  test('step 1: numeric input, leaveScene=true', async () => {
    isRussian.mockReturnValue(true)
    handleTrainingCost.mockResolvedValue({ leaveScene: true })
    ctx.message = { text: '3' }
    await steps[1](ctx)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  test('step 1: non-numeric input and cancel', async () => {
    handleHelpCancel.mockResolvedValue(true)
    ctx.message = { text: 'abc' }
    await steps[1](ctx)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  test('step 1: non-numeric input and not cancel', async () => {
    isRussian.mockReturnValue(true)
    handleHelpCancel.mockResolvedValue(false)
    ctx.message = { text: 'abc' }
    await steps[1](ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      '🔢 Пожалуйста, выберите количество шагов для продолжения обучения модели.'
    )
  })
})
