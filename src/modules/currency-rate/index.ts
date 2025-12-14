import { logger } from '@/utils/logger'

// Константы
const CACHE_TTL = 300000 // 5 минут в миллисекундах для кеширования курса
const DEFAULT_RATE = 103 // Фиксированный курс по умолчанию

interface RateCache {
  rate: number
  timestamp: number
}

let rateCache: RateCache | null = null

/**
 * Получить курс через Binance P2P API
 */
async function fetchFromBinance(): Promise<number | null> {
  try {
    const response = await fetch('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fiat: 'RUB',
        page: 1,
        rows: 10,
        tradeType: 'SELL',
        asset: 'USDT',
        countries: [],
        proMerchantAds: false,
        publisherType: null,
        payTypes: [],
      }),
    })

    if (!response.ok) return null

    const data = await response.json()
    const prices = data?.data?.map((item: any) => parseFloat(item.adv?.price)).filter((p: number) => !isNaN(p))

    if (prices && prices.length > 0) {
      return Math.round(Math.min(...prices))
    }
    return null
  } catch {
    return null
  }
}

/**
 * Получить курс через ExchangeRate-API (бесплатный)
 */
async function fetchFromExchangeRateApi(): Promise<number | null> {
  try {
    // Используем бесплатный API курсов через USD как промежуточную валюту
    const response = await fetch('https://open.er-api.com/v6/latest/USD', {
      headers: { Accept: 'application/json' },
    })

    if (!response.ok) return null

    const data = await response.json()
    const rubRate = data?.rates?.RUB

    if (rubRate && typeof rubRate === 'number') {
      return Math.round(rubRate)
    }
    return null
  } catch {
    return null
  }
}

/**
 * Получить курс через CoinGecko (USDT в RUB)
 */
async function fetchFromCoingecko(): Promise<number | null> {
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=rub',
      {
        headers: { Accept: 'application/json' },
      }
    )

    if (!response.ok) return null

    const data = await response.json()
    const rubRate = data?.tether?.rub

    if (rubRate && typeof rubRate === 'number') {
      return Math.round(rubRate)
    }
    return null
  } catch {
    return null
  }
}

/**
 * Получает актуальный курс USDT/RUB с нескольких API
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
      // Кеш ещё актуален - возвращаем без логов, чтобы не засорять
      return rateCache.rate
    }

    // Пробуем получить курс из разных источников
    let rate: number | null = null
    let source = ''

    // 1. Пробуем ExchangeRate-API (самый стабильный)
    rate = await fetchFromExchangeRateApi()
    if (rate) source = 'ExchangeRate-API'

    // 2. Если не получилось - пробуем CoinGecko
    if (!rate) {
      rate = await fetchFromCoingecko()
      if (rate) source = 'CoinGecko'
    }

    // 3. Если не получилось - пробуем Binance P2P
    if (!rate) {
      rate = await fetchFromBinance()
      if (rate) source = 'Binance P2P'
    }

    if (rate) {
      // Обновляем кеш если он включен
      if (cache) {
        rateCache = {
          rate,
          timestamp: Date.now(),
        }
      }

      logger.info({
        message: '💰 Получен актуальный курс USDT/RUB',
        rate,
        source,
        cached: cache,
      })

      return rate
    }

    // Если все API недоступны - используем кеш или fallback
    throw new Error('All currency rate APIs failed')
  } catch (error) {
    // Логируем ошибку только раз в 5 минут, чтобы не засорять логи
    const shouldLog = !rateCache || Date.now() - rateCache.timestamp > CACHE_TTL
    if (shouldLog) {
      logger.warn({
        message: '⚠️ Курс USDT/RUB: используем fallback',
        error: error instanceof Error ? error.message : 'Unknown error',
        using_fallback: rateCache?.rate || fallback,
      })
    }

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
