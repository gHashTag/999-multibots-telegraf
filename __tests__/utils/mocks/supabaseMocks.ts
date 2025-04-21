import { PostgrestSingleResponse, PostgrestError } from '@supabase/supabase-js'
import {
  Payment,
  PaymentStatus,
  SubscriptionType,
  TransactionType,
  ModeEnum,
} from '@/interfaces' // Основные интерфейсы через алиас
import { TelegramId } from '../../../src/interfaces/telegram.interface'
import { PaymentType } from '../../../src/interfaces/payments.interface'

// Пример успешного ответа для setPayments (insert/update)
export const setPaymentsSuccessResponse: PostgrestSingleResponse<Payment[]> = {
  data: [
    {
      id: 'mock-payment-id-123',
      telegram_id: '456',
      amount: 100,
      stars: 50,
      type: PaymentType.MONEY_INCOME,
      description: 'Test Payment',
      bot_name: 'test_bot',
      service_type: ModeEnum.MenuScene,
      payment_method: 'Robokassa',
      operation_id: 'op-123',
      inv_id: 'inv-123',
      status: PaymentStatus.PENDING,
      metadata: { key: 'value' },
      subscription: SubscriptionType.STARS,
      payment_id: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
  count: 1,
  status: 201,
  statusText: 'Created',
  error: null,
}

// Пример ответа с ошибкой для setPayments
export const setPaymentsErrorResponse: PostgrestSingleResponse<Payment[]> = {
  data: null,
  count: null,
  status: 500,
  statusText: 'Internal Server Error',
  error: {
    message: 'Database error during payment processing',
    details: '...',
    hint: '...',
    code: 'DB500',
    name: 'PostgrestError', // Добавляем недостающее поле name
  },
}

// Можешь добавить другие моки ответов Supabase сюда же
