import { PreCheckoutQuery } from 'telegraf/typings/core/types/typegram'
import { handlePreCheckoutQuery } from '@/handlers/paymentHandlers/handlePreCheckoutQuery'
import makeMockContext from '../utils/mockTelegrafContext'
import { MyContext } from '@/interfaces'

// Мокаем модуль с логгером
jest.mock('@/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
  },
}))

// Импортируем мокированный модуль логгера
import { logger } from '@/utils/logger'

describe('handlePreCheckoutQuery', () => {
  // Сбрасываем моки перед каждым тестом
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should successfully answer pre-checkout query', async () => {
    // Создаем мок предварительного запроса на оплату
    const mockPreCheckoutQuery: Partial<PreCheckoutQuery> = {
      id: '123',
      from: {
        id: 12345,
        is_bot: false,
        first_name: 'Test',
        username: 'testuser',
        language_code: 'ru',
      },
      currency: 'RUB',
      total_amount: 100,
      invoice_payload: 'test_payload',
    }

    // Создаем контекст с предварительным запросом
    const ctx = makeMockContext(
      { pre_checkout_query: mockPreCheckoutQuery },
      {}
    )
    
    // Дополняем сессию минимальным набором необходимых свойств
    ctx.session = { 
      cursor: 0,
      images: [],
      targetUserId: '12345',
      userModel: {
        name: 'Test Model',
        url: 'test-url',
        description: 'Test Description',
        imageUrl: 'test-image-url'
      }
    } as any;
    
    // Устанавливаем корректные моки для методов контекста
    ctx.answerPreCheckoutQuery = jest.fn(() => Promise.resolve()) as any;

    // Вызываем функцию
    await handlePreCheckoutQuery(ctx as unknown as MyContext)

    // Проверяем, что запрос был подтвержден с true
    expect(ctx.answerPreCheckoutQuery).toHaveBeenCalledWith(true)
    expect(logger.info).not.toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('should handle error when answering pre-checkout query', async () => {
    // Создаем мок предварительного запроса на оплату
    const mockPreCheckoutQuery: Partial<PreCheckoutQuery> = {
      id: '123',
      from: {
        id: 12345,
        is_bot: false,
        first_name: 'Test',
        username: 'testuser',
        language_code: 'ru',
      },
      currency: 'RUB',
      total_amount: 100,
      invoice_payload: 'test_payload',
    }

    // Создаем контекст с предварительным запросом
    const ctx = makeMockContext(
      { pre_checkout_query: mockPreCheckoutQuery },
      {}
    )
    
    // Дополняем сессию минимальным набором необходимых свойств
    ctx.session = { 
      cursor: 0,
      images: [],
      targetUserId: '12345',
      userModel: {
        name: 'Test Model',
        url: 'test-url',
        description: 'Test Description',
        imageUrl: 'test-image-url'
      }
    } as any;

    // Имитируем ошибку при подтверждении запроса
    const error = new Error('Test error')
    
    // Создаем mock-функцию для answerPreCheckoutQuery
    const answerMock = jest.fn();
    // Настраиваем поведение мока
    answerMock.mockRejectedValueOnce(error);
    answerMock.mockResolvedValueOnce(true);
    // Заменяем метод контекста нашим моком
    ctx.answerPreCheckoutQuery = answerMock;

    // Вызываем функцию
    await handlePreCheckoutQuery(ctx as unknown as MyContext)

    // Проверяем, что была логирована ошибка и была предпринята попытка ответить false
    expect(ctx.answerPreCheckoutQuery).toHaveBeenNthCalledWith(1, true)
    expect(ctx.answerPreCheckoutQuery).toHaveBeenNthCalledWith(2, false)
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Error when answering pre checkout query'),
      error
    )
  })

  it('should handle error when answering pre-checkout query with false as well', async () => {
    // Создаем мок предварительного запроса на оплату
    const mockPreCheckoutQuery: Partial<PreCheckoutQuery> = {
      id: '123',
      from: {
        id: 12345,
        is_bot: false,
        first_name: 'Test',
        username: 'testuser',
        language_code: 'ru',
      },
      currency: 'RUB',
      total_amount: 100,
      invoice_payload: 'test_payload',
    }

    // Создаем контекст с предварительным запросом
    const ctx = makeMockContext(
      { pre_checkout_query: mockPreCheckoutQuery },
      {}
    )
    
    // Дополняем сессию минимальным набором необходимых свойств
    ctx.session = { 
      cursor: 0,
      images: [],
      targetUserId: '12345',
      userModel: {
        name: 'Test Model',
        url: 'test-url',
        description: 'Test Description',
        imageUrl: 'test-image-url'
      }
    } as any;

    // Имитируем ошибки при обоих попытках ответа
    const error1 = new Error('Test error 1')
    const error2 = new Error('Test error 2')
    
    // Создаем mock-функцию для answerPreCheckoutQuery
    const answerMock = jest.fn();
    // Настраиваем поведение мока
    answerMock.mockRejectedValueOnce(error1);
    answerMock.mockRejectedValueOnce(error2);
    // Заменяем метод контекста нашим моком
    ctx.answerPreCheckoutQuery = answerMock;

    // Вызываем функцию
    await handlePreCheckoutQuery(ctx as unknown as MyContext)

    // Проверяем логирование обеих ошибок
    expect(ctx.answerPreCheckoutQuery).toHaveBeenNthCalledWith(1, true)
    expect(ctx.answerPreCheckoutQuery).toHaveBeenNthCalledWith(2, false)
    expect(logger.error).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('Error when answering pre checkout query'),
      error1
    )
    expect(logger.error).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('Error when answering pre checkout query with false'),
      error2
    )
  })
})
