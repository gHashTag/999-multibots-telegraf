import {
  generateDynamicTopUpPackages,
  TOP_UP_PACKAGES,
  DEFAULT_USD_TO_RUB_RATE
} from '@/config/unified-pricing.config'

/**
 * Статические пакеты пополнения в рублях (для обратной совместимости)
 * @deprecated Используйте getDynamicRubTopUpOptions() для актуальных курсов
 */
export const rubTopUpOptions = TOP_UP_PACKAGES

/**
 * Получает динамические пакеты пополнения с актуальным курсом USDT/RUB
 * @param fallback - курс по умолчанию если API Bybit недоступен
 * @returns Promise с пакетами пополнения по актуальному курсу
 */
export async function getDynamicRubTopUpOptions(fallback = DEFAULT_USD_TO_RUB_RATE): Promise<{ amountRub: number; stars: number }[]> {
  try {
    return await generateDynamicTopUpPackages(fallback)
  } catch (error) {
    console.error('Ошибка получения динамических пакетов пополнения:', error)
    // Возвращаем статические пакеты в случае ошибки
    return rubTopUpOptions
  }
}

/**
 * Получает динамический пакет пополнения для конкретной суммы
 * @param amountRub - сумма в рублях
 * @param fallback - курс по умолчанию если API Bybit недоступен  
 * @returns Promise с пакетом пополнения
 */
export async function getDynamicRubTopUpOption(amountRub: number, fallback = DEFAULT_USD_TO_RUB_RATE): Promise<{ amountRub: number; stars: number }> {
  const { generateTopUpPackageAsync } = await import('@/config/unified-pricing.config')
  return await generateTopUpPackageAsync(amountRub, fallback)
}
