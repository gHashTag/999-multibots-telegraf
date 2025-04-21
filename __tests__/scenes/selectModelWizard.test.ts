// Мокаем внешние зависимости до импортов
// Мокаем getAvailableModels как именованный экспорт
jest.mock('../../src/commands/selectModelCommand/getAvailableModels', () => ({
  getAvailableModels: jest.fn(),
}))
jest.mock('../../src/core/supabase', () => ({
  setModel: jest.fn(),
  getUserByTelegramId: jest.fn(),
  updateUserLevelPlusOne: jest.fn(),
}))
jest.mock('../../src/handlers/handleHelpCancel', () => ({
  handleHelpCancel: jest.fn(),
}))
jest.mock('../../src/helpers/language', () => ({ isRussian: jest.fn() }))
jest.mock('../../src/menu', () => ({ sendGenericErrorMessage: jest.fn() }))

import { selectModelWizard } from '../../src/scenes/selectModelWizard'
import makeMockContext from '../utils/mockTelegrafContext'
// Импортируем реальные функции для моков
import { getAvailableModels } from '@/commands/selectModelCommand/getAvailableModels'
import {
  updateUserModel,
  getUserByTelegramId,
  updateUserLevelPlusOne,
} from '@/core/supabase'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { isRussian } from '@/helpers/language'
import { sendGenericErrorMessage } from '@/menu'
import { Composer } from 'telegraf'
import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { MySession } from '@/interfaces'
import { User } from 'telegraf/typings/core/types/typegram'
import { Markup } from 'telegraf'

// Мокаем зависимости
jest.mock('@/commands/selectModelCommand/getAvailableModels')
jest.mock('@/core/supabase')
jest.mock('@/handlers/handleHelpCancel')
jest.mock('@/helpers/language')
jest.mock('@/menu')

// Типизируем моки (возвращаем как было)
const mockedGetAvailableModels = getAvailableModels as jest.Mock<
  () => Promise<string[]>
>
const mockedUpdateUserModel = updateUserModel as jest.Mock<
  (...args: any[]) => Promise<any>
>
const mockedGetUserByTelegramId = getUserByTelegramId as jest.Mock<
  (...args: any[]) => Promise<any>
>
const mockedUpdateUserLevelPlusOne = updateUserLevelPlusOne as jest.Mock<
  (...args: any[]) => Promise<any>
>
const mockedHandleHelpCancel = handleHelpCancel as jest.Mock<
  (...args: any[]) => Promise<boolean>
>
const mockedIsRussian = isRussian as jest.Mock<() => boolean>
const mockedSendGenericError = sendGenericErrorMessage as jest.Mock

describe('selectModelWizard', () => {
  let ctx: ReturnType<typeof makeMockContext>
  // Получаем шаги
  const steps = Composer.unwrap(selectModelWizard.middleware())
  const step0 = steps[0]
  const step1 = steps[1]
  const mockNext = (): Promise<void> => Promise.resolve()
  const mockFrom: User = {
    id: 123,
    is_bot: false,
    first_name: 'Test',
    language_code: 'ru',
  }

  // Копируем полное определение createMockSession
  const createMockSession = (
    overrides: Partial<MySession> = {}
  ): MySession => ({
    activeWizard: true, // Предполагаем, что визард активен
    wizards: {},
    scene: { current: 'selectModelWizard', state: {} }, // Указываем текущую сцену
    selectedPayment: null,
    userProfile: null,
    cursor: 0,
    images: [],
    targetUserId: 0,
    userModel: null,
    email: null,
    mode: null,
    prompt: null,
    imageURL: null,
    imageDescription: null,
    videoModel: null,
    paymentAmount: null,
    ...overrides,
  })

  beforeEach(() => {
    jest.clearAllMocks()
    // Создаем контекст для каждого теста, чтобы избежать мутаций
  })

  it('step 0: fetches models and displays keyboard', async () => {
    const sessionData = createMockSession()
    ctx = makeMockContext({ message: { from: mockFrom } }, sessionData)
    mockedIsRussian.mockReturnValue(true)
    mockedGetAvailableModels.mockResolvedValueOnce(['m1', 'm2', 'm3', 'm4'])

    await step0(ctx, mockNext)

    expect(mockedGetAvailableModels).toHaveBeenCalled()
    // Проверяем, что клавиатура содержит кнопки моделей
    expect(ctx.reply).toHaveBeenCalledWith(
      '🧠 Выберите модель:',
      expect.objectContaining({
        reply_markup: {
          keyboard: [
            [{ text: 'm1' }],
            [{ text: 'm2' }],
            [{ text: 'm3' }],
            [{ text: 'm4' }],
            expect.any(Object),
          ],
        },
      })
    )
    // Не проверяем mockNext
  })

  it('step 1: leaves on cancellation', async () => {
    const sessionData = createMockSession()
    // Передаем message в первом аргументе
    ctx = makeMockContext(
      { message: { from: mockFrom, text: 'm1' } },
      sessionData
    )
    mockedHandleHelpCancel.mockResolvedValueOnce(true)

    await step1(ctx, mockNext)

    expect(ctx.scene.leave).toHaveBeenCalled()
    expect(mockedUpdateUserModel).not.toHaveBeenCalled()
  })

  it('step 1: sets model and leaves', async () => {
    const sessionData = createMockSession()
    // Передаем message в первом аргументе
    ctx = makeMockContext(
      { message: { from: mockFrom, text: 'm2' } },
      sessionData
    )
    mockedIsRussian.mockReturnValue(false)
    mockedHandleHelpCancel.mockResolvedValueOnce(false)
    mockedGetAvailableModels.mockResolvedValue(['m2', 'm3'])
    mockedGetUserByTelegramId.mockResolvedValue({ data: { level: 5 } })

    await step1(ctx, mockNext)

    // Проверяем вызов updateUserModel
    expect(mockedUpdateUserModel).toHaveBeenCalledWith(
      mockFrom.id.toString(),
      'm2'
    )
    expect(ctx.reply).toHaveBeenCalledWith(
      `✅ Model successfully changed to m2`,
      { reply_markup: { remove_keyboard: true } }
    )
    expect(mockedUpdateUserLevelPlusOne).toHaveBeenCalledWith(
      mockFrom.id.toString(),
      5
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })
})
