// Мокаем внешние зависимости до импортов
jest.mock('@/helpers/language')
jest.mock('@/handlers')

import { sizeWizard } from '@/scenes/sizeWizard'
import makeMockContext from '../utils/mockTelegrafContext'
import { isRussian } from '@/helpers/language'
import { handleSizeSelection } from '@/handlers'
import { Composer } from 'telegraf'
import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { MySession } from '@/interfaces'
import { User } from 'telegraf/typings/core/types/typegram'

// Типизируем моки
const mockedIsRussian = isRussian as jest.Mock<() => boolean>
const mockedHandleSizeSelection = handleSizeSelection as jest.Mock

describe('sizeWizard steps', () => {
  let ctx: ReturnType<typeof makeMockContext>
  const steps = Composer.unwrap(sizeWizard.middleware())
  const step0 = steps[0]
  const step1 = steps[1]
  const mockNext = (): Promise<void> => Promise.resolve()
  const mockFrom: User = { id: 1, is_bot: false, first_name: 'Test', language_code: 'ru' }

  const createMockSession = (overrides: Partial<MySession> = {}): MySession => ({
    selectedPayment: null,
    cursor: 0,
    images: [],
    targetUserId: '',
    userModel: null,
    email: null,
    mode: null,
    prompt: null,
    imageUrl: null,
    videoModel: null,
    paymentAmount: null,
    subscription: null,
    neuroPhotoInitialized: false,
    bypass_payment_check: false,
    videoUrl: undefined,
    audioUrl: undefined,
    inviteCode: undefined,
    inviter: undefined,
    subscriptionStep: undefined,
    memory: undefined,
    attempts: undefined,
    amount: undefined,
    selectedModel: undefined,
    modelName: undefined,
    username: undefined,
    triggerWord: undefined,
    steps: undefined,
    translations: undefined,
    buttons: undefined,
    selectedSize: undefined,
    ...overrides,
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('step 0: prompts for image size and advances', async () => {
    const sessionData = createMockSession()
    ctx = makeMockContext({ message: { from: mockFrom } }, sessionData)
    mockedIsRussian.mockReturnValueOnce(true)

    await step0(ctx, mockNext)

    expect(ctx.reply).toHaveBeenCalledWith(
      'Выберите размер изображения:',
      { reply_markup: expect.any(Object) } // Клавиатура генерируется в `sizeMenu`
    )
    // Не проверяем mockNext
  })

  it('step 1: leaves when no message', async () => {
    const sessionData = createMockSession()
    // Передаем update без message
    ctx = makeMockContext({}, sessionData)
    // @ts-ignore - Убираем ctx.message = undefined

    await step1(ctx, mockNext)

    expect(mockedHandleSizeSelection).not.toHaveBeenCalled()
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step 1: rejects invalid size and stays', async () => {
    const sessionData = createMockSession()
    // Передаем message с невалидным текстом
    ctx = makeMockContext({ message: { from: mockFrom, text: 'foo' } }, sessionData)
    mockedIsRussian.mockReturnValueOnce(true)

    await step1(ctx, mockNext)

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Неверный размер')
    )
    expect(mockedHandleSizeSelection).not.toHaveBeenCalled()
    expect(ctx.scene.leave).not.toHaveBeenCalled()
  })

  it('step 1: handles valid size and leaves', async () => {
    const sessionData = createMockSession()
    // Передаем message с валидным текстом
    ctx = makeMockContext({ message: { from: mockFrom, text: '16:9' } }, sessionData)
    mockedIsRussian.mockReturnValueOnce(false)

    await step1(ctx, mockNext)

    expect(mockedHandleSizeSelection).toHaveBeenCalledWith(ctx, '16:9')
    expect(ctx.scene.leave).toHaveBeenCalled()
  })
})