// Мокаем зависимости
jest.mock('@/handlers')
jest.mock('@/helpers')
jest.mock('@/menu')
jest.mock('@/core/supabase')
jest.mock('@/helpers/error')

import { handleQuestRules, handleQuestComplete } from '@/scenes/levelQuestWizard/handlers'
import makeMockContext from '../utils/mockTelegrafContext'
import { getSubScribeChannel } from '@/handlers'
import { isRussian } from '@/helpers'
import { getReferalsCountAndUserData } from '@/core/supabase'
import { mainMenu } from '@/menu'
import { errorMessage } from '@/helpers/error'
import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { MySession, SubscriptionType, UserType } from '@/interfaces'
import { User } from 'telegraf/typings/core/types/typegram'

// Типизируем моки
const mockedGetSubChannel = getSubScribeChannel as jest.Mock
const mockedIsRussian = isRussian as jest.Mock<() => boolean>
const mockedGetReferals = getReferalsCountAndUserData as jest.Mock<
  (telegram_id: string) => Promise<{
    count: number
    level: number
    subscriptionType: SubscriptionType
    userData: UserType | null
    isExist: boolean
  } | null>
>
const mockedMainMenu = mainMenu as jest.Mock
const mockedErrorMessage = errorMessage as jest.Mock

describe('levelQuestWizard handlers', () => {
  let ctx: ReturnType<typeof makeMockContext>
  const mockFrom: User = { id: 99, is_bot: false, first_name: 'TestQuest', language_code: 'ru' }
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
    // ctx создается в каждом тесте
  })

  describe('handleQuestRules', () => {
    it('replies with rules message in Russian', async () => {
      const sessionData = createMockSession()
      // Создаем ctx с mockFrom
      ctx = makeMockContext({ message: { from: mockFrom } }, sessionData)
      mockedIsRussian.mockReturnValue(true)
      mockedGetSubChannel.mockReturnValue('chan123')

      await handleQuestRules(ctx)

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Добро пожаловать'),
        { parse_mode: 'HTML' }
      )
    })

    it('calls errorMessage on exception', async () => {
      const sessionData = createMockSession()
      ctx = makeMockContext({ message: { from: mockFrom } }, sessionData)
      mockedIsRussian.mockReturnValue(false)
      mockedGetSubChannel.mockImplementation(() => { throw new Error('fail') })

      // Обработчик сам ловит ошибку, поэтому не используем rejects.toThrow
      await handleQuestRules(ctx)

      expect(mockedErrorMessage).toHaveBeenCalledWith(ctx, expect.any(Error), false)
    })
  })

  describe('handleQuestComplete', () => {
    it('replies with completion message and keyboard', async () => {
      const sessionData = createMockSession()
      ctx = makeMockContext({ message: { from: mockFrom } }, sessionData)
      mockedIsRussian.mockReturnValue(false)
      mockedGetReferals.mockResolvedValue({ count: 5, subscriptionType: SubscriptionType.NEUROBLOGGER, level: 3, userData: null, isExist: true })
      mockedMainMenu.mockReturnValue({ reply_markup: { keyboard: [['m']] } })

      await handleQuestComplete(ctx)

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('NeuroQuest completed'),
        { reply_markup: { keyboard: [['m']] } }
      )
    })

    it('calls errorMessage on exception', async () => {
      const sessionData = createMockSession()
      ctx = makeMockContext({ message: { from: mockFrom } }, sessionData)
      mockedIsRussian.mockReturnValue(true)
      const error = new Error('oops')
      mockedGetReferals.mockRejectedValue(error)

      await handleQuestComplete(ctx)

      expect(mockedErrorMessage).toHaveBeenCalledWith(ctx, error, true)
    })
  })
})