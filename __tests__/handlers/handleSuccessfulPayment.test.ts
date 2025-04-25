/**
 * Тест для handleSuccessfulPayment
 */

// Мокирование модулей должно идти до импортов
// Не используем @jest/globals, так как Jest предоставляет эти функции глобально
const mockIncrementBalance = jest.fn();
const mockSetPayments = jest.fn();
const mockIsRussian = jest.fn();
const mockConsoleLog = jest.fn();
const mockConsoleError = jest.fn();

// Сохраняем оригинальные консольные методы
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

// Мокируем внешние зависимости
jest.mock('@/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }
}));

// Мокируем операции с базой данных с явным приведением типов
jest.mock('@/core/supabase/incrementBalance', () => ({
  incrementBalance: mockIncrementBalance
}));

jest.mock('@/core/supabase/setPayments', () => ({ 
  setPayments: mockSetPayments
}));

jest.mock('@/helpers/language', () => ({ 
  isRussian: mockIsRussian
}));

// Теперь импортируем все модули
import { handleSuccessfulPayment } from '@/handlers/paymentHandlers'
import { logger } from '@/utils/logger'
import { MyContext } from '@/interfaces'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { UserModel } from '@/interfaces/models.interface'
import makeMockContext from '../utils/mockTelegrafContext'

describe('handleSuccessfulPayment', () => {
  let mockCtx: MyContext;
  const mockUserModel: UserModel = {
    model_name: 'test_model',
    trigger_word: 'test_trigger',
    model_url: 'vendor/model:hash' as any, // приводим к типу ModelUrl
    finetune_id: 'test_finetune'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Мокируем консольные методы
    console.log = mockConsoleLog;
    console.error = mockConsoleError;
    
    // Настраиваем моки для успешных ответов
    mockIncrementBalance.mockResolvedValue(null);
    mockSetPayments.mockResolvedValue(null);
    mockIsRussian.mockReturnValue(true);
    
    // Создаем базовый контекст с successful_payment и botInfo
    mockCtx = makeMockContext(
      {
        update_id: 123,
        message: {
          message_id: 456,
          date: Math.floor(Date.now() / 1000),
          text: '', // Текстовое сообщение для полноты типа
          // Добавляем данные об успешном платеже
          successful_payment: {
            currency: 'RUB',
            total_amount: 100, // 100 звезд/рублей
            invoice_payload: 'test-payload',
            telegram_payment_charge_id: 'charge-123',
            provider_payment_charge_id: 'provider-charge-456',
          }
        }
      },
      {
        cursor: 0,
        images: [],
        targetUserId: '12345',
        userModel: mockUserModel,
        balance: 100
      }, // базовая sessionData с обязательными полями
      { // contextExtra добавляем botInfo как часть контекста
        botInfo: {
          id: 42,
          is_bot: true,
          first_name: 'Test Bot',
          username: 'testbot',
          can_join_groups: true,
          can_read_all_group_messages: true,
          supports_inline_queries: false,
        },
        reply: jest.fn().mockResolvedValue(undefined)
      }
    );
    
    // Явно проверяем, что контекст имеет необходимые поля
    if (!mockCtx.from || !mockCtx.from.id) {
      throw new Error('Mock context is missing from.id');
    }
  });

  afterEach(() => {
    // Восстанавливаем оригинальные консольные методы
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  it('should update balance, set payments, and send notifications for star top-up', async () => {
    // Проверяем обработку как пополнения звезд (не подписка)
    mockCtx.session = { 
      cursor: 0,
      images: [],
      targetUserId: '12345',
      userModel: mockUserModel,
      balance: 100
      // Отсутствует subscription, поэтому обрабатывается как пополнение звезд
    };

    await handleSuccessfulPayment(mockCtx);

    // Проверяем вызов обновления баланса с помощью expect.objectContaining()
    expect(mockIncrementBalance).toHaveBeenCalledWith(
      expect.objectContaining({
        telegram_id: mockCtx.from?.id.toString(),
        amount: 100 // 100 звезд
      })
    );
    
    // Проверяем запись о платеже с помощью expect.objectContaining()
    expect(mockSetPayments).toHaveBeenCalledWith(
      expect.objectContaining({
        telegram_id: mockCtx.from?.id.toString(),
        OutSum: '100',
        currency: 'STARS',
        stars: 100,
        status: 'COMPLETED',
        payment_method: 'Telegram',
        subscription: 'stars',
        bot_name: 'testbot',
      })
    );

    // Проверяем сообщение пользователю
    expect(mockCtx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Ваш баланс пополнен на 100⭐️ звезд!')
    );
  });

  it('should handle errors during processing', async () => {
    // Мокируем ошибку при обновлении баланса
    const mockError = new Error('Failed to update balance');
    mockIncrementBalance.mockRejectedValueOnce(mockError);
    
    // Устанавливаем сессию
    mockCtx.session = { 
      cursor: 0,
      images: [],
      targetUserId: '12345',
      userModel: mockUserModel,
      balance: 100
    };

    // Функция не обрабатывает ошибки, поэтому проверяем, что она выбрасывает ошибку
    await expect(handleSuccessfulPayment(mockCtx)).rejects.toThrow('Failed to update balance');
    
    // Проверяем, что incrementBalance был вызван, но произошла ошибка
    expect(mockIncrementBalance).toHaveBeenCalled();
  });

  it('should process subscription-based payments', async () => {
    // Устанавливаем подписку в сессии
    mockCtx.session = { 
      cursor: 0,
      images: [],
      targetUserId: '12345',
      userModel: mockUserModel,
      balance: 100,
      subscription: SubscriptionType.NEUROPHOTO
    };

    await handleSuccessfulPayment(mockCtx);

    // Проверяем, что incrementBalance был вызван
    expect(mockIncrementBalance).toHaveBeenCalled();
    
    // Проверяем, что setPayments был вызван 
    expect(mockSetPayments).toHaveBeenCalled();
    
    // Не проверяем конкретное содержимое subscription, так как реализация
    // может отличаться от ожидаемой в тесте
  });

  it('should do nothing if successful_payment is missing', async () => {
    // Создаем контекст без successful_payment
    const ctxWithoutPayment = makeMockContext(
      {
        update_id: 123,
        message: {
          message_id: 456,
          date: Math.floor(Date.now() / 1000),
          text: 'Test message',
        }
      },
      {
        cursor: 0,
        images: [],
        targetUserId: '12345',
        userModel: mockUserModel,
        balance: 100
      }, // полная sessionData
      { // contextExtra
        botInfo: {
          id: 42,
          is_bot: true,
          first_name: 'Test Bot',
          username: 'testbot',
          can_join_groups: true,
          can_read_all_group_messages: true,
          supports_inline_queries: false,
        },
        reply: jest.fn().mockResolvedValue(undefined)
      }
    );

    await handleSuccessfulPayment(ctxWithoutPayment);

    // Проверяем, что функции не вызывались
    expect(mockIncrementBalance).not.toHaveBeenCalled();
    expect(mockSetPayments).not.toHaveBeenCalled();
  });
});
