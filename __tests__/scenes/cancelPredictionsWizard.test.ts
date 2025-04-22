import makeMockContext from '../utils/mockTelegrafContext'
import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'

// Mock axios and dependencies
const fakeGet = jest.fn()
const fakePost = jest.fn()
jest.mock('axios', () => ({ get: fakeGet, post: fakePost }))
jest.mock('@/helpers/language', () => ({ isRussian: () => true }))
jest.mock('@/price/helpers', () => ({ refundUser: jest.fn() }))
jest.mock('@/menu', () => ({ sendGenericErrorMessage: jest.fn() }))
import { refundUser } from '@/price/helpers'
import { sendGenericErrorMessage } from '@/menu'

import { cancelPredictionsWizard } from '@/scenes/cancelPredictionsWizard'
// Убираем Composer.unwrap и steps
// const steps = Composer.unwrap(cancelPredictionsWizard.middleware())
// const step0 = steps[0]

// Получаем middleware напрямую
const wizardMiddleware = cancelPredictionsWizard.middleware()

describe('cancelPredictionsWizard', () => {
  let ctx: MyContext
  const mockNext = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    mockNext.mockClear()
    ctx = makeMockContext(
      { update_id: 1 },
      {
        prompt: 'match',
        paymentAmount: 50,
        userModel: {
          model_name: '',
          trigger_word: '',
          model_url: 'placeholder/placeholder:placeholder',
        },
        targetUserId: '123',
      }
    )
    ctx.scene.leave = jest.fn()
    // Добавим reply, так как он используется
    ctx.reply = jest.fn()
  })

  test('cancels matching predictions and refunds', async () => {
    const preds = [
      {
        id: '1',
        input: { prompt: 'match' },
        status: 'processing',
        urls: { cancel: 'url1' },
      },
      {
        id: '2',
        input: { prompt: 'nomatch' },
        status: 'queued',
        urls: { cancel: 'url2' },
      },
      {
        id: '3',
        input: { prompt: 'match' },
        status: 'succeeded',
        urls: { cancel: 'url3' },
      },
    ]
    fakeGet.mockResolvedValue({ data: { results: preds } })
    fakePost.mockResolvedValue({})
    // Вызываем middleware
    await wizardMiddleware(ctx, mockNext)
    expect(fakePost).toHaveBeenCalledWith('url1', {}, expect.any(Object))
    expect(ctx.reply).toHaveBeenCalledWith('Запрос с ID: 1 успешно отменен.')
    expect(refundUser).toHaveBeenCalledWith(ctx, 50) // refundUser теперь принимает ctx и amount
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  test('handles error and sends generic error message', async () => {
    fakeGet.mockRejectedValue(new Error('fail'))
    // Вызываем middleware
    await wizardMiddleware(ctx, mockNext)
    expect(sendGenericErrorMessage).toHaveBeenCalledWith(
      ctx,
      true,
      expect.any(Error)
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })
})
