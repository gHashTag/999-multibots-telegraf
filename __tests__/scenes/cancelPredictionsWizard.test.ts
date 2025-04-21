import makeMockContext from '../utils/mockTelegrafContext'

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
const step = cancelPredictionsWizard.steps[0]

describe('cancelPredictionsWizard', () => {
  let ctx: any
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
    ctx.session.prompt = 'match'
    ctx.session.paymentAmount = 50
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
    await step(ctx)
    // Should cancel only id '1'
    expect(fakePost).toHaveBeenCalledWith('url1', {}, expect.any(Object))
    expect(ctx.reply).toHaveBeenCalledWith('Запрос с ID: 1 успешно отменен.')
    expect(refundUser).toHaveBeenCalledWith(ctx, 50)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  test('handles error and sends generic error message', async () => {
    fakeGet.mockRejectedValue(new Error('fail'))
    await step(ctx)
    expect(sendGenericErrorMessage).toHaveBeenCalledWith(
      ctx,
      true,
      expect.any(Error)
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })
})
