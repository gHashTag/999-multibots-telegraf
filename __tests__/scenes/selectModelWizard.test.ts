// Мокаем внешние зависимости до импортов
// Мокаем getAvailableModels как именованный экспорт
jest.mock('../../src/commands/selectModelCommand/getAvailableModels', () => ({
  getAvailableModels: jest.fn(),
}))
jest.mock('../../src/core/supabase', () => ({ setModel: jest.fn(), getUserByTelegramId: jest.fn(), updateUserLevelPlusOne: jest.fn() }))
jest.mock('../../src/handlers/handleHelpCancel', () => ({ handleHelpCancel: jest.fn() }))
jest.mock('../../src/helpers/language', () => ({ isRussian: jest.fn() }))
jest.mock('../../src/menu', () => ({ sendGenericErrorMessage: jest.fn() }))

import { selectModelWizard } from '../../src/scenes/selectModelWizard'
import makeMockContext from '../utils/mockTelegrafContext'
// Импортируем именованный экспорт getAvailableModels
import { getAvailableModels } from '../../src/commands/selectModelCommand/getAvailableModels'
import { handleHelpCancel } from '../../src/handlers/handleHelpCancel'
import { isRussian } from '../../src/helpers/language'
import { setModel, getUserByTelegramId, updateUserLevelPlusOne } from '../../src/core/supabase'

describe('selectModelWizard', () => {
  let ctx
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
    ctx.from = { id: 123, language_code: 'ru' }
  })

  it('step 0: fetches models and displays keyboard', async () => {
    ;(isRussian as jest.Mock).mockReturnValue(true)
    ;(getAvailableModels as jest.Mock).mockResolvedValueOnce(['m1', 'm2', 'm3', 'm4'])
    // @ts-ignore
    const step0 = selectModelWizard.steps[0]
    await step0(ctx)
    expect(getAvailableModels).toHaveBeenCalled()
    expect(ctx.reply).toHaveBeenCalledWith(
      '🧠 Выберите модель:',
      expect.any(Object)
    )
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('step 1: leaves on cancellation', async () => {
    ctx.message = { text: 'm1' }
    ;(handleHelpCancel as jest.Mock).mockResolvedValueOnce(true)
    // @ts-ignore
    const step1 = selectModelWizard.steps[1]
    await step1(ctx)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step 1: sets model and leaves', async () => {
    ctx.message = { text: 'm2' }
    ;(isRussian as jest.Mock).mockReturnValue(false)
    ;(handleHelpCancel as jest.Mock).mockResolvedValueOnce(false)
    ;(getAvailableModels as jest.Mock).mockResolvedValue(['m2', 'm3'])
    ;(getUserByTelegramId as jest.Mock).mockResolvedValue({ data: { level: 5 } })
    // @ts-ignore
    const step1 = selectModelWizard.steps[1]
    await step1(ctx)
    expect(setModel).toHaveBeenCalledWith('123', 'm2')
    expect(ctx.reply).toHaveBeenCalledWith(
      `✅ Model successfully changed to m2`,
      { reply_markup: { remove_keyboard: true } }
    )
    expect(updateUserLevelPlusOne).toHaveBeenCalledWith('123', 5)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })
})