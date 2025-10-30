import { SYSTEM_CONFIG } from '@/price/constants/index'

// Функция для расчета окончательной стоимости изображения в звездах
export function calculateFinalImageCostInStars(baseCost: number): number {
  // FIXED: Use interestRate as multiplier (1.5 = 50% markup), not addition (was 1 + 1.5 = 150% markup)
  const finalCostInDollars = baseCost * SYSTEM_CONFIG.interestRate
  return Math.ceil(finalCostInDollars / SYSTEM_CONFIG.starCost)
}
