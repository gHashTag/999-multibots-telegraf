import { ModeEnum } from './price/types/modes'
import { TransactionType } from '@/interfaces/payments.interface'
export const TEST_PAYMENT_CONFIG = {
  // Тестовые суммы платежей
  amounts: {
    small: 100,
    medium: 1000,
    large: 5000,
  },

  // Коэффициенты конвертации в звезды
  starConversion: {
    rate: 100, // 1 рубль = 100 звезд
  },

  // Тестовые сервисы
  services: [
    ModeEnum.NeuroPhoto,
    ModeEnum.TextToImage,
    ModeEnum.TextToVideo,
    ModeEnum.ImageToVideo,
  ],

  // Тестовые статусы платежей
  statuses: ['PENDING', 'COMPLETED', 'FAILED', 'CANCELLED'],

  // Тестовые платежные методы
  paymentMethods: ['Robokassa', 'Manual', 'System'],

  // Тестовые типы транзакций
  transactionTypes: [
    TransactionType.MONEY_INCOME,
    TransactionType.MONEY_EXPENSE,
    TransactionType.SUBSCRIPTION_PURCHASE,
    TransactionType.BONUS,
    TransactionType.REFUND,
  ],

  // Тестовые данные пользователя
  testUser: {
    initialBalance: 1000,
    language: 'ru',
    botName: 'test_bot',
  },

  // Тестовые уведомления
  notifications: {
    adminChannelId: '-4166575919',
    templates: {
      ru: {
        success: '💸 Пользователь получил {stars} звезд за {amount} рублей.',
        failed: '❌ Ошибка при обработке платежа на сумму {amount} рублей.',
      },
      en: {
        success: '💸 User received {stars} stars for {amount} RUB.',
        failed: '❌ Error processing payment for {amount} RUB.',
      },
    },
  },
}
