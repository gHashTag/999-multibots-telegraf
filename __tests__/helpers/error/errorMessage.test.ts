import { errorMessage } from '@/helpers/error/errorMessage'

describe('errorMessage', () => {
  const sendMessageMock = jest.fn()
  const ctx: any = {
    telegram: { sendMessage: sendMessageMock },
    from: { id: 42 },
  }
  const testError = new Error('oops')

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('sends Russian message when isRu true', () => {
    errorMessage(ctx, testError, true)
    expect(sendMessageMock).toHaveBeenCalledWith(
      '42',
      `❌ Произошла ошибка.\n\nОшибка: ${testError.message}`
    )
  })

  it('sends English message when isRu false', () => {
    errorMessage(ctx, testError, false)
    expect(sendMessageMock).toHaveBeenCalledWith(
      '42',
      `❌ An error occurred.\n\nError: ${testError.message}`
    )
  })
})
