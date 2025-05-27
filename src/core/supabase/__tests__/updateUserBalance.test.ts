import { describe, it, expect, vi, beforeEach } from 'vitest'
import { supabase } from '@/core/supabase'
import { updateUserBalance } from '../updateUserBalance'
import {
  PaymentType,
  PaymentStatus,
} from '../../../interfaces/payments.interface'
import { CreatePaymentV2Schema } from '../../../interfaces/zod/payment.zod'
import { ModeEnum } from '../../../interfaces/modes'

// Мокируем зависимости
vi.mock('@/core/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(), // Добавляем мок для rpc здесь, если он используется глобально supabase.rpc
  },
}))

vi.mock('../getUserBalance', () => ({
  ...(vi.importActual('../getUserBalance') as object), // Оставляем как есть, если это рабочий паттерн в проекте
  invalidateBalanceCache: vi.fn(),
}))

// Мок для CreatePaymentV2Schema.parse
// Мы хотим, чтобы CreatePaymentV2Schema.parse был функцией vi.fn()
// И чтобы он просто возвращал переданные ему данные для простоты теста
const mockZodParse = vi.fn(data => data) // Мок возвращает то, что получил

vi.mock('../../../interfaces/zod/payment.zod', async () => {
  const actual = await vi.importActual('../../../interfaces/zod/payment.zod')
  return {
    ...(actual as any),
    CreatePaymentV2Schema: {
      ...(actual as any).CreatePaymentV2Schema,
      parse: mockZodParse, // Используем наш мок здесь
    },
  }
})

// Вспомогательная функция для генерации тестовых данных
const mockSuccessfulPaymentData = (
  telegram_id_str: string,
  starsAmount: number, // Изменено с amount на starsAmount для ясности
  description: string,
  type: PaymentType,
  bot_name: string,
  service_type: ModeEnum,
  rubAmount?: number | null, // Добавлен rubAmount
  cost_in_stars?: number | null,
  invoice_url?: string | null
) => ({
  telegram_id: telegram_id_str,
  // user_id будет получен внутри функции updateUserBalance
  amount: rubAmount, // Сумма в рублях
  stars: starsAmount, // Сумма в звездах
  type,
  description,
  bot_name,
  service_type,
  status: PaymentStatus.COMPLETED, // ИСПРАВЛЕНО: PaymentStatus.COMPLETED
  invoice_url: invoice_url || null,
  cost: cost_in_stars || null,
})

describe('updateUserBalance', () => {
  beforeEach(() => {
    vi.clearAllMocks() // Это должно работать, если 'vitest/globals' подключены

    // Настройка общего мока для supabase.from().insert() и supabase.from().select() и supabase.rpc()
    const mockFrom = supabase.from as ReturnType<typeof vi.fn>
    const mockInsert = vi.fn()
    const mockSelect = vi.fn()
    const mockRpc = vi.fn() // Мок для rpc

    mockFrom.mockImplementation((tableName: string) => {
      if (tableName === 'payments_v2') {
        return {
          insert: mockInsert.mockReturnThis(), // insert теперь часть цепочки
          select: mockSelect, // select остается как есть, если не цепочный
        }
      }
      if (tableName === 'user_profile') {
        return {
          select: mockSelect.mockReturnThis(), // select теперь часть цепочки
          eq: mockSelect, // eq часть цепочки
        }
      }
      return {
        // Общий fallback
        insert: mockInsert,
        select: mockSelect,
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        like: vi.fn().mockReturnThis(),
        ilike: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        contains: vi.fn().mockReturnThis(),
        containedBy: vi.fn().mockReturnThis(),
        rangeLt: vi.fn().mockReturnThis(),
        rangeLte: vi.fn().mockReturnThis(),
        rangeGt: vi.fn().mockReturnThis(),
        rangeGte: vi.fn().mockReturnThis(),
        rangeAdjacent: vi.fn().mockReturnThis(),
        overlaps: vi.fn().mockReturnThis(),
        textSearch: vi.fn().mockReturnThis(),
        match: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        filter: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn(),
        throwOnError: vi.fn(),
      }
    })
    ;(supabase.rpc as ReturnType<typeof vi.fn>).mockImplementation(mockRpc)

    // Сбрасываем parse мок перед каждым тестом
    mockZodParse.mockClear().mockImplementation(data => data)
  })

  it('should handle successful MONEY_INCOME operation', async () => {
    const telegram_id_str = '12345'
    const userId = 'user-uuid-123'
    const starsAmount = 100 // Это количество звезд
    const rubAmount = 500 // Это количество рублей
    const description = 'Test Income'
    const type = PaymentType.MONEY_INCOME
    const bot_name = 'TestBot'
    const service_type = ModeEnum.SubscriptionScene // Пример
    const cost_in_stars = null
    const invoice_url = 'http://example.com/invoice/1'

    // Мок для user_profile select
    ;(
      (supabase.from as ReturnType<typeof vi.fn>)('user_profile')
        .select as ReturnType<typeof vi.fn>
    ).mockReturnValueOnce({
      data: [{ id: userId, neuro_tokens: 50 }],
      error: null,
    })

    // Мок для rpc get_user_balance
    ;(supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: 150,
      error: null,
    })

    // Мок для payments_v2 insert
    ;(
      (supabase.from as ReturnType<typeof vi.fn>)('payments_v2')
        .insert as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({ error: null })

    const result = await updateUserBalance(
      telegram_id_str,
      starsAmount, // amount здесь - это количество звезд
      type,
      description,
      {
        bot_name,
        service_type,
        invoice_url,
        rub_amount: rubAmount,
      },
      cost_in_stars
    )

    expect(result).toBe(true)
    expect(CreatePaymentV2Schema.parse).toHaveBeenCalledWith(
      expect.objectContaining(
        mockSuccessfulPaymentData(
          telegram_id_str,
          starsAmount,
          description,
          type,
          bot_name,
          service_type,
          rubAmount,
          cost_in_stars,
          invoice_url
        )
      )
    )
    expect(
      (supabase.from as ReturnType<typeof vi.fn>)('payments_v2').insert
    ).toHaveBeenCalledTimes(1)
    expect(supabase.rpc).toHaveBeenCalledWith('get_user_balance', {
      user_id_param: userId,
    })
  })

  it('should handle successful MONEY_OUTCOME operation', async () => {
    const telegram_id_str = '67890'
    const userId = 'user-uuid-678'
    const starsAmount = -50 // Отрицательное для списания
    const description = 'Test Outcome'
    const type = PaymentType.MONEY_OUTCOME
    const bot_name = 'TestBot'
    const service_type = ModeEnum.NeuroPhoto
    const cost_in_stars = 50 // Себестоимость для списания

    ;(
      (supabase.from as ReturnType<typeof vi.fn>)('user_profile')
        .select as ReturnType<typeof vi.fn>
    ).mockReturnValueOnce({
      data: [{ id: userId, neuro_tokens: 200 }],
      error: null,
    })
    ;(supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: 150,
      error: null,
    }) // Баланс после списания
    ;(
      (supabase.from as ReturnType<typeof vi.fn>)('payments_v2')
        .insert as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({ error: null })

    const result = await updateUserBalance(
      telegram_id_str,
      starsAmount,
      type,
      description,
      {
        bot_name,
        service_type,
      },
      cost_in_stars
    )

    expect(result).toBe(true)
    expect(CreatePaymentV2Schema.parse).toHaveBeenCalledWith(
      expect.objectContaining(
        mockSuccessfulPaymentData(
          telegram_id_str,
          Math.abs(starsAmount),
          description,
          type,
          bot_name,
          service_type,
          null,
          cost_in_stars,
          null
        )
      )
    )
    expect(
      (supabase.from as ReturnType<typeof vi.fn>)('payments_v2').insert
    ).toHaveBeenCalledTimes(1)
    expect(supabase.rpc).toHaveBeenCalledWith('get_user_balance', {
      user_id_param: userId,
    })
  })

  it('should return false if user_profile not found', async () => {
    ;(
      (supabase.from as ReturnType<typeof vi.fn>)('user_profile')
        .select as ReturnType<typeof vi.fn>
    ).mockReturnValueOnce({ data: [], error: null }) // Пользователь не найден

    const result = await updateUserBalance(
      '111',
      10,
      PaymentType.MONEY_INCOME,
      'Test No User',
      {
        bot_name: 'TestBot',
        service_type: ModeEnum.MainMenu,
      }
    )

    expect(result).toBe(false)
    expect(CreatePaymentV2Schema.parse).not.toHaveBeenCalled()
    expect(
      (supabase.from as ReturnType<typeof vi.fn>)('payments_v2').insert
    ).not.toHaveBeenCalled()
  })

  it('should return false if insert into payments_v2 fails', async () => {
    const userId = 'user-uuid-fail-insert'
    ;(
      (supabase.from as ReturnType<typeof vi.fn>)('user_profile')
        .select as ReturnType<typeof vi.fn>
    ).mockReturnValueOnce({
      data: [{ id: userId, neuro_tokens: 100 }],
      error: null,
    })

    // Ошибка при вставке
    ;(
      (supabase.from as ReturnType<typeof vi.fn>)('payments_v2')
        .insert as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({ error: new Error('Insert failed') })

    const result = await updateUserBalance(
      '222',
      20,
      PaymentType.MONEY_INCOME,
      'Test Insert Fail',
      {
        bot_name: 'TestBot',
        service_type: ModeEnum.MainMenu,
      }
    )

    expect(result).toBe(false)
    // Parse будет вызван, так как он до insert
    expect(CreatePaymentV2Schema.parse).toHaveBeenCalledTimes(1)
    expect(
      (supabase.from as ReturnType<typeof vi.fn>)('payments_v2').insert
    ).toHaveBeenCalledTimes(1)
  })

  it('should handle Zod validation error by CreatePaymentV2Schema.parse', async () => {
    const userId = 'user-uuid-zod-fail'
    mockZodParse.mockImplementationOnce(() => {
      throw new Error('Zod validation failed')
    })
    ;(
      (supabase.from as ReturnType<typeof vi.fn>)('user_profile')
        .select as ReturnType<typeof vi.fn>
    ).mockReturnValueOnce({
      data: [{ id: userId, neuro_tokens: 100 }],
      error: null,
    })

    const result = await updateUserBalance(
      '333',
      30,
      PaymentType.MONEY_INCOME,
      undefined as any, // намеренно передаем невалидные данные
      {
        bot_name: 'TestBot',
        service_type: ModeEnum.MainMenu,
      }
    )

    expect(result).toBe(false)
    expect(CreatePaymentV2Schema.parse).toHaveBeenCalledTimes(1)
    expect(
      (supabase.from as ReturnType<typeof vi.fn>)('payments_v2').insert
    ).not.toHaveBeenCalled()
  })
})
