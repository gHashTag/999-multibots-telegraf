import { PostgrestSingleResponse, PostgrestError } from '@supabase/supabase-js'
import { Payment } from '@/interfaces'

// Пример успешного ответа для setPayments
// Ты можешь настроить данные по умолчанию как тебе нужно
export const setPaymentsSuccessResponse: PostgrestSingleResponse<Payment[]> = {
  data: [
    {
      id: 1,
      created_at: new Date().toISOString(),
      user_id: 'uuid-user-123',
      telegram_id: '123456789',
      payment_method: 'Robokassa', // или 'TelegramStars'
      status: 'PENDING', // или 'SUCCESS'
      currency: 'RUB', // или 'STARS'
      out_sum: '100', // Сумма в валюте платежа
      stars: 50, // Количество звезд (может быть равно out_sum для STARS)
      inv_id: 'mockInvId123', // ID инвойса/транзакции
      signature_value: 'mocksigvalue', // Только для Robokassa
      subscription: 'stars', // 'stars', 'neurobase', etc.
      bot_name: 'test_bot',
      language: 'ru',
      email: null, // Добавляем опциональные поля
      is_test: null,
      receipt_url: null,
      shp_item: null,
    },
  ],
  error: null,
  count: 1,
  status: 201, // Created
  statusText: 'Created',
}

// Пример ответа с ошибкой для setPayments
export const setPaymentsErrorResponse: PostgrestSingleResponse<Payment[]> = {
  data: null,
  error: {
    message: 'Database error occurred',
    details: 'Error details',
    hint: 'Error hint',
    code: 'DB500',
  } as PostgrestError,
  count: null,
  status: 500,
  statusText: 'Internal Server Error',
}

// Можешь добавить другие моки ответов Supabase сюда же
