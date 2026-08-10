/**
 * Billing filters — единый источник правды о том, что считается
 * РЕАЛЬНЫМ доходом от клиентов и РЕАЛЬНОЙ себестоимостью AI.
 *
 * Почему это отдельный модуль:
 * в payments_v2 лежат не только клиентские платежи, но и служебные
 * начисления (админские подарки, бонусы, промо, системные корректировки).
 * Если их не отфильтровать, отчёт владельца раздувается на порядки —
 * именно так @ai_koshey_bot получил «доход 195 830 377⭐».
 *
 * Два правила, которые нельзя нарушать:
 *  1. Звёздная сумма транзакции — это колонка `stars`, НЕ `amount`.
 *     `amount` исторически заполняется сырым значением из вызывающего кода
 *     (см. updateUserBalance.ts: `amount: originalAmount`), куда регулярно
 *     попадает весь баланс пользователя, а не сумма операции.
 *     `amount` достоверен только для фиатных валют (RUB/USDC/TON).
 *  2. Доход — только платежи с реальным платёжным методом
 *     (Robokassa / Telegram / CryptoBot / X402 / TON), статусом COMPLETED
 *     и категорией REAL.
 */
import {
  Currency,
  PaymentMethod,
  PaymentStatus,
} from '@/interfaces/payments.interface'
import {
  calculateServiceCost,
  isServiceCostSupported,
} from '@/price/helpers/calculateServiceCost'
import { logger } from '@/utils/logger'

/** Платёжные методы, за которыми стоят реальные деньги клиента. */
export const REAL_PAYMENT_METHODS: ReadonlySet<string> = new Set([
  PaymentMethod.TELEGRAM,
  PaymentMethod.ROBOKASSA,
  PaymentMethod.CRYPTOBOT,
  PaymentMethod.X402,
  PaymentMethod.TON_USDT,
  PaymentMethod.TON_NATIVE,
])

/**
 * service_type, которые не являются AI-генерациями.
 * Списания по ним не должны попадать в «Себестоимость AI».
 */
export const NON_AI_SERVICE_TYPES: ReadonlySet<string> = new Set([
  'payment_operation',
  'subscription',
  'unknown',
])

/**
 * Предохранитель: одна клиентская транзакция физически не может принести
 * столько звёзд. Всё, что выше — повреждённые данные, а не доход.
 * (Лимит Telegram на один инвойс — 100 000⭐; берём запас x10.)
 */
export const MAX_SANE_INCOME_STARS_PER_TX = 1_000_000

/** Курсы для нормализации фиата в звёзды. */
const STAR_USD = 0.016
const RUB_PER_STAR = 2.3
const USD_PER_TON = 3.5

export interface BillingPaymentRow {
  amount?: number | null
  stars?: number | null
  cost?: number | null
  currency?: string | null
  payment_method?: string | null
  status?: string | null
  category?: string | null
  service_type?: string | null
  is_system_payment?: boolean | null
  metadata?: Record<string, unknown> | null
}

/** Валюта хранится и как 'XTR', и как 'STARS' (дефолт колонки в БД). */
function isStarCurrency(currency?: string | null): boolean {
  const cur = (currency || Currency.XTR).toUpperCase()
  return cur === Currency.XTR || cur === 'STARS'
}

/** Переводит фиатную сумму в звёзды. Для звёздных валют возвращает as-is. */
export function toStars(amount: number, currency?: string | null): number {
  const cur = (currency || Currency.XTR).toUpperCase()
  if (isStarCurrency(cur)) return amount
  if (cur === Currency.RUB) return Math.round(amount / RUB_PER_STAR)
  if (cur === Currency.USDC || cur === Currency.USDT_TON) {
    return Math.round(amount / STAR_USD)
  }
  if (cur === Currency.TON) return Math.round((amount * USD_PER_TON) / STAR_USD)
  return amount
}

/** Транзакция проведена и не является бонусной/служебной. */
function isSettledRealTransaction(row: BillingPaymentRow): boolean {
  if (row.status && row.status !== PaymentStatus.COMPLETED) return false
  if (row.category === 'BONUS') return false
  if (row.is_system_payment === true) return false
  return true
}

/**
 * Реальный доход от клиента: проведённый платёж настоящим платёжным методом.
 * Отсекает админские начисления, бонусы, промо и системные корректировки.
 */
export function isRealClientIncome(row: BillingPaymentRow): boolean {
  if (!isSettledRealTransaction(row)) return false
  return REAL_PAYMENT_METHODS.has(row.payment_method || '')
}

/**
 * Сумма клиентского платежа в звёздах.
 * Для звёздных платежей — колонка `stars`; для фиата — `amount` с конвертацией.
 * Возвращает 0 для аномальных значений (повреждённые данные).
 */
export function incomeToStars(row: BillingPaymentRow): number {
  const stars = isStarCurrency(row.currency)
    ? Number(row.stars) || 0
    : toStars(Number(row.amount) || 0, row.currency)

  if (!Number.isFinite(stars) || stars <= 0) return 0

  if (stars > MAX_SANE_INCOME_STARS_PER_TX) {
    logger.warn('[Billing] Аномальная сумма платежа отброшена', {
      stars,
      amount: row.amount,
      currency: row.currency,
      payment_method: row.payment_method,
    })
    return 0
  }
  return stars
}

/** Сумма платежа в исходной валюте — для разбивки «по методам» в отчёте. */
export function incomeNativeAmount(row: BillingPaymentRow): number {
  const value = isStarCurrency(row.currency)
    ? Number(row.stars) || 0
    : Number(row.amount) || 0
  return Number.isFinite(value) && value > 0 ? value : 0
}

/**
 * Себестоимость AI-операции в звёздах.
 *
 * Берём колонку `cost` (заполняется при записи транзакции). Если её нет
 * (исторические записи), пересчитываем тем же калькулятором, что и при записи.
 * Служебные операции (payment_operation, подписки) себестоимости не имеют.
 */
export function aiCostStars(row: BillingPaymentRow): number {
  if (!isSettledRealTransaction(row)) return 0

  const serviceType = row.service_type || ''
  if (!serviceType || NON_AI_SERVICE_TYPES.has(serviceType)) return 0

  const stored = Number(row.cost)
  if (Number.isFinite(stored) && stored > 0) return stored

  if (!isServiceCostSupported(serviceType)) return 0
  return calculateServiceCost(
    serviceType,
    (row.metadata as Record<string, any>) || undefined,
    Number(row.stars) || 0
  )
}
