/**
 * PAYMENT FUNCTIONS FIXTURES
 *
 * Тестовые данные для payment функций:
 * - paymentProcessing
 */

export const paymentProcessingData = {
  valid_stars: {
    telegram_id: '123456789',
    payment_method: 'stars',
    amount: 100,
    stars: 350,
    service_type: 'neurovideo',
    invoice_id: 'inv_stars_123',
  },

  valid_money: {
    telegram_id: '123456789',
    payment_method: 'money',
    amount: 500,
    currency: 'RUB',
    service_type: 'ai_photo',
    invoice_id: 'inv_money_456',
  },

  valid_bonus: {
    telegram_id: '123456789',
    payment_method: 'bonus',
    amount: 100,
    service_type: 'morphing',
    invoice_id: 'inv_bonus_789',
  },

  valid_subscription: {
    telegram_id: '123456789',
    payment_method: 'subscription',
    amount: 990,
    currency: 'RUB',
    service_type: 'pro',
    plan_id: 'pro_monthly',
    invoice_id: 'inv_sub_101',
  },

  invalid_missing_data: {
    telegram_id: '123456789',
    payment_method: '',
  },
}

export const paymentExpectedResults = {
  success_stars: {
    success: true,
    transaction_id: 'tx_stars_123',
    payment_method: 'stars',
    amount: 100,
    new_balance: 1000,
  },

  success_money: {
    success: true,
    transaction_id: 'tx_money_456',
    payment_method: 'money',
    amount: 500,
    currency: 'RUB',
    new_balance: 1500,
  },

  success_bonus: {
    success: true,
    transaction_id: 'tx_bonus_789',
    payment_method: 'bonus',
    bonus_added: 100,
    new_bonus_balance: 200,
  },

  error_insufficient_funds: {
    success: false,
    error: 'Insufficient funds',
  },

  error_duplicate_invoice: {
    success: false,
    error: 'Duplicate invoice',
  },
}

export const paymentErrors = {
  insufficient_funds: {
    code: 'INSUFFICIENT_FUNDS',
    message: 'Недостаточно средств',
  },

  duplicate_invoice: {
    code: 'DUPLICATE_INVOICE',
    message: 'Счёт уже обработан',
  },

  invalid_payment_method: {
    code: 'INVALID_PAYMENT_METHOD',
    message: 'Неверный способ оплаты',
  },

  payment_failed: {
    code: 'PAYMENT_FAILED',
    message: 'Ошибка обработки платежа',
  },

  user_not_found: {
    code: 'USER_NOT_FOUND',
    message: 'Пользователь не найден',
  },
}
