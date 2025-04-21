import makeMockContext from '../utils/mockTelegrafContext'

// Mock sendGenericErrorMessage
const mockSendGenericError = jest.fn()
jest.mock('@/menu', () => ({ sendGenericErrorMessage: (ctx, isRu, err) => mockSendGenericError(ctx, isRu, err) }))
// Mock language
jest.mock('@/helpers/language', () => ({ isRussian: () => true }))

import { handleCallback } from '../../src/handlers/handleCallback'

describe('handleCallback', () => {
  let ctx
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
    ctx.answerCbQuery = jest.fn().mockResolvedValue(undefined)
  })

  it('should answer callback query and return on valid data', async () => {
    ctx.callbackQuery = { data: 'payload' }
    await handleCallback(ctx)
    expect(ctx.answerCbQuery).toHaveBeenCalledTimes(1)
    // no error
  })

  it('should swallow answerCbQuery error but still return on data present', async () => {
    ctx.callbackQuery = { data: 'ok' }
    ctx.answerCbQuery = jest.fn().mockRejectedValue(new Error('fail'))
    await expect(handleCallback(ctx)).resolves.toBeUndefined()
    expect(ctx.answerCbQuery).toHaveBeenCalled()
    expect(mockSendGenericError).not.toHaveBeenCalled()
  })

  it('should throw and answerCbQuery on missing callbackQuery', async () => {
    ctx.callbackQuery = undefined
    await expect(handleCallback(ctx)).rejects.toThrow('No callback query')
    expect(ctx.answerCbQuery).toHaveBeenCalled()
    expect(mockSendGenericError).not.toHaveBeenCalled()
  })

  it('should throw and call sendGenericErrorMessage on answerCbQuery failure in catch', async () => {
    // Make answerCbQuery reject in catch
    ctx.callbackQuery = { data: '' }
    // initial answerCbQuery (swallow) then second call throws
    const seq = jest.fn()
    ctx.answerCbQuery = jest.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('err2'))
    await expect(handleCallback(ctx)).rejects.toThrow('No callback query data')
    expect(ctx.answerCbQuery).toHaveBeenCalledTimes(2)
    expect(mockSendGenericError).toHaveBeenCalled()
  })
})