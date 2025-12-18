import { logger } from '@/utils/logger'

interface BybitRateItem {
  fiatUnit: string
  price: string
  payment: string
  currencyUnit: string
  [key: string]: any
}

interface BybitResponse {
  ret_code: number
  ret_msg: string
  result: {
    items: BybitRateItem[]
  }
}

const BYBIT_PUBLIC_URL =
  'https://www.bybit.com/x-api/fiat/public/channel/payment-list'
const CACHE_TTL = 300000 // 5 минут в миллисекундах для кеширования курса
const DEFAULT_RATE = 85 // Значение по умолчанию, если API недоступен

interface RateCache {
  rate: number
  timestamp: number
}

let rateCache: RateCache | null = null

/**
 * Получает актуальный курс USDT/RUB с Bybit API
 *
 * @param options - Опции запроса
 * @param options.cache - Использовать ли кеш (по умолчанию true)
 * @param options.fallback - Значение по умолчанию если API недоступен
 * @returns Текущий курс USDT/RUB
 *
 * @example
 * ```typescript
 * // Простое использование
 * const rate = await getCurrentRate()
 *
 * // Без кеша с собственным fallback
 * const rate = await getCurrentRate({ cache: false, fallback: 90 })
 * ```
 */
export async function getCurrentRate(
  options: {
    cache?: boolean
    fallback?: number
  } = {}
): Promise<number> {
  const { cache = true, fallback = DEFAULT_RATE } = options

  try {
    // Проверяем кеш если он включен
    if (cache && rateCache && Date.now() - rateCache.timestamp < CACHE_TTL) {
      logger.info('💰 Курс USDT/RUB получен из кеша', {
        rate: rateCache.rate,
      })
      return rateCache.rate
    }

    // Делаем запрос к Bybit API
    const response = await fetch(`${BYBIT_PUBLIC_URL}?crypto=USDT&fiat=RUB`, {
      headers: {
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data: BybitResponse = await response.json()

    if (data.ret_code !== 0) {
      throw new Error(`API error: ${data.ret_msg}`)
    }

    // Проверяем наличие данных
    if (!data.result || !data.result.items || !Array.isArray(data.result.items)) {
      throw new Error('Invalid API response: missing items array')
    }

    // Находим все доступные цены
    const prices = data.result.items
      .map(item => parseFloat(item.price))
      .filter(price => !isNaN(price))

    if (prices.length === 0) {
      throw new Error('No valid prices found in response')
    }

    // Берем минимальную цену как наиболее выгодную
    const minPrice = Math.min(...prices)

    // Обновляем кеш если он включен
    if (cache) {
      rateCache = {
        rate: Math.round(minPrice), // Округляем до целого числа
        timestamp: Date.now(),
      }
    }

    const rate = Math.round(minPrice)

    logger.info('💰 Получен актуальный курс USDT/RUB через Bybit', {
      rate,
      cached: cache,
      available_prices: prices.length,
    })

    return rate
  } catch (error) {
    logger.error('❌ Ошибка получения курса USDT/RUB', {
      error: error instanceof Error ? error.message : 'Unknown error',
      using_fallback: fallback,
    })

    // В случае ошибки возвращаем кеш или fallback
    return cache ? rateCache?.rate || fallback : fallback
  }
}

/**
 * Очищает кеш курса валют
 */
export function clearRateCache(): void {
  rateCache = null
  logger.info('🧹 Кеш курса валют очищен')
}
