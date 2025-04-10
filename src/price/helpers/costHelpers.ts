import { ModeEnum } from '@/types/modes'
import {
  conversionRates,
  conversionRatesV2,
  CostDetails,
  ConversionRates,
  paymentOptions,
  paymentOptionsPlans,
} from '../priceCalculator'

/**
 * Получает настройки конверсии для режима
 */
export function getConversionRates(mode: ModeEnum): ConversionRates {
  // Для режимов v2 используем новые настройки
  if (mode === ModeEnum.NeuroPhotoV2) {
    return conversionRatesV2
  }
  return conversionRates
}

/**
 * Получает базовую стоимость для режима
 */
export function getBaseCost(mode: ModeEnum, steps?: number): number {
  // Если указаны шаги, используем их
  if (steps) {
    return steps * getConversionRates(mode).costPerStepInStars
  }

  // Иначе используем фиксированную стоимость для каждого режима
  switch (mode) {
    case ModeEnum.NeuroPhoto:
      return 5
    case ModeEnum.NeuroPhotoV2:
      return 8.75
    case ModeEnum.ImageToPrompt:
      return 1.88
    default:
      return 5 // Базовая стоимость по умолчанию
  }
}

/**
 * Рассчитывает полную стоимость на основе базовой
 */
export function calculateCostFromBase(
  baseCost: number,
  rates: ConversionRates = conversionRates
): CostDetails {
  const dollars = baseCost * rates.costPerStarInDollars
  const rubles = dollars * rates.rublesToDollarsRate

  return {
    steps: Math.round(baseCost / rates.costPerStepInStars),
    stars: parseFloat(baseCost.toFixed(2)),
    dollars: parseFloat(dollars.toFixed(2)),
    rubles: parseFloat(rubles.toFixed(2)),
  }
}

/**
 * Конвертирует рубли в звезды на основе текущего курса
 * Сначала ищет точное соответствие в таблице готовых опций,
 * если не находит - рассчитывает по формуле
 */
export function convertRublesToStars(rubles: number): number {
  // Сначала проверяем в заранее заданных опциях платежей
  const exactMatch = paymentOptions.find(option => option.amount === rubles)
  if (exactMatch) {
    return parseFloat(exactMatch.stars)
  }

  // Затем проверяем в опциях подписок
  const planMatch = paymentOptionsPlans.find(option => option.amount === rubles)
  if (planMatch) {
    return parseFloat(planMatch.stars)
  }

  // Если нет точного соответствия, рассчитываем:
  // 1 доллар = RUBLES_TO_DOLLARS_RATE рублей
  // 1 звезда = STAR_COST долларов
  // stars = rubles / (RUBLES_TO_DOLLARS_RATE * STAR_COST)
  const rates = conversionRates
  const dollarsPerRub = 1 / rates.rublesToDollarsRate
  const starsPerDollar = 1 / rates.costPerStarInDollars
  const stars = rubles * dollarsPerRub * starsPerDollar

  return parseFloat(stars.toFixed(2))
}

/**
 * Определяет, является ли платёж пополнением через рубли
 * @param payment Объект платежа
 */
export function isRubPayment(payment: {
  amount?: string | number | null
  stars?: string | number | null
  currency?: string
  payment_method?: string | null
}): boolean {
  // Платеж без суммы не может быть рублёвым
  if (!payment.amount || Number(payment.amount) <= 0) {
    return false
  }

  // Главный признак - это валюта RUB
  if (payment.currency === 'RUB') {
    return true
  }

  // Второй признак - платеж через Robokassa
  if (payment.payment_method === 'Robokassa') {
    return true
  }

  return false
}
