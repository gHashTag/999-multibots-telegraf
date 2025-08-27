/**
 * Тесты для сцены цифрового тела аватара V2 (digitalAvatarBodyWizardV2)
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { digitalAvatarBodyWizardV2 } from '../../src/scenes/digitalAvatarBodyWizardV2'
import makeMockContext from '../utils/mockTelegrafContext'
/* eslint-disable @typescript-eslint/ban-ts-comment */

// Мокаем внешние зависимости
jest.mock('../../src/helpers/language', () => ({
  // @ts-ignore
  isRussian: jest.fn(),
}))
jest.mock('../../src/price/helpers', () => ({
  // @ts-ignore
  handleTrainingCost: jest.fn(),
}))
jest.mock('../../src/price/priceCalculator', () => ({
  // @ts-ignore
  calculateCost: jest.fn(),
  // @ts-ignore
  generateCostMessage: jest.fn(),
  // @ts-ignore
  stepOptions: [1, 2, 3],
}))
jest.mock('../../src/menu', () => ({
  // @ts-ignore
  getStepSelectionMenuV2: jest.fn(),
}))
jest.mock('../../src/handlers/handleHelpCancel', () => ({
  // @ts-ignore
  handleHelpCancel: jest.fn(),
}))

describe('digitalAvatarBodyWizardV2', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('первый шаг: отправляет сообщение со стоимостью и вызывает next()', async () => {
    const ctx = makeMockContext()
    // @ts-ignore: requireMock returns unknown
    const isRu = (jest.requireMock('../../src/helpers/language') as any)
      .isRussian
    // @ts-ignore: requireMock returns unknown
    const calc = (jest.requireMock('../../src/price/priceCalculator') as any)
      .calculateCost
    // @ts-ignore: requireMock returns unknown
    const genMsg = (jest.requireMock('../../src/price/priceCalculator') as any)
      .generateCostMessage
    // @ts-ignore: requireMock returns unknown
    const stepsOpt = (
      jest.requireMock('../../src/price/priceCalculator') as any
    ).stepOptions
    // @ts-ignore: requireMock returns unknown
    const menu = (jest.requireMock('../../src/menu') as any)
      .getStepSelectionMenuV2
    // Настраиваем моки
    isRu.mockReturnValueOnce(true)
    calc.mockReturnValue(5)
    genMsg.mockReturnValue('MSGV2')
    menu.mockReturnValue({ reply_markup: { keyboard: [['step']] } })
    // @ts-ignore
    const step0 = digitalAvatarBodyWizardV2.steps[0]
    await step0(ctx)
    // Проверяем вызовы
    expect(calc).toHaveBeenCalledTimes(stepsOpt.length)
    expect(genMsg).toHaveBeenCalledWith([5, 5, 5], true)
    expect(ctx.reply).toHaveBeenCalledWith('MSGV2', {
      reply_markup: { keyboard: [['step']] },
    })
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('второй шаг: при валидном вводе шагов переходит в trainFluxModelWizard', async () => {
    // @ts-ignore: override readonly properties for test
    const ctx = makeMockContext({}, { session: {}, message: { text: '2' } })
    // @ts-ignore: requireMock returns unknown
    const isRu = (jest.requireMock('../../src/helpers/language') as any)
      .isRussian
    // @ts-ignore: requireMock returns unknown
    const costHelper = (jest.requireMock('../../src/price/helpers') as any)
      .handleTrainingCost
    isRu.mockReturnValue(false)
    costHelper.mockResolvedValue({
      leaveScene: false,
      trainingCostInStars: 7,
      currentBalance: 42,
    })
    // @ts-ignore
    const step1 = digitalAvatarBodyWizardV2.steps[1]
    await step1(ctx)
    expect(ctx.session.steps).toBe(2)
    expect(costHelper).toHaveBeenCalledWith(ctx, 2, false)
    expect(ctx.scene.enter).toHaveBeenCalledWith('trainFluxModelWizard')
  })

  it('второй шаг: при leaveScene=true выходит из сцены', async () => {
    // @ts-ignore: override readonly properties for test
    const ctx = makeMockContext({}, { session: {}, message: { text: '1' } })
    // @ts-ignore: requireMock returns unknown
    const isRu = (jest.requireMock('../../src/helpers/language') as any)
      .isRussian
    // @ts-ignore: requireMock returns unknown
    const costHelper = (jest.requireMock('../../src/price/helpers') as any)
      .handleTrainingCost
    isRu.mockReturnValue(true)
    costHelper.mockResolvedValue({
      leaveScene: true,
      trainingCostInStars: 0,
      currentBalance: 0,
    })
    // @ts-ignore
    const step1 = digitalAvatarBodyWizardV2.steps[1]
    await step1(ctx)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('второй шаг: невалидный ввод и отмена => выход из сцены', async () => {
    // @ts-ignore: override readonly properties for test
    const ctx = makeMockContext({}, { session: {}, message: { text: 'abc' } })
    // @ts-ignore: requireMock returns unknown
    const isRu = (jest.requireMock('../../src/helpers/language') as any)
      .isRussian
    // @ts-ignore: requireMock returns unknown
    const cancel = (
      jest.requireMock('../../src/handlers/handleHelpCancel') as any
    ).handleHelpCancel
    isRu.mockReturnValue(true)
    cancel.mockResolvedValueOnce(true)
    // @ts-ignore
    const step1 = digitalAvatarBodyWizardV2.steps[1]
    await step1(ctx)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('второй шаг: невалидный ввод без отмены => просит выбрать шаги', async () => {
    // @ts-ignore: override readonly properties for test
    const ctx = makeMockContext({}, { session: {}, message: { text: 'xyz' } })
    // @ts-ignore: requireMock returns unknown
    const isRu = (jest.requireMock('../../src/helpers/language') as any)
      .isRussian
    // @ts-ignore: requireMock returns unknown
    const cancel = (
      jest.requireMock('../../src/handlers/handleHelpCancel') as any
    ).handleHelpCancel
    isRu.mockReturnValue(false)
    cancel.mockResolvedValueOnce(false)
    // @ts-ignore
    const step1 = digitalAvatarBodyWizardV2.steps[1]
    await step1(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      '🔢 Please select the number of steps to proceed with model training.'
    )
  })
})
