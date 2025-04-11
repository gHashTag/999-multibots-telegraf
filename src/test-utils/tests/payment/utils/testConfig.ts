import { ModeEnum } from '@/price/helpers/modelsCost'
import { TransactionType } from '@/interfaces/payments.interface'

/**
 * Конфигурация для тестов платежной системы
 */
export const TEST_PAYMENT_CONFIG = {
  // Тестовые суммы платежей
  amounts: {
    small: 100, // Маленькая сумма
    medium: 1000, // Средняя сумма
    large: 5000, // Большая сумма
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
    initialBalance: 1000, // Начальный баланс
    language: 'ru', // Язык пользователя
    botName: 'test_bot', // Имя бота
  },

  // Тестовые уведомления
  notifications: {
    adminChannelId: '-4166575919', // ID канала администратора
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

  // Максимальное время ожидания для тестов (в миллисекундах)
  timeouts: {
    short: 1000, // Короткое ожидание
    medium: 3000, // Среднее ожидание
    long: 10000, // Длинное ожидание
  },

  // Количество попыток для операций
  retries: {
    payment: 3, // Количество попыток для платежных операций
    balance: 2, // Количество попыток для операций с балансом
  },
}
