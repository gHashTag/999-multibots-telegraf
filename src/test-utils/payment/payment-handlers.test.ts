import { TestRunner } from '../TestRunner'
import { TEST_CONFIG } from '../test-config'
import { logger } from '@/utils/logger'

import { handleSuccessfulPayment } from '@/handlers/paymentHandlers'

describe('🏦 Payment Handlers Tests', () => {
  const runner = new TestRunner()

  beforeAll(async () => {
    await runner.init()
    logger.info('🚀 Payment handlers tests started')
    runner.registerHandler('handleSuccessfulPayment', handleSuccessfulPayment)
  })

  afterAll(async () => {
    await runner.cleanup()
    logger.info('🏁 Payment handlers tests completed')
  })

  describe('💰 handleSuccessfulPayment', () => {
    it('✅ должен обработать успешный платеж с подпиской', async () => {
      const testCase = {
        name: 'Successful payment with subscription',
        input: {
          chat: { id: TEST_CONFIG.user.telegramId },
          from: {
            id: TEST_CONFIG.user.telegramId,
            username: 'testuser',
          },
          message: {
            successful_payment: {
              total_amount: 1000,
              invoice_payload: 'test_payload',
            },
          },
          session: {
            subscription: 'premium',
            telegram_id: TEST_CONFIG.user.telegramId,
            email: 'test@test.com',
            buttons: [],
          },
          botInfo: {
            username: TEST_CONFIG.bot.name,
          },
        },
      }

      const result = await runner.runTestCase({
        testCase,
        handler: 'handleSuccessfulPayment',
        expectedCalls: {
          inngest: [
            {
              name: 'payment/process',
              data: {
                telegram_id: TEST_CONFIG.user.telegramId,
                type: 'income',
                bot_name: TEST_CONFIG.bot.name,
              },
            },
          ],
          supabase: [
            {
              function: 'updateUserSubscription',
              args: [TEST_CONFIG.user.telegramId, 'premium'],
            },
          ],
        },
        expectedMessages: [
          message =>
            message.includes('Спасибо за покупку') ||
            message.includes('Thank you for your purchase'),
        ],
      })

      expect(result.success).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('✅ должен обработать успешный платеж без подписки (просто пополнение)', async () => {
      const testCase = {
        name: 'Successful payment without subscription',
        input: {
          chat: { id: TEST_CONFIG.user.telegramId },
          from: {
            id: TEST_CONFIG.user.telegramId,
            username: 'testuser',
          },
          message: {
            successful_payment: {
              total_amount: 500,
              invoice_payload: 'balance_top_up',
            },
          },
          session: {
            subscription: '',
            telegram_id: TEST_CONFIG.user.telegramId,
            email: 'test@test.com',
            buttons: [],
          },
          botInfo: {
            username: TEST_CONFIG.bot.name,
          },
        },
      }

      const result = await runner.runTestCase({
        testCase,
        handler: 'handleSuccessfulPayment',
        expectedCalls: {
          inngest: [
            {
              name: 'payment/process',
              data: {
                telegram_id: TEST_CONFIG.user.telegramId,
                type: 'income',
                description: 'Пополнение баланса через Telegram',
                bot_name: TEST_CONFIG.bot.name,
              },
            },
          ],
        },
        expectedMessages: [
          message =>
            message.includes('баланс пополнен') ||
            message.includes('balance has been replenished'),
        ],
      })

      expect(result.success).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('❌ должен корректно обработать ошибку при отсутствии chat', async () => {
      const testCase = {
        name: 'Payment without chat',
        input: {
          from: {
            id: TEST_CONFIG.user.telegramId,
            username: 'testuser',
          },
          message: {
            successful_payment: {
              total_amount: 1000,
              invoice_payload: 'test_payload',
            },
          },
          session: {
            subscription: 'premium',
            telegram_id: TEST_CONFIG.user.telegramId,
            email: 'test@test.com',
            buttons: [],
          },
        },
      }

      const result = await runner.runTestCase({
        testCase,
        handler: 'handleSuccessfulPayment',
        expectedLogs: [
          {
            level: 'error',
            message: '❌ Update does not belong to a chat',
          },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('❌ должен корректно обработать ошибку при неверном формате платежа', async () => {
      const testCase = {
        name: 'Invalid payment format',
        input: {
          chat: { id: TEST_CONFIG.user.telegramId },
          from: {
            id: TEST_CONFIG.user.telegramId,
            username: 'testuser',
          },
          message: {
            successful_payment: null,
          },
          session: {
            subscription: 'premium',
            telegram_id: TEST_CONFIG.user.telegramId,
            email: 'test@test.com',
            buttons: [],
          },
        },
      }

      const result = await runner.runTestCase({
        testCase,
        handler: 'handleSuccessfulPayment',
        expectedLogs: [
          {
            level: 'error',
            message: message =>
              message.includes('Ошибка при обработке платежа'),
          },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.error).toBeUndefined()
    })
  })
})
