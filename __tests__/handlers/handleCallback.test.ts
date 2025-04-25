import { handleCallback } from '@/handlers/handleCallback'
import { sendGenericErrorMessage } from '@/menu'
import { MyContext } from '@/interfaces'

// Создаем мок для sendGenericErrorMessage
jest.mock('@/menu', () => ({
  sendGenericErrorMessage: jest.fn()
}))

// Типизируем мок
const mockedSendGenericError = jest.mocked(sendGenericErrorMessage)

/**
 * Создает мок-контекст с настраиваемыми параметрами
 */
const createMockContext = (options: {
  callbackQuery?: any
  fromLanguage?: string
  answerCbQueryFn?: jest.Mock
} = {}) => {
  return {
    from: {
      id: 1,
      is_bot: false,
      first_name: 'Test',
      username: 'testuser',
      language_code: options.fromLanguage || 'ru',
    },
    chat: { 
      id: 1, 
      type: 'private', 
      first_name: 'Test',
      username: 'testuser' 
    },
    callbackQuery: options.callbackQuery,
    answerCbQuery: options.answerCbQueryFn || jest.fn().mockResolvedValue(true),
  } as unknown as MyContext
}

describe('handleCallback', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should successfully answer callback query with valid data', async () => {
    const ctx = createMockContext({
      callbackQuery: { data: 'test_data' }
    })
    
    await expect(handleCallback(ctx)).resolves.toBeUndefined()
    expect(ctx.answerCbQuery).toHaveBeenCalled()
  })

  it('should still return on valid data but handle errors when answering callback query', async () => {
    const answerError = new Error('Failed to answer callback query')
    const answerCbQueryMock = jest.fn().mockRejectedValue(answerError)
    
    const ctx = createMockContext({
      callbackQuery: { data: 'test_data' },
      answerCbQueryFn: answerCbQueryMock
    })
    
    await expect(handleCallback(ctx)).resolves.toBeUndefined()
    expect(ctx.answerCbQuery).toHaveBeenCalled()
  })

  it('should throw error when callback query is missing', async () => {
    const ctx = createMockContext({
      callbackQuery: undefined
    })
    
    await expect(handleCallback(ctx)).rejects.toThrow('No callback query')
  })

  it('should throw error when callback query data is missing', async () => {
    const ctx = createMockContext({
      callbackQuery: { data: '' }
    })
    
    await expect(handleCallback(ctx)).rejects.toThrow('No callback query data')
  })

  it('should throw error and call sendGenericErrorMessage when answer callback query fails', async () => {
    const answerError = new Error('Failed to answer callback query')
    const answerCbQueryMock = jest.fn()
      .mockRejectedValueOnce(answerError) // Первый вызов в блоке try
      .mockRejectedValueOnce(answerError) // Второй вызов в блоке catch

    const ctx = createMockContext({
      callbackQuery: undefined,
      answerCbQueryFn: answerCbQueryMock
    })
    
    try {
      await handleCallback(ctx)
      fail('Should have thrown an error')
    } catch (error) {
      // Ошибка должна быть выброшена, это ожидаемое поведение
    }
    
    expect(mockedSendGenericError).toHaveBeenCalledWith(
      expect.objectContaining(ctx),
      expect.any(Boolean),
      expect.any(Error)
    )
  })
})
