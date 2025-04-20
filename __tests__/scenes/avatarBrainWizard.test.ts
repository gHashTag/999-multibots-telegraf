/**
 * Тесты для сцены avatarBrainWizard
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { avatarBrainWizard } from '../../src/scenes/avatarBrainWizard'
import makeMockContext from '../utils/mockTelegrafContext'

// Мокаем внешние зависимости
jest.mock('../../src/helpers/language', () => ({
  // @ts-ignore
  isRussian: jest.fn(),
}))
jest.mock('../../src/menu', () => ({
  // @ts-ignore
  createHelpCancelKeyboard: jest.fn(),
}))
jest.mock('../../src/handlers/handleHelpCancel', () => ({
  // @ts-ignore
  handleHelpCancel: jest.fn(),
}))
jest.mock('../../src/core/supabase', () => ({
  // @ts-ignore
  updateUserSoul: jest.fn(),
  // @ts-ignore
  getUserByTelegramId: jest.fn(),
  // @ts-ignore
  updateUserLevelPlusOne: jest.fn(),
}))

describe('avatarBrainWizard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('шаг 0: здоровается и вызывает next()', async () => {
    // @ts-ignore
    const isRu = jest.requireMock('../../src/helpers/language').isRussian
    // @ts-ignore
    const createKb = jest.requireMock('../../src/menu').createHelpCancelKeyboard
    isRu.mockReturnValueOnce(true)
    createKb.mockReturnValueOnce({ keyboard: [['cancel']] })
    const ctx = makeMockContext()
    // @ts-ignore
    const step0 = avatarBrainWizard.steps[0]
    await step0(ctx)
    expect(createKb).toHaveBeenCalledWith(true)
    expect(ctx.reply).toHaveBeenCalledWith(
      '👋 Привет, как называется ваша компания?',
      { keyboard: [['cancel']] }
    )
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('шаг 1: сохраняет название компании и переходит дальше', async () => {
    const ctx = makeMockContext({}, { message: { text: 'AcmeCorp' } })
    // Инициализируем состояние для записи
    // @ts-ignore
    ctx.wizard.state = {}
    // @ts-ignore
    const isRu = jest.requireMock('../../src/helpers/language').isRussian
    // @ts-ignore
    const cancel = jest.requireMock('../../src/handlers/handleHelpCancel').handleHelpCancel
    // @ts-ignore
    const createKb = jest.requireMock('../../src/menu').createHelpCancelKeyboard
    isRu.mockReturnValueOnce(false)
    cancel.mockResolvedValueOnce(false)
    createKb.mockReturnValueOnce({ keyboard: [['cancel']] })
    // @ts-ignore
    const step1 = avatarBrainWizard.steps[1]
    await step1(ctx)
    // @ts-ignore
    expect(ctx.wizard.state.company).toBe('AcmeCorp')
    expect(ctx.reply).toHaveBeenCalledWith(
      '💼 What is your position?',
      { keyboard: [['cancel']] }
    )
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('шаг 1: при отмене уходит из сцены', async () => {
    const ctx = makeMockContext({}, { message: { text: 'AcmeCorp' } })
    // @ts-ignore
    const cancel = jest.requireMock('../../src/handlers/handleHelpCancel').handleHelpCancel
    cancel.mockResolvedValueOnce(true)
    // @ts-ignore
    const step1 = avatarBrainWizard.steps[1]
    await step1(ctx)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('шаг 2: сохраняет должность и переходит дальше', async () => {
    const ctx = makeMockContext({}, { message: { text: 'Developer' } })
    // Предварительно сохраняем company в state
    // @ts-ignore
    ctx.wizard.state = { company: 'AcmeCorp' }
    // @ts-ignore
    const isRu = jest.requireMock('../../src/helpers/language').isRussian
    // @ts-ignore
    const cancel = jest.requireMock('../../src/handlers/handleHelpCancel').handleHelpCancel
    // @ts-ignore
    const createKb = jest.requireMock('../../src/menu').createHelpCancelKeyboard
    isRu.mockReturnValueOnce(true)
    cancel.mockResolvedValueOnce(false)
    createKb.mockReturnValueOnce({ keyboard: [['cancel']] })
    // @ts-ignore
    const step2 = avatarBrainWizard.steps[2]
    await step2(ctx)
    // @ts-ignore
    expect(ctx.wizard.state.position).toBe('Developer')
    expect(ctx.reply).toHaveBeenCalledWith(
      '🛠️ Какие у тебя навыки?',
      { keyboard: [['cancel']] }
    )
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('шаг 3: при вводе навыков сохраняет и завершает сцену', async () => {
    const ctx = makeMockContext({}, { message: { text: 'JS, TS' } })
    // Подготавливаем state и from
    // @ts-ignore
    ctx.wizard.state = { company: 'AcmeCorp', position: 'Developer' }
    ctx.from.id = 999
    // Моки
    // @ts-ignore
    const cancel = jest.requireMock('../../src/handlers/handleHelpCancel').handleHelpCancel
    // @ts-ignore
    const isRu = jest.requireMock('../../src/helpers/language').isRussian
    // @ts-ignore
    const updateSoul = jest.requireMock('../../src/core/supabase').updateUserSoul
    // @ts-ignore
    const getById = jest.requireMock('../../src/core/supabase').getUserByTelegramId
    // @ts-ignore
    const updateLevel = jest.requireMock('../../src/core/supabase').updateUserLevelPlusOne
    isRu.mockReturnValueOnce(true)
    cancel.mockResolvedValueOnce(false)
    updateSoul.mockResolvedValueOnce(true)
    getById.mockResolvedValueOnce({ data: { level: 2 } })
    // @ts-ignore
    const step3 = avatarBrainWizard.steps[3]
    await step3(ctx)
    expect(updateSoul).toHaveBeenCalledWith(
      '999', 'AcmeCorp', 'Developer', 'JS, TS'
    )
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('✅ Аватар успешно получил информацию'), {
      parse_mode: 'HTML',
    })
    expect(updateLevel).not.toHaveBeenCalled()
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('шаг 3: при уровне 3 повышает уровень', async () => {
    const ctx = makeMockContext({}, { message: { text: 'SkillX' } })
    // @ts-ignore
    ctx.wizard.state = { company: 'AcmeCorp', position: 'Developer' }
    ctx.from.id = 321
    const cancel = jest.requireMock('../../src/handlers/handleHelpCancel').handleHelpCancel
    const isRu = jest.requireMock('../../src/helpers/language').isRussian
    const updateSoul = jest.requireMock('../../src/core/supabase').updateUserSoul
    const getById = jest.requireMock('../../src/core/supabase').getUserByTelegramId
    const updateLevel = jest.requireMock('../../src/core/supabase').updateUserLevelPlusOne
    isRu.mockReturnValueOnce(false)
    cancel.mockResolvedValueOnce(false)
    updateSoul.mockResolvedValueOnce(true)
    getById.mockResolvedValueOnce({ data: { level: 3 } })
    // @ts-ignore
    const step3 = avatarBrainWizard.steps[3]
    await step3(ctx)
    expect(updateLevel).toHaveBeenCalledWith('321', 3)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('шаг 3: если пользователя нет, выбрасывает ошибку', async () => {
    const ctx = makeMockContext({}, { message: { text: 'X' } })
    // @ts-ignore
    ctx.wizard.state = { company: 'Acme', position: 'Dev' }
    ctx.from.id = 555
    const cancel = jest.requireMock('../../src/handlers/handleHelpCancel').handleHelpCancel
    const getById = jest.requireMock('../../src/core/supabase').getUserByTelegramId
    cancel.mockResolvedValueOnce(false)
    getById.mockResolvedValueOnce({ data: null })
    // @ts-ignore
    const step3 = avatarBrainWizard.steps[3]
    await expect(step3(ctx)).rejects.toThrow('User with ID 555 does not exist.')
  })
})