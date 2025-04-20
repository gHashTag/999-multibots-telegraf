import makeMockContext from '../utils/mockTelegrafContext'
// Mock logger
jest.mock('@/utils/logger', () => ({ error: jest.fn() }))
import logger from '@/utils/logger'
import { sendGenericErrorMessage } from '@/menu/sendGenericErrorMessage'

describe('sendGenericErrorMessage', () => {
  let ctx: ReturnType<typeof makeMockContext>
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
    ctx.reply = jest.fn(() => Promise.resolve()) as any
    ctx.from = { id: 9, username: 'user9', language_code: 'ru' } as any
    ctx.chat = { id: 99 } as any
  })

  it('sends generic Russian message without error details', async () => {
    process.env.NODE_ENV = 'production'
    await sendGenericErrorMessage(ctx as any, true)
    expect(ctx.reply).toHaveBeenCalledWith('Произошла ошибка. Пожалуйста, попробуйте позже.')
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('logs error and sends generic message when error provided', async () => {
    process.env.NODE_ENV = 'production'
    const err = new Error('oops')
    await sendGenericErrorMessage(ctx as any, false, err)
    expect(logger.error).toHaveBeenCalledWith(
      `Error in conversation with user ID 9: ${err.message}`,
      expect.any(Object)
    )
    expect(ctx.reply).toHaveBeenCalledWith('An error occurred. Please try again later.')
  })

  it('includes error details in development mode', async () => {
    process.env.NODE_ENV = 'development'
    const err = new Error('devError')
    await sendGenericErrorMessage(ctx as any, false, err)
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Error details: devError')
    )
  })

  it('logs sendError when reply throws', async () => {
    process.env.NODE_ENV = 'production'
    const sendErr = new Error('sendFail')
    ctx.reply = jest.fn(() => Promise.reject(sendErr)) as any
    await sendGenericErrorMessage(ctx as any, true)
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to send error message to user',
      expect.objectContaining({ error: sendErr })
    )
  })
})