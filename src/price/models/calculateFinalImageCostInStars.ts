import { SYSTEM_CONFIG } from '@/price/constants/index'

// Функция для расчета окончательной стоимости изображения в звездах
export function calculateFinalImageCostInStars(baseCost: number): number {
  const finalCostInDollars = baseCost * (1 + SYSTEM_CONFIG.interestRate)
  return Math.ceil(finalCostInDollars / SYSTEM_CONFIG.starCost)
}
