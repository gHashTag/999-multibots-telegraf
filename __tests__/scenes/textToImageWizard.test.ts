// Мокаем внешние зависимости до импортов
jest.mock('@/helpers/language')
jest.mock('@/handlers/handleHelpCancel')
jest.mock('@/price/helpers')
jest.mock('@/services/generateTextToImage')
jest.mock('@/core/supabase')

import { textToImageWizard } from '@/scenes/textToImageWizard'
import makeMockContext from '../utils/mockTelegrafContext'
import { isRussian } from '@/helpers/language'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import {
  validateAndCalculateImageModelPrice,
  sendBalanceMessage,
} from '@/price/helpers'
import { generateTextToImage } from '@/services/generateTextToImage'
import { getUserBalance } from '@/core/supabase'
import { Composer } from 'telegraf'
import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { MySession } from '@/interfaces'
import { User } from 'telegraf/typings/core/types/typegram'
import { UserFromGetMe } from 'telegraf/types'

// Типизируем моки
const mockedIsRussian = isRussian as jest.Mock<() => boolean>
const mockedHandleHelpCancel = handleHelpCancel as jest.Mock
const mockedValidatePrice = validateAndCalculateImageModelPrice as jest.Mock
const mockedSendBalance = sendBalanceMessage as jest.Mock
const mockedGenerateTextToImage = generateTextToImage as jest.Mock<
  () => Promise<void>
>
const mockedGetUserBalance = getUserBalance as jest.Mock

describe('textToImageWizard steps', () => {
  let ctx: ReturnType<typeof makeMockContext>
  // Получаем шаги
  const steps = Composer.unwrap(textToImageWizard.middleware())
  const step0 = steps[0]
  // Шаг 1 (выбор модели) пропускается в тестах
  const step2 = steps[2]
  const mockNext = (): Promise<void> => Promise.resolve()
  const mockFrom: User = {
    id: 1,
    is_bot: false,
    first_name: 'Test',
    language_code: 'ru',
  }
  const mockBotInfo: UserFromGetMe = {
    id: 2,
    is_bot: true,
    first_name: 'Bot',
    username: 'bot',
    can_join_groups: true,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
  }
  const createMockSession = (
    overrides: Partial<MySession> = {}
  ): MySession => ({
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
    // ctx создается в каждом тесте
    mockedIsRussian.mockReturnValue(true) // Устанавливаем по умолчанию RU
  })

  it('step 0: leaves when no user ID', async () => {
    const sessionData = createMockSession()
    // Создаем ctx без from
    ctx = makeMockContext({}, sessionData, { botInfo: mockBotInfo })
    // @ts-ignore - убираем ctx.from = undefined

    await step0(ctx, mockNext)

    expect(ctx.reply).toHaveBeenCalledWith(
      '❌ Не удалось определить пользователя'
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step 0: prompts and advances', async () => {
    const sessionData = createMockSession()
    // Создаем ctx с from
    ctx = makeMockContext({ message: { from: mockFrom } }, sessionData, {
      botInfo: mockBotInfo,
    })

    await step0(ctx, mockNext)

    expect(ctx.reply).toHaveBeenCalledWith(
      '🎨 Выберите модель для генерации:',
      expect.objectContaining({ reply_markup: expect.any(Object) })
    )
    // Не проверяем mockNext
  })

  it('step 2: invalid prompt leaves', async () => {
    const sessionData = createMockSession({ selectedModel: 'm1' })
    // Передаем пустой message
    ctx = makeMockContext({ message: { from: mockFrom } }, sessionData, {
      botInfo: mockBotInfo,
    })
    // @ts-ignore - убираем ctx.message = {} as any

    await step2(ctx, mockNext)

    expect(ctx.reply).toHaveBeenCalledWith('❌ Некорректный промпт')
    expect(ctx.scene.leave).toHaveBeenCalled()
    expect(mockedGenerateTextToImage).not.toHaveBeenCalled()
  })

  it('step 2: valid prompt generates image and leaves', async () => {
    const sessionData = createMockSession({ selectedModel: 'm1' })
    // Передаем message с текстом
    ctx = makeMockContext(
      { message: { from: mockFrom, text: 'hello' } },
      sessionData,
      { botInfo: mockBotInfo }
    )
    mockedGenerateTextToImage.mockResolvedValue(undefined)

    await step2(ctx, mockNext)

    expect(mockedGenerateTextToImage).toHaveBeenCalledWith(
      'hello',
      'm1',
      1,
      mockFrom.id.toString(), // Преобразуем в строку
      true,
      ctx,
      mockBotInfo.username
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })
})
