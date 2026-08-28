import { describe, it, expect } from 'vitest'
import {
  aiCostStars,
  incomeNativeAmount,
  incomeToStars,
  isRealClientIncome,
  MAX_SANE_INCOME_STARS_PER_TX,
  toStars,
} from '@/utils/billingFilters'

/**
 * Регрессия на отчёт @ai_koshey_bot, показавший «доход 195 830 377⭐».
 * Причина: в доход попадали служебные начисления, а сумма бралась
 * из колонки `amount`, куда пишется сырое значение (часто весь баланс).
 */

const realStarPayment = {
  stars: 100,
  amount: 195_830_377, // мусор из legacy-записи
  currency: 'STARS',
  payment_method: 'Telegram',
  status: 'COMPLETED',
  category: 'REAL',
}

describe('isRealClientIncome', () => {
  it('пропускает платежи реальными методами', () => {
    for (const m of [
      'Telegram',
      'Robokassa',
      'CryptoBot',
      'X402',
      'TON_NATIVE',
      'TON_USDT',
    ]) {
      expect(
        isRealClientIncome({ ...realStarPayment, payment_method: m })
      ).toBe(true)
    }
  })

  it('отсекает системные и админские начисления', () => {
    for (const m of ['System', 'Admin', 'Manual', 'balance', 'bonus', '']) {
      expect(
        isRealClientIncome({ ...realStarPayment, payment_method: m })
      ).toBe(false)
    }
  })

  it('отсекает бонусы, системные платежи и незавершённые транзакции', () => {
    expect(isRealClientIncome({ ...realStarPayment, category: 'BONUS' })).toBe(
      false
    )
    expect(
      isRealClientIncome({ ...realStarPayment, is_system_payment: true })
    ).toBe(false)
    expect(isRealClientIncome({ ...realStarPayment, status: 'PENDING' })).toBe(
      false
    )
    expect(isRealClientIncome({ ...realStarPayment, status: 'FAILED' })).toBe(
      false
    )
  })
})

describe('incomeToStars', () => {
  it('для звёздных платежей берёт stars, а не amount', () => {
    expect(incomeToStars(realStarPayment)).toBe(100)
    expect(incomeToStars({ ...realStarPayment, currency: 'XTR' })).toBe(100)
    expect(incomeToStars({ ...realStarPayment, currency: null })).toBe(100)
  })

  it('конвертирует фиат в звёзды по amount', () => {
    expect(incomeToStars({ stars: 0, amount: 2300, currency: 'RUB' })).toBe(
      1000
    )
    expect(incomeToStars({ stars: 0, amount: 16, currency: 'USDC' })).toBe(1000)
  })

  it('отбрасывает аномальные суммы', () => {
    expect(
      incomeToStars({
        stars: MAX_SANE_INCOME_STARS_PER_TX + 1,
        currency: 'STARS',
      })
    ).toBe(0)
    expect(incomeToStars({ stars: -5, currency: 'STARS' })).toBe(0)
    expect(incomeToStars({ stars: NaN, currency: 'STARS' })).toBe(0)
  })
})

describe('incomeNativeAmount', () => {
  it('для звёзд отдаёт stars, для фиата — amount', () => {
    expect(incomeNativeAmount(realStarPayment)).toBe(100)
    expect(
      incomeNativeAmount({ amount: 2300, stars: 1000, currency: 'RUB' })
    ).toBe(2300)
  })
})

describe('aiCostStars', () => {
  it('берёт колонку cost, а не цену для пользователя', () => {
    expect(
      aiCostStars({ stars: 84, cost: 12, service_type: 'neuro_photo' })
    ).toBe(12)
  })

  it('не считает служебные операции себестоимостью AI', () => {
    expect(
      aiCostStars({ stars: 500, cost: 500, service_type: 'payment_operation' })
    ).toBe(0)
    expect(
      aiCostStars({ stars: 500, cost: 500, service_type: 'subscription' })
    ).toBe(0)
    expect(aiCostStars({ stars: 500, cost: 500, service_type: null })).toBe(0)
  })

  it('пересчитывает себестоимость, если cost не заполнен', () => {
    expect(
      aiCostStars({ stars: 20, cost: null, service_type: 'neuro_photo' })
    ).toBe(4)
    expect(
      aiCostStars({
        stars: 20,
        cost: 0,
        service_type: 'neuro_photo',
        metadata: { num_images: 3 },
      })
    ).toBe(12)
  })

  it('возвращает 0 для неизвестных сервисов и незавершённых списаний', () => {
    expect(
      aiCostStars({ stars: 50, cost: null, service_type: 'no_such_service' })
    ).toBe(0)
    expect(
      aiCostStars({
        stars: 50,
        cost: 42,
        service_type: 'neuro_photo',
        status: 'FAILED',
      })
    ).toBe(0)
    expect(
      aiCostStars({
        stars: 50,
        cost: 42,
        service_type: 'neuro_photo',
        category: 'BONUS',
      })
    ).toBe(0)
  })
})

describe('toStars', () => {
  it('не трогает звёздные валюты', () => {
    expect(toStars(100, 'XTR')).toBe(100)
    expect(toStars(100, 'STARS')).toBe(100)
    expect(toStars(100, undefined)).toBe(100)
  })

  it('конвертирует TON через USD', () => {
    expect(toStars(1, 'TON')).toBe(Math.round(3.5 / 0.016))
  })
})
