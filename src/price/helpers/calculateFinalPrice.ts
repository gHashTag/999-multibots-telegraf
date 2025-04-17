import { videoModelPrices } from '@/price/models/videoModelPrices'
import { starCost } from '@/price'
import { VideoModel } from '@/interfaces'
import { interestRate } from '@/price/interestRate'

// Функция для расчета окончательной стоимости модели
export function calculateFinalPrice(model: VideoModel): number {
  const basePrice = videoModelPrices[model]
  const finalPrice = basePrice * (1 + interestRate)
  return Math.floor(finalPrice / starCost)
}
