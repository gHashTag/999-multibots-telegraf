export * from './models/imageModelPrices'
export * from './models/videoModelPrices'
export const basePrice = 100

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
