import { VideoModel } from '@/interfaces'

// Определяем базовую стоимость для каждой модели
export const videoModelPrices: Record<VideoModel, number> = {
  minimax: 0.5,
  haiper: 0.05,
  ray: 0.45,
  'i2vgen-xl': 0.45,
}
