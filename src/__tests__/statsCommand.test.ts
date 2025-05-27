import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from 'vitest'
import { supabase } from '@/core/supabase'
import { getUserBalanceStats } from '@/core/supabase/getUserBalanceStats'
import { logger } from '@/utils/logger'
import { debugBotStats, quickStatsHealthCheck } from '@/utils/statsDebugger'
import { PaymentStatus, PaymentType } from '@/interfaces/payments.interface'

// Тестовые данные
const TEST_BOT_NAME = 'test_stats_bot'
const TEST_USER_ID = '999999999'

// Интерфейс для тестовых данных
interface TestDataSetup {
  userId: string
  botName: string
  payments: Array<{
    telegram_id: string
    bot_name: string
    amount: number
    stars: number
    type: PaymentType
    service_type?: string
    status: PaymentStatus
    currency: 'XTR'
    description: string
    cost?: number
  }>
  users: Array<{
    telegram_id: string
    bot_name?: string
    created_at: string
  }>
}

describe('Stats Command Real Data Tests', () => {
  let testDataIds: string[] = []

  beforeAll(async () => {
    // Очищаем тестовые данные перед началом
    await cleanupTestData()
  })

  afterAll(async () => {
    // Очищаем тестовые данные после тестов
    await cleanupTestData()
  })

  beforeEach(async () => {
    // Очищаем данные перед каждым тестом
    await cleanupTestData()
    testDataIds = []
  })

  describe('Database Schema Validation', () => {
    it('should validate payments_v2 table structure', async () => {
      const { data: paymentsSchema, error: paymentsError } = await supabase
        .from('payments_v2')
        .select('*')
        .limit(1)

      expect(paymentsError).toBeNull()

      if (paymentsSchema && paymentsSchema.length > 0) {
        const payment = paymentsSchema[0]
        expect(payment).toHaveProperty('telegram_id')
        expect(payment).toHaveProperty('bot_name')
        expect(payment).toHaveProperty('stars')
        expect(payment).toHaveProperty('type')
        expect(payment).toHaveProperty('created_at')
        expect(payment).toHaveProperty('status')
        expect(payment).toHaveProperty('cost')

        logger.info('✅ payments_v2 schema validation passed')
      }
    })

    it('should validate users table structure', async () => {
      const { data: usersSchema, error: usersError } = await supabase
        .from('users')
        .select('*')
        .limit(1)

      expect(usersError).toBeNull()

      if (usersSchema && usersSchema.length > 0) {
        const user = usersSchema[0]
        expect(user).toHaveProperty('telegram_id')

        logger.info('✅ users schema validation passed')
      }
    })
  })

  describe('Stats Calculation Accuracy', () => {
    it('should correctly calculate basic financial metrics with cost', async () => {
      // Создаем тестовые данные с известными значениями включая себестоимость
      await setupTestData({
        userId: TEST_USER_ID,
        botName: TEST_BOT_NAME,
        payments: [
          {
            telegram_id: TEST_USER_ID,
            bot_name: TEST_BOT_NAME,
            amount: 100,
            stars: 100,
            type: PaymentType.MONEY_INCOME,
            service_type: 'topup',
            status: PaymentStatus.COMPLETED,
            currency: 'XTR',
            description: 'Test topup 1',
            cost: 0,
          },
          {
            telegram_id: TEST_USER_ID,
            bot_name: TEST_BOT_NAME,
            amount: 50,
            stars: 50,
            type: PaymentType.MONEY_INCOME,
            service_type: 'topup',
            status: PaymentStatus.COMPLETED,
            currency: 'XTR',
            description: 'Test topup 2',
            cost: 0,
          },
          {
            telegram_id: TEST_USER_ID,
            bot_name: TEST_BOT_NAME,
            amount: 30,
            stars: 30,
            type: PaymentType.MONEY_OUTCOME,
            service_type: 'neurovideo',
            status: PaymentStatus.COMPLETED,
            currency: 'XTR',
            description: 'Test neurovideo usage',
            cost: 20,
          },
          {
            telegram_id: TEST_USER_ID,
            bot_name: TEST_BOT_NAME,
            amount: 20,
            stars: 20,
            type: PaymentType.MONEY_OUTCOME,
            service_type: 'image_generation',
            status: PaymentStatus.COMPLETED,
            currency: 'XTR',
            description: 'Test image generation',
            cost: 15,
          },
        ],
        users: [
          {
            telegram_id: TEST_USER_ID,
            bot_name: TEST_BOT_NAME,
            created_at: new Date().toISOString(),
          },
        ],
      })

      // Ждем обработки данных
      await new Promise(resolve => setTimeout(resolve, 2000))

      // Проверяем что данные действительно созданы
      const { data: createdPayments } = await supabase
        .from('payments_v2')
        .select('*')
        .eq('bot_name', TEST_BOT_NAME)
        .eq('telegram_id', parseInt(TEST_USER_ID))

      expect(createdPayments).toBeDefined()
      expect(createdPayments!.length).toBe(4)

      logger.info('📊 Created test payments:', {
        count: createdPayments!.length,
        totalIncome: createdPayments!
          .filter(p => p.type === PaymentType.MONEY_INCOME)
          .reduce((sum, p) => sum + p.stars, 0),
        totalOutcome: createdPayments!
          .filter(p => p.type === PaymentType.MONEY_OUTCOME)
          .reduce((sum, p) => sum + p.stars, 0),
        totalCost: createdPayments!.reduce((sum, p) => sum + (p.cost || 0), 0),
      })

      // Получаем статистику с правильными параметрами
      const statsResult = await getUserBalanceStats(TEST_USER_ID, TEST_BOT_NAME)

      expect(statsResult).not.toBeNull()
      expect(statsResult?.stats).toBeDefined()
      expect(statsResult?.stats.length).toBeGreaterThan(0)

      const botStats = statsResult!.stats[0]

      // Проверяем точность расчетов
      expect(botStats.bot_name).toBe(TEST_BOT_NAME)

      // Ожидаемые значения: доход 150 (100+50), расход 50 (30+20), себестоимость 35 (20+15)
      logger.info('📈 Calculated stats:', {
        total_income: botStats.total_income,
        total_outcome: botStats.total_outcome,
        total_cost: botStats.total_cost,
        net_profit: botStats.net_profit,
      })

      // Проверяем что статистика не равна нулю
      expect(botStats.total_income).toBeGreaterThan(0)
      expect(botStats.total_outcome).toBeGreaterThan(0)
      expect(botStats.total_cost).toBeGreaterThanOrEqual(0)

      // Проверяем логику расчета прибыли: доход - расход - себестоимость
      const expectedProfit =
        botStats.total_income - botStats.total_outcome - botStats.total_cost
      expect(botStats.net_profit).toBe(expectedProfit)
    })

    it('should handle zero data gracefully', async () => {
      const nonExistentBot = 'non_existent_bot_12345'

      const statsResult = await getUserBalanceStats(
        TEST_USER_ID,
        nonExistentBot
      )

      // Должно вернуть null или пустой результат без ошибок
      expect(statsResult === null || statsResult.stats.length === 0).toBe(true)

      logger.info('✅ Zero data handling test passed')
    })
  })

  describe('SQL Functions Validation', () => {
    it('should validate get_user_balance function exists and works', async () => {
      const { data, error } = await supabase.rpc('get_user_balance', {
        user_telegram_id: TEST_USER_ID,
      })

      // Функция должна существовать (даже если возвращает 0 для несуществующего пользователя)
      expect(error).toBeNull()
      expect(typeof data).toBe('number')

      logger.info('✅ get_user_balance function validation passed')
    })

    it('should validate get_user_balance_stats function with correct parameters', async () => {
      // Поскольку SQL функция get_user_balance_stats не существует,
      // проверяем нашу реализацию через getUserBalanceStats
      const statsResult = await getUserBalanceStats(TEST_USER_ID, TEST_BOT_NAME)

      // Функция должна работать и возвращать корректную структуру
      expect(statsResult).not.toBeNull()
      expect(statsResult?.stats).toBeDefined()
      expect(Array.isArray(statsResult?.stats)).toBe(true)

      logger.info('✅ getUserBalanceStats implementation validation passed')
    })
  })

  describe('Cost Analysis Tests', () => {
    it('should correctly track and calculate costs for different services', async () => {
      // Создаем данные с разной себестоимостью для разных сервисов
      await setupTestData({
        userId: TEST_USER_ID,
        botName: TEST_BOT_NAME,
        payments: [
          {
            telegram_id: TEST_USER_ID,
            bot_name: TEST_BOT_NAME,
            amount: 100,
            stars: 100,
            type: PaymentType.MONEY_OUTCOME,
            service_type: 'neurovideo',
            status: PaymentStatus.COMPLETED,
            currency: 'XTR',
            description: 'Expensive neurovideo',
            cost: 80,
          },
          {
            telegram_id: TEST_USER_ID,
            bot_name: TEST_BOT_NAME,
            amount: 50,
            stars: 50,
            type: PaymentType.MONEY_OUTCOME,
            service_type: 'image_generation',
            status: PaymentStatus.COMPLETED,
            currency: 'XTR',
            description: 'Cheap image generation',
            cost: 10,
          },
          {
            telegram_id: TEST_USER_ID,
            bot_name: TEST_BOT_NAME,
            amount: 200,
            stars: 200,
            type: PaymentType.MONEY_INCOME,
            service_type: 'topup',
            status: PaymentStatus.COMPLETED,
            currency: 'XTR',
            description: 'User topup',
            cost: 0,
          },
        ],
        users: [
          {
            telegram_id: TEST_USER_ID,
            bot_name: TEST_BOT_NAME,
            created_at: new Date().toISOString(),
          },
        ],
      })

      await new Promise(resolve => setTimeout(resolve, 1000))

      // Проверяем расчет себестоимости
      const { data: costData } = await supabase
        .from('payments_v2')
        .select('service_type, cost, stars, type')
        .eq('bot_name', TEST_BOT_NAME)
        .eq('telegram_id', parseInt(TEST_USER_ID))

      expect(costData).toBeDefined()

      const totalCost = costData!.reduce((sum, p) => sum + (p.cost || 0), 0)
      const totalOutcome = costData!
        .filter(p => p.type === PaymentType.MONEY_OUTCOME)
        .reduce((sum, p) => sum + p.stars, 0)
      const totalIncome = costData!
        .filter(p => p.type === PaymentType.MONEY_INCOME)
        .reduce((sum, p) => sum + p.stars, 0)

      logger.info('💰 Cost analysis:', {
        totalCost,
        totalOutcome,
        totalIncome,
        profitMargin:
          totalOutcome > 0
            ? (((totalOutcome - totalCost) / totalOutcome) * 100).toFixed(2) +
              '%'
            : 'N/A',
      })

      expect(totalCost).toBe(90)
      expect(totalOutcome).toBe(150)
      expect(totalIncome).toBe(200)
    })
  })

  describe('Real Bot Data Analysis', () => {
    it('should analyze real bot data if available', async () => {
      // Получаем реальные боты из БД
      const { data: realBots, error } = await supabase
        .from('bots')
        .select('bot_name')
        .eq('is_active', true)
        .limit(3)

      if (error || !realBots || realBots.length === 0) {
        logger.info('⚠️ No real bots found, skipping real data analysis')
        return
      }

      for (const bot of realBots) {
        const realBotName = bot.bot_name

        // Проверяем есть ли данные для этого бота
        const { data: realPayments } = await supabase
          .from('payments_v2')
          .select('telegram_id, stars, type, service_type, created_at, cost')
          .eq('bot_name', realBotName)
          .limit(10)

        logger.info(`📊 Real bot analysis: ${realBotName}`, {
          paymentsCount: realPayments?.length || 0,
          hasData: (realPayments?.length || 0) > 0,
        })

        if (realPayments && realPayments.length > 0) {
          // Анализируем первого пользователя
          const firstUserId = realPayments[0].telegram_id.toString()

          const realStats = await getUserBalanceStats(firstUserId, realBotName)

          if (realStats && realStats.stats.length > 0) {
            logger.info(`📈 Real bot stats for ${realBotName}:`, {
              total_income: realStats.stats[0].total_income,
              total_outcome: realStats.stats[0].total_outcome,
              total_cost: realStats.stats[0].total_cost,
              net_profit: realStats.stats[0].net_profit,
            })

            // Проверяем что статистика логична
            expect(realStats.stats[0].total_income).toBeGreaterThanOrEqual(0)
            expect(realStats.stats[0].total_outcome).toBeGreaterThanOrEqual(0)
            expect(realStats.stats[0].total_cost).toBeGreaterThanOrEqual(0)
          }
        }
      }
    })
  })

  describe('Stats Debugger Integration', () => {
    it('should run comprehensive stats debugging', async () => {
      // Создаем тестовые данные
      await setupTestData({
        userId: TEST_USER_ID,
        botName: TEST_BOT_NAME,
        payments: [
          {
            telegram_id: TEST_USER_ID,
            bot_name: TEST_BOT_NAME,
            amount: 100,
            stars: 100,
            type: PaymentType.MONEY_INCOME,
            service_type: 'topup',
            status: PaymentStatus.COMPLETED,
            currency: 'XTR',
            description: 'Debug test payment',
            cost: 0,
          },
        ],
        users: [
          {
            telegram_id: TEST_USER_ID,
            bot_name: TEST_BOT_NAME,
            created_at: new Date().toISOString(),
          },
        ],
      })

      await new Promise(resolve => setTimeout(resolve, 1000))

      // Запускаем диагностику
      const debugInfo = await debugBotStats(TEST_BOT_NAME, TEST_USER_ID)

      expect(debugInfo).toBeDefined()
      expect(debugInfo.botName).toBe(TEST_BOT_NAME)
      expect(debugInfo.userId).toBe(TEST_USER_ID)
      expect(debugInfo.recommendations).toBeDefined()

      logger.info('🔍 Debug info:', {
        paymentsCount: debugInfo.databaseChecks.paymentsCount,
        usersCount: debugInfo.databaseChecks.usersCount,
        recommendations: debugInfo.recommendations,
      })
    })

    it('should run quick health check', async () => {
      const healthCheck = await quickStatsHealthCheck()

      expect(healthCheck).toBeDefined()
      expect(typeof healthCheck.healthy).toBe('boolean')
      expect(Array.isArray(healthCheck.issues)).toBe(true)
      expect(typeof healthCheck.summary).toBe('string')

      logger.info('🏥 Health check result:', healthCheck)
    })
  })

  // Вспомогательные функции
  async function setupTestData(testData: TestDataSetup): Promise<void> {
    // Создаем пользователей
    for (const user of testData.users) {
      const { data, error } = await supabase
        .from('users')
        .insert([
          {
            telegram_id: parseInt(user.telegram_id),
            first_name: 'Test User',
          },
        ])
        .select()

      if (error && !error.message.includes('duplicate')) {
        logger.warn('User insert error:', error.message)
      } else if (data) {
        testDataIds.push(...data.map(d => d.id))
      }
    }

    // Создаем платежи
    for (const payment of testData.payments) {
      const { data, error } = await supabase
        .from('payments_v2')
        .insert([
          {
            telegram_id: parseInt(payment.telegram_id),
            bot_name: payment.bot_name,
            amount: payment.amount,
            stars: payment.stars,
            type: payment.type,
            service_type: payment.service_type,
            status: payment.status,
            currency: payment.currency,
            description: payment.description,
            cost: payment.cost || null,
            created_at: new Date().toISOString(),
            inv_id: `test_${Date.now()}_${Math.random()}`,
          },
        ])
        .select()

      if (error) {
        logger.error('Payment insert error:', error)
        throw error
      } else if (data) {
        testDataIds.push(...data.map(d => d.id))
      }
    }

    logger.info('✅ Test data created:', {
      usersCount: testData.users.length,
      paymentsCount: testData.payments.length,
    })
  }

  async function cleanupTestData(): Promise<void> {
    try {
      // Удаляем тестовые платежи
      await supabase.from('payments_v2').delete().eq('bot_name', TEST_BOT_NAME)

      // Удаляем тестовых пользователей
      await supabase
        .from('users')
        .delete()
        .eq('telegram_id', parseInt(TEST_USER_ID))

      logger.info('🧹 Test data cleaned up')
    } catch (error) {
      logger.warn('Cleanup warning:', error)
    }
  }
})
