import {
import { logger } from '@/utils/enhancedLogger'
  getUsdToRubRate,
  rubToStars,
  usdToStars,
  DEFAULT_USD_TO_RUB_RATE,
} from '@/config/unified-pricing.config'

// Пакеты пополнения в рублях (фиксированные, для fallback)
export const rubTopUpOptions: { amountRub: number; stars: number }[] = [
  { amountRub: 10, stars: 6 },
  { amountRub: 500, stars: 217 },
  { amountRub: 1000, stars: 434 },
  { amountRub: 2000, stars: 869 },
  { amountRub: 5000, stars: 2173 },
  { amountRub: 10000, stars: 4347 },
].filter(option => option.stars > 0) // На всякий случай оставим фильтр

// Проверка, если вдруг все пакеты стали невалидными
if (rubTopUpOptions.length === 0) {
  logger.error(
    'Не удалось сформировать пакеты пополнения рублями из фиксированного списка.'
  )
  // Добавляем хотя бы один пакет по умолчанию
  rubTopUpOptions.push({ amountRub: 100, stars: 1 })
}

/**
 * Генерирует динамические пакеты пополнения на основе актуального курса
 * @param fallback - курс по умолчанию если API недоступен
 * @returns Массив пакетов с актуальными ценами
 */
export async function generateDynamicTopUpPackages(
  fallback = DEFAULT_USD_TO_RUB_RATE
): Promise<{ amountRub: number; stars: number }[]> {
  try {
    const currentRate = await getUsdToRubRate(fallback)

    // Базовые суммы в рублях для пакетов
    const baseAmounts = [10, 500, 1000, 2000, 5000, 10000]

    const dynamicPackages = baseAmounts.map(amountRub => {
      // Используем динамический курс для расчёта звёзд
      const usd = amountRub / currentRate
      const stars = Math.max(1, Math.floor(usdToStars(usd)))
      return {
        amountRub,
        stars,
      }
    })

    // Фильтруем пакеты с валидным количеством звёзд
    return dynamicPackages.filter(option => option.stars > 0)
  } catch (error) {
    logger.error('Ошибка генерации динамических пакетов пополнения:', error)
    throw error
  }
}

/**
 * Получает динамические пакеты пополнения в рублях с fallback на статические
 * @param fallback - курс по умолчанию если API недоступен
 * @returns Массив пакетов пополнения
 */
export async function getDynamicRubTopUpOptions(
  fallback = DEFAULT_USD_TO_RUB_RATE
): Promise<{ amountRub: number; stars: number }[]> {
  try {
    return await generateDynamicTopUpPackages(fallback)
  } catch (error) {
    logger.error('Ошибка получения динамических пакетов пополнения:', error)
    return rubTopUpOptions
  }
}
