import { TransactionType } from '@/interfaces/payments.interface'
import { directPaymentProcessor } from '@/core/supabase/directPayment'
import { supabase } from '@/core/supabase'
import * as balanceModule from '@/core/supabase/getUserBalance'
import { sendTransactionNotificationTest } from '@/helpers/sendTransactionNotification'

jest.mock('@/core/supabase', () => ({
  supabase: { from: jest.fn() },
}))
jest.mock('@/core/supabase/getUserBalance', () => ({
  getUserBalance: jest.fn(),
  invalidateBalanceCache: jest.fn(),
}))
jest.mock('@/helpers/sendTransactionNotification', () => ({
  sendTransactionNotificationTest: jest.fn(),
}))

describe('directPaymentProcessor', () => {
  const fromMock = supabase.from as jest.Mock
  const insertMock = jest.fn()
  const selectMock = jest.fn()
  const singleMock = jest.fn()
  beforeEach(() => {
    jest.clearAllMocks()
    // Setup supabase.from chain
    fromMock.mockReturnValue({ insert: insertMock })
    insertMock.mockReturnValue({ select: selectMock })
    selectMock.mockReturnValue({ single: singleMock })
  })

  it('should fail on non-positive amount', async () => {
    const res = await directPaymentProcessor({
      telegram_id: '1',
      amount: 0,
      type: TransactionType.MONEY_INCOME,
      description: 'desc',
      bot_name: 'bot',
      service_type: 'svc',
    })
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Некорректная сумму/)
  })

  it('should fail expense when insufficient balance', async () => {
    ;(balanceModule.getUserBalance as jest.Mock).mockResolvedValue(5)
    const res = await directPaymentProcessor({
      telegram_id: '2',
      amount: 10,
      type: TransactionType.MONEY_EXPENSE,
      description: 'desc',
      bot_name: 'bot',
      service_type: 'svc',
    })
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Недостаточно средств/)
  })

  it('should bypass balance check when bypass_payment_check true', async () => {
    ;(balanceModule.getUserBalance as jest.Mock)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
    // Mock insert returning id
    singleMock.mockResolvedValue({ data: { id: 123 }, error: null })
    const res = await directPaymentProcessor({
      telegram_id: '3',
      amount: 1,
      type: TransactionType.MONEY_EXPENSE,
      description: 'desc',
      bot_name: 'bot',
      service_type: 'svc',
      bypass_payment_check: true,
    })
    expect(res.success).toBe(true)
    expect(res.payment_id).toBe(123)
    expect(sendTransactionNotificationTest).toHaveBeenCalled()
  })

  it('should succeed income and invalidate cache', async () => {
    ;(balanceModule.getUserBalance as jest.Mock)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(5)
    singleMock.mockResolvedValue({ data: { id: 456 }, error: null })
    const res = await directPaymentProcessor({
      telegram_id: '4',
      amount: 2,
      type: TransactionType.MONEY_INCOME,
      description: 'desc',
      bot_name: 'bot',
      service_type: 'svc',
    })
    expect(res.success).toBe(true)
    expect(res.payment_id).toBe(456)
    expect(balanceModule.invalidateBalanceCache).toHaveBeenCalledWith('4')
    expect(res.balanceChange).toEqual({ before: 5, after: 5, difference: 0 })
  })
})
