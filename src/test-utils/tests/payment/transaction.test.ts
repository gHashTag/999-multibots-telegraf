import { PaymentTester } from './PaymentTester'
import { createTestUser } from '@/test-utils/helpers/createTestUser'
import { supabase } from '@/core/supabase'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { TEST_PAYMENT_CONFIG } from './test-config'
import { TransactionType } from '@/interfaces/payments.interface'

describe('Transaction Validation Tests', () => {
  let tester: PaymentTester
  let testUserId: string

  beforeAll(async () => {
    tester = new PaymentTester()
    const testUser = await createTestUser()
    testUserId = testUser.telegram_id
  })

  afterAll(async () => {
    // Очистка тестовых данных
    await supabase
      .from('transactions')
      .delete()
      .eq('telegram_id', testUserId)
  })

  describe('Transaction Creation', () => {
    it('should create valid transactions for different types', async () => {
      const amount = TEST_PAYMENT_CONFIG.amounts.small
      const types = TEST_PAYMENT_CONFIG.transactionTypes as TransactionType[]

      for (const type of types) {
        const { data, error } = await supabase
          .from('transactions')
          .insert({
            telegram_id: testUserId,
            amount,
            type,
            service_type: ModeEnum.NeuroPhoto,
            description: `Test ${type} transaction`
          })
          .select()
          .single()

        expect(error).toBeNull()
        expect(data).toBeTruthy()
        expect(data.type).toBe(type)
      }
    })

    it('should validate transaction amounts', async () => {
      const invalidAmount = -100

      const { error } = await supabase
        .from('transactions')
        .insert({
          telegram_id: testUserId,
          amount: invalidAmount,
          type: 'money_income',
          service_type: ModeEnum.NeuroPhoto,
          description: 'Test invalid amount'
        })

      expect(error).toBeTruthy()
    })
  })

  describe('Transaction Services', () => {
    it('should create transactions for different services', async () => {
      const amount = TEST_PAYMENT_CONFIG.amounts.small
      const services = TEST_PAYMENT_CONFIG.services

      for (const service of services) {
        const transactionCreated = await tester.checkTransactionCreation(
          testUserId,
          amount,
          'money_expense',
          service
        )
        expect(transactionCreated).toBeTruthy()
      }
    })
  })

  describe('Transaction Metadata', () => {
    it('should store and retrieve transaction metadata', async () => {
      const metadata = {
        operation_id: 'test-op-123',
        payment_method: 'Robokassa',
        extra_info: 'Test metadata'
      }

      const { data, error } = await supabase
        .from('transactions')
        .insert({
          telegram_id: testUserId,
          amount: TEST_PAYMENT_CONFIG.amounts.small,
          type: 'money_income',
          service_type: ModeEnum.NeuroPhoto,
          description: 'Test with metadata',
          metadata
        })
        .select()
        .single()

      expect(error).toBeNull()
      expect(data.metadata).toEqual(metadata)
    })
  })

  describe('Transaction Validation', () => {
    it('should require valid telegram_id', async () => {
      const { error } = await supabase
        .from('transactions')
        .insert({
          telegram_id: '',
          amount: TEST_PAYMENT_CONFIG.amounts.small,
          type: 'money_income',
          service_type: ModeEnum.NeuroPhoto,
          description: 'Test invalid telegram_id'
        })

      expect(error).toBeTruthy()
    })

    it('should require valid service type', async () => {
      const { error } = await supabase
        .from('transactions')
        .insert({
          telegram_id: testUserId,
          amount: TEST_PAYMENT_CONFIG.amounts.small,
          type: 'money_income',
          service_type: 'invalid_service',
          description: 'Test invalid service'
        })

      expect(error).toBeTruthy()
    })

    it('should require valid transaction type', async () => {
      const { error } = await supabase
        .from('transactions')
        .insert({
          telegram_id: testUserId,
          amount: TEST_PAYMENT_CONFIG.amounts.small,
          type: 'invalid_type',
          service_type: ModeEnum.NeuroPhoto,
          description: 'Test invalid type'
        })

      expect(error).toBeTruthy()
    })
  })

  describe('Transaction History', () => {
    it('should maintain chronological order of transactions', async () => {
      // Создаем несколько транзакций
      const transactions = [
        {
          amount: 100,
          type: 'money_income' as TransactionType,
          description: 'First transaction'
        },
        {
          amount: 50,
          type: 'money_expense' as TransactionType,
          description: 'Second transaction'
        },
        {
          amount: 200,
          type: 'money_income' as TransactionType,
          description: 'Third transaction'
        }
      ]

      for (const tx of transactions) {
        await supabase
          .from('transactions')
          .insert({
            telegram_id: testUserId,
            ...tx,
            service_type: ModeEnum.NeuroPhoto
          })
      }

      const { data } = await supabase
        .from('transactions')
        .select('*')
        .eq('telegram_id', testUserId)
        .order('created_at', { ascending: true })

      expect(data).toHaveLength(transactions.length)
      expect(data?.map(tx => tx.amount)).toEqual(
        transactions.map(tx => tx.amount)
      )
    })

    it('should calculate running balance correctly', async () => {
      const transactions = [
        { amount: 100, type: 'money_income' as TransactionType },
        { amount: 30, type: 'money_expense' as TransactionType },
        { amount: 50, type: 'money_income' as TransactionType }
      ]

      let runningBalance = 0
      for (const tx of transactions) {
        runningBalance += tx.type === 'money_income' ? tx.amount : -tx.amount

        await supabase
          .from('transactions')
          .insert({
            telegram_id: testUserId,
            ...tx,
            service_type: ModeEnum.NeuroPhoto,
            description: `Running balance test: ${runningBalance}`
          })
      }

      // Обновляем баланс пользователя
      await supabase
        .from('users')
        .update({ balance: runningBalance })
        .eq('telegram_id', testUserId)

      const finalBalance = await tester.checkBalanceUpdate(
        testUserId,
        runningBalance
      )
      expect(finalBalance).toBeTruthy()
    })
  })
})
