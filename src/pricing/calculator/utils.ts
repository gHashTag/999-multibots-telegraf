// import { SYSTEM_CONFIG } from '@/price/constants/modelsCost'; // Удалено
import {
  STAR_COST_USD,
  MARKUP_MULTIPLIER,
} from '@/pricing/config/pricing.config' // <-- Импортируем нужные константы

// Функция расчета СТОИМОСТИ В ЗВЕЗДАХ для изображений
// Применяет наценку и переводит в звезды
export function calculateFinalImageCostInStars(baseCostUSD: number): number {
  const finalCostInDollars = baseCostUSD * MARKUP_MULTIPLIER // Применяем наценку
  // Переводим в звезды и округляем ВВЕРХ (как в основном калькуляторе)
  return Math.ceil(finalCostInDollars / STAR_COST_USD)
}

// Можно добавить другие утилиты для цен моделей здесь в будущем
