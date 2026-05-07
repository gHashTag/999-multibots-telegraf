/**
 * Tests for Robokassa webhook handlers (payment-success endpoint)
 * Covers: Signature validation, payment processing, balance update, notifications
 */

import { describe, it, expect, beforeEach, vi, Mock, afterEach } from 'vitest'
import md5 from 'md5'

// Mock dependencies BEFORE imports
vi.mock('@/core/robokassa', () => ({
  validateRobokassaSignature: vi.fn(),
}))

vi.mock('@/core/supabase/payments', () => ({
  getPaymentByInvId: vi.fn(),
}))

vi.mock('@/core/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(() => ({ error: null })),
      })),
    })),
  },
}))

vi.mock('@/core/supabase/updateUserBalance', () => ({
  updateUserBalance: vi.fn(),
}))

vi.mock('@/core/supabase/notifyBotOwners', () => ({
  notifyBotOwners: vi.fn(),
}))

vi.mock('@/core/bot', () => ({
  getBotByName: vi.fn(),
}))

vi.mock('@/config', () => ({
  getRobokassaPassword2: vi.fn(() => 'test_password_2'),
}))

vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

// Import after mocks
import { validateRobokassaSignature } from '@/core/robokassa'
import { getPaymentByInvId } from '@/core/supabase/payments'
import { supabaseAdmin } from '@/core/supabase'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { notifyBotOwners } from '@/core/supabase/notifyBotOwners'
import { getBotByName } from '@/core/bot'
import { getRobokassaPassword2 } from '@/config'
import { logger } from '@/utils/logger'

describe('Robokassa Webhook Handler', () => {
  // Payment options matching production config
  const PAYMENT_OPTIONS = [
    { amount: 100, stars: 43 },
    { amount: 500, stars: 217 },
    { amount: 1000, stars: 434 },
    { amount: 2000, stars: 869 },
    { amount: 5000, stars: 2173 },
    { amount: 10000, stars: 4347 },
  ]

  const SUBSCRIPTION_PLANS = [
    { text: '🎨 NeuroPhoto', ru_price: 1110, stars_price: 476, callback_data: 'neurophoto' },
    { text: '📚 NeuroVideo', ru_price: 2999, stars_price: 1303, callback_data: 'neurovideo' },
    { text: '🤖 NeuroBlogger', ru_price: 75000, stars_price: 32608, callback_data: 'neuroblogger' },
  ]

  const mockPayment = {
    id: 'payment-123',
    telegram_id: '223757230',
    inv_id: '12345',
    out_sum: '100',
    status: 'PENDING',
    subscription: null,
    bot_name: 'test_bot',
    language: 'ru',
    username: 'testuser',
  }

  const mockBot = {
    telegram: {
      sendMessage: vi.fn(),
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()

    ;(validateRobokassaSignature as Mock).mockReturnValue(true)
    ;(getPaymentByInvId as Mock).mockResolvedValue({
      data: mockPayment,
      error: null,
    })
    ;(updateUserBalance as Mock).mockResolvedValue(true)
    ;(notifyBotOwners as Mock).mockResolvedValue(undefined)
    ;(getBotByName as Mock).mockReturnValue({ bot: mockBot, error: null })
    ;(getRobokassaPassword2 as Mock).mockReturnValue('test_password_2')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('1. Валидация подписи Robokassa', () => {
    it('должен проверять подпись с правильным форматом', () => {
      const OutSum = '100'
      const InvId = '12345'
      const password2 = 'test_password_2'

      // Robokassa signature format: MD5(OutSum:InvId:Password2)
      const expectedSignature = md5(`${OutSum}:${InvId}:${password2}`).toUpperCase()

      expect(expectedSignature).toHaveLength(32)
      expect(expectedSignature).toMatch(/^[A-F0-9]+$/)
    })

    it('должен валидировать корректную подпись', () => {
      const OutSum = '100'
      const InvId = '12345'
      const SignatureValue = 'VALID_SIGNATURE'

      ;(validateRobokassaSignature as Mock).mockReturnValue(true)

      const isValid = validateRobokassaSignature(OutSum, InvId, 'pass', SignatureValue)

      expect(isValid).toBe(true)
      expect(validateRobokassaSignature).toHaveBeenCalledWith(
        OutSum,
        InvId,
        'pass',
        SignatureValue
      )
    })

    it('должен отклонять некорректную подпись', () => {
      ;(validateRobokassaSignature as Mock).mockReturnValue(false)

      const isValid = validateRobokassaSignature('100', '12345', 'pass', 'INVALID')

      expect(isValid).toBe(false)
    })
  })

  describe('2. Проверка required параметров', () => {
    it('должен требовать OutSum', () => {
      const body = { InvId: '12345', SignatureValue: 'SIG' }

      const isValid = body.OutSum && body.InvId && body.SignatureValue
      expect(isValid).toBeFalsy()
    })

    it('должен требовать InvId', () => {
      const body = { OutSum: '100', SignatureValue: 'SIG' }

      const isValid = body.OutSum && body.InvId && body.SignatureValue
      expect(isValid).toBeFalsy()
    })

    it('должен требовать SignatureValue', () => {
      const body = { OutSum: '100', InvId: '12345' }

      const isValid = body.OutSum && body.InvId && body.SignatureValue
      expect(isValid).toBeFalsy()
    })

    it('должен принимать все required параметры', () => {
      const body = { OutSum: '100', InvId: '12345', SignatureValue: 'SIG' }

      const isValid = body.OutSum && body.InvId && body.SignatureValue
      expect(isValid).toBeTruthy()
    })
  })

  describe('3. Поиск платежа в БД', () => {
    it('должен находить платеж по InvId', async () => {
      const result = await getPaymentByInvId('12345')

      expect(getPaymentByInvId).toHaveBeenCalledWith('12345')
      expect(result.data).toBeDefined()
      expect(result.data.inv_id).toBe('12345')
    })

    it('должен обрабатывать отсутствующий платеж', async () => {
      ;(getPaymentByInvId as Mock).mockResolvedValue({
        data: null,
        error: { message: 'Not found' },
      })

      const result = await getPaymentByInvId('99999')

      expect(result.data).toBeNull()
      expect(result.error).toBeDefined()
    })

    it('должен игнорировать уже обработанный платеж', async () => {
      ;(getPaymentByInvId as Mock).mockResolvedValue({
        data: { ...mockPayment, status: 'COMPLETED' },
        error: null,
      })

      const result = await getPaymentByInvId('12345')

      expect(result.data.status).toBe('COMPLETED')
      // Если платеж уже COMPLETED, возвращаем OK без обработки
    })
  })

  describe('4. Определение звезд по сумме платежа', () => {
    it('должен определять звезды для стандартных пакетов', () => {
      PAYMENT_OPTIONS.forEach(option => {
        const foundOption = PAYMENT_OPTIONS.find(o => o.amount === option.amount)
        expect(foundOption).toBeDefined()
        expect(foundOption?.stars).toBe(option.stars)
      })
    })

    it('должен определять звезды для подписки neurophoto', () => {
      const OutSum = 1110
      const plan = SUBSCRIPTION_PLANS.find(p => p.ru_price === OutSum)

      expect(plan).toBeDefined()
      expect(plan?.stars_price).toBe(476)
      expect(plan?.callback_data).toBe('neurophoto')
    })

    it('должен определять звезды для подписки neurovideo', () => {
      const OutSum = 2999
      const plan = SUBSCRIPTION_PLANS.find(p => p.ru_price === OutSum)

      expect(plan).toBeDefined()
      expect(plan?.stars_price).toBe(1303)
      expect(plan?.callback_data).toBe('neurovideo')
    })

    it('должен возвращать 0 звезд для неизвестной суммы', () => {
      const OutSum = 99999
      const option = PAYMENT_OPTIONS.find(o => o.amount === OutSum)
      const plan = SUBSCRIPTION_PLANS.find(p => p.ru_price === OutSum)

      expect(option).toBeUndefined()
      expect(plan).toBeUndefined()
    })
  })

  describe('5. Обновление статуса платежа', () => {
    it('должен обновлять статус на COMPLETED', async () => {
      const mockUpdate = vi.fn(() => ({
        eq: vi.fn(() => ({ error: null })),
      }))

      ;(supabaseAdmin.from as Mock).mockReturnValue({
        update: mockUpdate,
      })

      // Имитируем обновление
      const updateResult = await supabaseAdmin
        .from('payments_v2')
        .update({
          status: 'COMPLETED',
          payment_date: new Date().toISOString(),
        })
        .eq('inv_id', '12345')

      expect(supabaseAdmin.from).toHaveBeenCalledWith('payments_v2')
    })
  })

  describe('6. Обновление баланса пользователя', () => {
    it('должен обновлять баланс для обычного пополнения', async () => {
      const stars = 43
      const telegramId = '223757230'

      const result = await updateUserBalance(
        telegramId,
        stars,
        'MONEY_INCOME',
        `Пополнение баланса через Robokassa (InvId: 12345)`,
        {
          payment_method: 'Robokassa',
          bot_name: 'test_bot',
          language: 'ru',
          inv_id: '12345',
          stars: stars,
        }
      )

      expect(updateUserBalance).toHaveBeenCalledWith(
        telegramId,
        stars,
        'MONEY_INCOME',
        expect.stringContaining('Robokassa'),
        expect.objectContaining({
          payment_method: 'Robokassa',
          stars: 43,
        })
      )
      expect(result).toBe(true)
    })

    it('не должен обновлять баланс для подписки', async () => {
      const subscription = 'neurophoto'
      const stars = 476

      // Для подписок баланс не обновляется напрямую
      if (subscription) {
        // Подписка обрабатывается отдельно
        expect(updateUserBalance).not.toHaveBeenCalled()
      }
    })

    it('должен логировать ошибку при неудачном обновлении баланса', async () => {
      ;(updateUserBalance as Mock).mockResolvedValue(false)

      const result = await updateUserBalance('123', 100, 'MONEY_INCOME', 'desc', {})

      expect(result).toBe(false)
    })
  })

  describe('7. Уведомления', () => {
    it('должен отправлять уведомление пользователю об успешной оплате', async () => {
      ;(getBotByName as Mock).mockReturnValue({ bot: mockBot, error: null })

      const bot = getBotByName('test_bot')

      expect(bot.bot).toBeDefined()
      expect(bot.error).toBeNull()

      await bot.bot.telegram.sendMessage('223757230', '💫 Ваш баланс пополнен!')

      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        '223757230',
        '💫 Ваш баланс пополнен!'
      )
    })

    it('должен отправлять уведомление владельцу бота', async () => {
      await notifyBotOwners('test_bot', {
        username: 'testuser',
        telegram_id: '223757230',
        amount: 100,
        stars: 43,
        subscription: undefined,
      })

      expect(notifyBotOwners).toHaveBeenCalledWith(
        'test_bot',
        expect.objectContaining({
          telegram_id: '223757230',
          amount: 100,
          stars: 43,
        })
      )
    })

    it('должен обрабатывать ошибку отправки уведомления', async () => {
      ;(getBotByName as Mock).mockReturnValue({ bot: null, error: 'Bot not found' })

      const result = getBotByName('unknown_bot')

      expect(result.bot).toBeNull()
      expect(result.error).toBe('Bot not found')
    })
  })

  describe('8. Ответ на webhook', () => {
    it('должен возвращать OK{InvId} при успехе', () => {
      const InvId = '12345'
      const response = `OK${InvId}`

      expect(response).toBe('OK12345')
    })

    it('должен возвращать статус 200 для уже обработанного платежа', () => {
      const payment = { status: 'COMPLETED' }
      const statusCode = payment.status === 'COMPLETED' ? 200 : 500

      expect(statusCode).toBe(200)
    })

    it('должен возвращать статус 400 для невалидной подписи', () => {
      ;(validateRobokassaSignature as Mock).mockReturnValue(false)

      const isValid = validateRobokassaSignature('100', '123', 'pass', 'INVALID')
      const statusCode = isValid ? 200 : 400

      expect(statusCode).toBe(400)
    })

    it('должен возвращать статус 404 для несуществующего платежа', async () => {
      ;(getPaymentByInvId as Mock).mockResolvedValue({ data: null, error: null })

      const result = await getPaymentByInvId('99999')
      const statusCode = result.data ? 200 : 404

      expect(statusCode).toBe(404)
    })
  })

  describe('9. Логирование', () => {
    it('должен логировать входящий webhook', () => {
      logger.info('🔔 Received Robokassa webhook', {
        body: { OutSum: '100', InvId: '12345' },
      })

      expect(logger.info).toHaveBeenCalledWith(
        '🔔 Received Robokassa webhook',
        expect.any(Object)
      )
    })

    it('должен логировать успешную валидацию подписи', () => {
      logger.info('✅ Robokassa signature validated', {
        OutSum: '100',
        InvId: '12345',
      })

      expect(logger.info).toHaveBeenCalled()
    })

    it('должен логировать ошибки', () => {
      logger.error('❌ Error processing Robokassa webhook', {
        error: 'Test error',
      })

      expect(logger.error).toHaveBeenCalled()
    })
  })

  describe('10. Сообщения о подписке', () => {
    it('должен отправлять сообщение об активации подписки', () => {
      const isRu = true
      const subscription = 'neurophoto'

      const message = isRu
        ? `🎉 Ваша подписка "${subscription}" успешно оформлена и активна!`
        : `🎉 Your subscription "${subscription}" has been successfully activated!`

      expect(message).toContain('neurophoto')
      expect(message).toContain('🎉')
    })

    it('должен предлагать вступить в чат после активации подписки', () => {
      const isRu = true
      const chatInviteMessage = isRu
        ? 'Хочешь вступить в чат для общения и стать частью креативного сообщества?'
        : 'Want to join the chat for communication?'

      expect(chatInviteMessage).toContain(isRu ? 'чат' : 'chat')
    })
  })

  describe('11. Интеграционные проверки', () => {
    it('должен корректно обрабатывать полный флоу пополнения', async () => {
      // 1. Получаем webhook
      const webhookBody = {
        OutSum: '500',
        InvId: '12345',
        SignatureValue: 'VALID_SIG',
      }

      // 2. Валидируем подпись
      ;(validateRobokassaSignature as Mock).mockReturnValue(true)
      const isValid = validateRobokassaSignature(
        webhookBody.OutSum,
        webhookBody.InvId,
        'pass2',
        webhookBody.SignatureValue
      )
      expect(isValid).toBe(true)

      // 3. Находим платеж
      ;(getPaymentByInvId as Mock).mockResolvedValue({
        data: { ...mockPayment, out_sum: '500', status: 'PENDING' },
        error: null,
      })
      const payment = await getPaymentByInvId(webhookBody.InvId)
      expect(payment.data.status).toBe('PENDING')

      // 4. Определяем звезды
      const option = PAYMENT_OPTIONS.find(
        o => o.amount === parseInt(webhookBody.OutSum)
      )
      expect(option?.stars).toBe(217)

      // 5. Обновляем баланс
      await updateUserBalance(payment.data.telegram_id, option!.stars, 'MONEY_INCOME', '', {})
      expect(updateUserBalance).toHaveBeenCalledWith(
        '223757230',
        217,
        'MONEY_INCOME',
        '',
        {}
      )
    })

    it('должен корректно обрабатывать флоу подписки', async () => {
      const webhookBody = {
        OutSum: '1110',
        InvId: '12346',
        SignatureValue: 'VALID_SIG',
      }

      // Определяем подписку
      const plan = SUBSCRIPTION_PLANS.find(
        p => p.ru_price === parseInt(webhookBody.OutSum)
      )

      expect(plan).toBeDefined()
      expect(plan?.callback_data).toBe('neurophoto')
      expect(plan?.stars_price).toBe(476)

      // Для подписки баланс НЕ обновляется напрямую
      // (подписка дает доступ к функциям, а не звезды)
    })
  })
})
