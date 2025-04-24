import { SYSTEM_CONFIG } from '@/price/constants/index'

// Функция для расчета стоимости в звездах
export function calculateCostInStars(costInDollars: number): number {
  return costInDollars / SYSTEM_CONFIG.starCost
}
