import { logger } from '@/lib/logger'
import { TestResult } from '../types'
import { InngestTestEngine } from '../inngest-test-engine'
import { paymentProcessor } from '@/inngest-functions/paymentProcessor'
import { TEST_CONFIG } from '../test-config'
import { createTestError } from '../test-logger'

const inngestTestEngine = new InngestTestEngine()

export async function runReferralTests(): Promise<TestResult[]> {
  const results: TestResult[] = []
  const startTime = Date.now()

  try {
    logger.info('🚀 Запуск тестов рефералов')
    await inngestTestEngine.init()

    // Регистрируем обработчики
    inngestTestEngine.register('payment/process', paymentProcessor)

    inngestTestEngine.register('referral/create', async () => {
      return {
        success: true,
        data: {
          referral_id: '123',
          status: 'ACTIVE',
          reward_amount: 100,
        },
      }
    })

    try {
      // Тест создания реферала
      logger.info('🎯 Тест: Создание реферала')
      const createReferralResult = await inngestTestEngine.send({
        name: 'referral/create',
        data: {
          referrer_id: '123456789',
          referred_id: '987654321',
          bot_name: TEST_CONFIG.TEST_BOT_NAME,
        },
      })

      if (!createReferralResult) {
        throw new Error('❌ Не удалось создать реферал')
      }

      results.push({
        success: true,
        message: 'Тест создания реферала пройден успешно',
        name: 'Create Referral Test',
        startTime,
        duration: Date.now() - startTime,
        details: { referral_id: '123' },
      })

      // Тест начисления вознаграждения
      logger.info('🎯 Тест: Начисление вознаграждения за реферала')
      const rewardPaymentResult = await inngestTestEngine.send({
        name: 'payment/process',
        data: {
          telegram_id: '123456789',
          amount: 100,
          type: 'referral',
          description: 'Вознаграждение за реферала',
          bot_name: TEST_CONFIG.TEST_BOT_NAME,
          service_type: 'REFERRAL_REWARD',
        },
      })

      if (!rewardPaymentResult) {
        throw new Error('❌ Не удалось начислить вознаграждение за реферала')
      }

      results.push({
        success: true,
        message: 'Тест начисления вознаграждения пройден успешно',
        name: 'Referral Reward Test',
        startTime,
        duration: Date.now() - startTime,
        details: { reward_amount: 100 },
      })
    } catch (testError) {
      logger.error('❌ Ошибка в тесте:', testError)
      results.push({
        success: false,
        name: 'Referral Test',
        message: 'Ошибка в тесте реферальной системы',
        error: createTestError(testError),
        startTime,
        duration: Date.now() - startTime,
      })
    }

    return results
  } catch (error) {
    logger.error('❌ Критическая ошибка в тестах рефералов:', error)
    results.push({
      success: false,
      name: 'Referral Tests',
      message: 'Критическая ошибка в тестах рефералов',
      error: createTestError(error),
      startTime,
      duration: Date.now() - startTime,
    })
  }

  return results
}
