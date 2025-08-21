import { jest, describe, beforeEach, it, expect } from '@jest/globals'
import makeMockContext from '../utils/mockTelegrafContext'
import selectModelWizard from '../../src/scenes/selectModelWizard'

// Mock dependencies
jest.mock('../../src/commands/selectModelCommand/getAvailableModels', () => ({
  getAvailableModels: jest.fn(),
}))
jest.mock('@/menu', () => ({
  sendGenericErrorMessage: jest.fn(),
}))
jest.mock('@/helpers/language', () => ({
  isRussian: jest.fn(),
}))
jest.mock('@/handlers', () => ({
  handleHelpCancel: jest.fn(),
}))
jest.mock('@/core/supabase', () => ({
  setModel: jest.fn(),
  getUserByTelegramId: jest.fn(),
  updateUserLevelPlusOne: jest.fn(),
}))

import { getAvailableModels } from '../../src/commands/selectModelCommand/getAvailableModels'
import { sendGenericErrorMessage } from '@/menu'
import { isRussian } from '@/helpers/language'
import { handleHelpCancel } from '@/handlers'
import { setModel, getUserByTelegramId, updateUserLevelPlusOne } from '@/core/supabase'

describe('selectModelWizard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('step0: prompts with model list and next()', async () => {
    (isRussian as jest.Mock).mockReturnValueOnce(false)
    const models = ['A', 'B', 'C', 'D']
    ;(getAvailableModels as jest.Mock).mockResolvedValueOnce(models)
    const ctx = makeMockContext()
    // @ts-ignore
    const step0 = selectModelWizard.steps[0]
    await step0(ctx)
    expect(getAvailableModels).toHaveBeenCalled()
    expect(ctx.reply).toHaveBeenCalledWith(
      '🧠 Select AI Model:',
      expect.any(Object)
    )
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('step0: on error replies and leaves', async () => {
    (isRussian as jest.Mock).mockReturnValueOnce(true)
    ;(getAvailableModels as jest.Mock).mockRejectedValueOnce(new Error('fail'))
    const ctx = makeMockContext()
    // @ts-ignore
    const step0 = selectModelWizard.steps[0]
    await step0(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      '❌ Ошибка при получении списка моделей'
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step1: no message sends generic error and leaves', async () => {
    const ctx = makeMockContext()
    ;(sendGenericErrorMessage as jest.Mock).mockResolvedValueOnce(undefined)
    // @ts-ignore
    const step1 = selectModelWizard.steps[1]
    await step1(ctx)
    expect(sendGenericErrorMessage).toHaveBeenCalledWith(ctx, false)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step1: cancelled by user leaves scene', async () => {
    const ctx = makeMockContext({}, { message: { text: 'X' } })
    ;(handleHelpCancel as jest.Mock).mockResolvedValueOnce(true)
    // @ts-ignore
    const step1 = selectModelWizard.steps[1]
    await step1(ctx)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step1: invalid model replies not found and leaves', async () => {
    (isRussian as jest.Mock).mockReturnValueOnce(false)
    (handleHelpCancel as jest.Mock).mockResolvedValueOnce(false)
    (getAvailableModels as jest.Mock).mockResolvedValueOnce(['M1'])
    const ctx = makeMockContext({}, { message: { text: 'X' } })
    // @ts-ignore
    const step1 = selectModelWizard.steps[1]
    await step1(ctx)
    expect(ctx.reply).toHaveBeenCalledWith('❌ Model not found')
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step1: valid model sets model, replies and leaves without level update', async () => {
    (isRussian as jest.Mock).mockReturnValueOnce(true)
    (handleHelpCancel as jest.Mock).mockResolvedValueOnce(false)
    (getAvailableModels as jest.Mock).mockResolvedValueOnce(['M1'])
    (getUserByTelegramId as jest.Mock).mockResolvedValueOnce({ data: { level: 3 } })
    const ctx = makeMockContext({}, { message: { text: 'M1' } })
    // @ts-ignore
    const step1 = selectModelWizard.steps[1]
    await step1(ctx)
    expect(setModel).toHaveBeenCalledWith(ctx.from.id.toString(), 'M1')
    expect(ctx.reply).toHaveBeenCalledWith(`✅ Модель успешно изменена на M1`, expect.any(Object))
    expect(updateUserLevelPlusOne).not.toHaveBeenCalled()
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step1: valid model with level 5 updates level', async () => {
    (isRussian as jest.Mock).mockReturnValueOnce(false)
    (handleHelpCancel as jest.Mock).mockResolvedValueOnce(false)
    (getAvailableModels as jest.Mock).mockResolvedValueOnce(['M1'])
    (getUserByTelegramId as jest.Mock).mockResolvedValueOnce({ data: { level: 5 } })
    const ctx = makeMockContext({}, { message: { text: 'M1' } })
    // @ts-ignore
    const step1 = selectModelWizard.steps[1]
    await step1(ctx)
    expect(updateUserLevelPlusOne).toHaveBeenCalledWith(ctx.from.id.toString(), 5)
  })
})