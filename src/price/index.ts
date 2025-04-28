export * from '@/pricing/calculator'
// export * from './models/videoModelPrices' // Удалено
export * from './helpers'
// export * from '@/pricing/models' // Removed export - index deleted
// export * from './priceCalculator' // Убираем, т.к. логика в ./calculator
// export { basePrice } from './constants' // Предполагаем, что константы переехали в pricing.config
// Удаляем повторное объявление
// export { calculateDiscountedPrice } from './utils'

/**
 * Рассчитывает итоговую стоимость с учетом скидки
 * @param price Исходная цена
 * @param discount Скидка в процентах (0-100)
 * @returns Цена со скидкой
 */
export function calculateDiscountedPrice(
  price: number,
  discount: number
): number {
  const discountMultiplier = (100 - Math.min(Math.max(discount, 0), 100)) / 100
  return Math.round(price * discountMultiplier)
}
