/**
 * Tests for cancelPredictionsWizard
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import axios from 'axios'
import { cancelPredictionsWizard } from '../../src/scenes/cancelPredictionsWizard'
import makeMockContext from '../utils/mockTelegrafContext'

jest.mock('axios')
jest.mock('../../src/price/helpers', () => ({
  refundUser: jest.fn(),
}))
jest.mock('../../src/helpers/language', () => ({
  isRussian: jest.fn(),
}))
jest.mock('../../src/menu', () => ({
  sendGenericErrorMessage: jest.fn(),
}))

const mockedAxios = axios as jest.Mocked<typeof axios>
import { refundUser } from '../../src/price/helpers'
import { isRussian } from '../../src/helpers/language'
import { sendGenericErrorMessage } from '../../src/menu'

describe('cancelPredictionsWizard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('cancels matching predictions, refunds user and leaves scene', async () => {
    const ctx = makeMockContext()
    // Setup session values
    ctx.session.prompt = 'hello'
    ctx.session.paymentAmount = 5
    ;(isRussian as jest.Mock).mockReturnValue(true)

    // Mock axios.get to return two predictions
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        results: [
          { id: '1', input: { prompt: 'hello' }, status: 'processing', urls: { cancel: 'url1' } },
          { id: '2', input: { prompt: 'other' }, status: 'processing', urls: { cancel: 'url2' } },
        ],
      },
    })
    mockedAxios.post.mockResolvedValue({})

    // Invoke the scene step
    // @ts-ignore
    const step = cancelPredictionsWizard.steps[0]
    await step(ctx)

    // Expect axios.get was called
    expect(mockedAxios.get).toHaveBeenCalled()
    // Expect only matching prediction canceled
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'url1', {}, expect.any(Object)
    )
    // Expect reply for cancelled prediction
    expect(ctx.reply).toHaveBeenCalledWith(
      'Запрос с ID: 1 успешно отменен.'
    )
    // Expect refundUser called
    expect(refundUser).toHaveBeenCalledWith(ctx, 5)
    // Expect scene.leave called
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('on error sends generic error message and leaves scene', async () => {
    const ctx = makeMockContext()
    ;(isRussian as jest.Mock).mockReturnValue(false)
    mockedAxios.get.mockRejectedValueOnce(new Error('fail'))

    // @ts-ignore
    const step = cancelPredictionsWizard.steps[0]
    await step(ctx)

    expect(sendGenericErrorMessage).toHaveBeenCalledWith(
      ctx, false, expect.any(Error)
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })
})