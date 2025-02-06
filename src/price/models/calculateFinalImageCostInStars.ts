import { starCost } from '../starCost'
import { interestRate } from '../interestRate'

// Функция для расчета окончательной стоимости изображения в звездах
export function calculateFinalImageCostInStars(baseCost: number): number {
  const finalCostInDollars = baseCost * (1 + interestRate)
  return Math.ceil(finalCostInDollars / starCost)
}
