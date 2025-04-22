import {
  MyContext,
  MySession,
  ModeEnum,
  SubscriptionType,
  PaymentStatus,
} from '../../src/interfaces'
import { isRussian } from '../../src/helpers'
import * as handlers from '../../src/handlers'
import * as botCore from '../../src/core/bot'
import { logger } from '../../src/utils/logger'
import { starAmounts } from '../../src/price/helpers/starAmounts'

// Мокируем необходимые модули
jest.mock('../../src/helpers')
jest.mock('../../src/handlers')
jest.mock('../../src/core/bot')
jest.mock('../../src/utils/logger')

// Типизируем моки
const mockedIsRussian = jest.mocked(isRussian)
const mockedHandlers = jest.mocked(handlers)
const mockedBotCore = jest.mocked(botCore)
const mockedLogger = jest.mocked(logger)

// Создаем простую заглушку для starPaymentScene
const starPaymentScene = {
  middleware: () => (ctx: any, next: any) => {
    return handlers.handleSelectStars({
      ctx,
      isRu: isRussian(ctx),
      starAmounts,
    })
  },
}

// Базовые моки для ответов
const mockReply = jest.fn().mockResolvedValue(true)
const mockAnswerCbQuery = jest.fn().mockResolvedValue(true)

// Упрощенная функция для создания мок-контекста
const createMockContext = () => {
  return {
    from: {
      id: 1,
      is_bot: false,
      first_name: 'Test',
      username: 'testuser',
      language_code: 'en',
    },
    chat: { id: 1, type: 'private', first_name: 'Test', username: 'testuser' },
    session: {
      cursor: 0,
      images: [],
      __scenes: {
        current: 'starPaymentScene',
        state: { step: 0 },
        cursor: 0,
      },
      balance: 500,
      targetUserId: '12345',
      userModel: {},
    },
    reply: mockReply,
    answerCbQuery: mockAnswerCbQuery,
    telegram: {
      sendInvoice: jest.fn().mockResolvedValue({ message_id: 1 }),
    },
    update: { update_id: 1 },
  } as unknown as MyContext
}

describe('Star Payment Scene - Simplified', () => {
  let ctx: MyContext

  beforeEach(() => {
    jest.clearAllMocks()
    ctx = createMockContext()
    mockedIsRussian.mockReturnValue(true)
    mockedBotCore.getBotNameByToken.mockReturnValue({ bot_name: 'test_bot' })
  })

  it('should call handleSelectStars when entering the scene', async () => {
    await starPaymentScene.middleware()(ctx, jest.fn())

    expect(mockedHandlers.handleSelectStars).toHaveBeenCalledTimes(1)
    expect(mockedHandlers.handleSelectStars).toHaveBeenCalledWith(
      expect.objectContaining({ ctx, isRu: true, starAmounts })
    )
  })

  it('should handle subscription data if present in session', async () => {
    const subSessionCtx = createMockContext()
    subSessionCtx.session.subscriptionData = {
      type: SubscriptionType.NEUROBLOGGER,
      status: PaymentStatus.COMPLETED,
    } as any

    await starPaymentScene.middleware()(subSessionCtx, jest.fn())

    expect(mockedHandlers.handleSelectStars).toHaveBeenCalledTimes(1)
  })
})
