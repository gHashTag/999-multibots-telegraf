import { ModeEnum } from '@/interfaces'
import { logger } from '@/utils/logger'

/**
 * Расчет себестоимости операций на основе анализа данных
 * Логика основана на реальных данных из payments_v2
 */

export interface ServiceCostConfig {
  /** Базовая стоимость за единицу */
  baseCost: number
  /** Множитель для количества единиц */
  multiplier?: number
  /** Минимальная стоимость */
  minCost?: number
  /** Максимальная стоимость */
  maxCost?: number
}

/**
 * Конфигурация себестоимости для каждого сервиса
 * Основано на анализе РЕАЛЬНЫХ данных из базы данных
 * Включает только сервисы, которые реально используются в MONEY_OUTCOME операциях
 */
export const SERVICE_COST_CONFIG: Record<string, ServiceCostConfig> = {
  // 🖼️ НЕЙРОФОТО (115 операций в БД, ~18⭐ в среднем)
  // Специальная логика: 4⭐ за фото
  neuro_photo: {
    baseCost: 4, // 4⭐ за 1 фото
    multiplier: 1,
    minCost: 4,
    maxCost: 400, // для 100 фото
  },

  // 🎬 ВИДЕО СЕРВИСЫ
  // Kling Video (35 операций в БД, ~74⭐ в среднем)
  kling_video: {
    baseCost: 10,
    minCost: 10,
    maxCost: 100,
  },

  // Haiper Video (27 операций в БД, ~53⭐ в среднем)
  haiper_video: {
    baseCost: 12,
    minCost: 12,
    maxCost: 120,
  },

  // 🔍 АНАЛИЗ И УТИЛИТЫ
  // Image to Prompt (21 операция в БД, ~2⭐ в среднем)
  image_to_prompt: {
    baseCost: 1,
    minCost: 1,
    maxCost: 10,
  },

  // 🎵 АУДИО СЕРВИСЫ
  // Text to Speech (1 операция в БД, ~7⭐ в среднем)
  text_to_speech: {
    baseCost: 4,
    minCost: 4,
    maxCost: 40,
  },

  // 🤖 ОБУЧЕНИЕ МОДЕЛЕЙ
  // Model Training (1 операция в БД, ~0⭐ в среднем)
  model_training_other: {
    baseCost: 25, // Обучение модели дорого
    minCost: 25,
    maxCost: 250,
  },

  // 🎬 ДОПОЛНИТЕЛЬНЫЕ ВИДЕО СЕРВИСЫ (добавлены на основе реальных данных)
  // Minimax Video (1 операция в БД, ~390⭐ в среднем)
  minimax_video: {
    baseCost: 390, // Реальная стоимость из БД
    minCost: 390,
    maxCost: 390,
  },

  // Video Generation Other (3 операции в БД, ~158⭐ в среднем)
  video_generation_other: {
    baseCost: 158, // Реальная стоимость из БД
    minCost: 100,
    maxCost: 200,
  },

  // 🧬 МОРФИНГ СЕРВИСЫ
  // Morphing (новый сервис, предполагаемая стоимость ~126⭐)
  morphing: {
    baseCost: 84, // Реальная стоимость из логов - 84 звезды
    minCost: 84,
    maxCost: 500, // Для сложных морфингов с большим количеством изображений
  },
  morphing_seamless: {
    baseCost: 126, // Базовая стоимость для Kling морфинга
    minCost: 126,
    maxCost: 500, // Для сложных морфингов с большим количеством изображений
  },
}

/**
 * Рассчитывает себестоимость операции
 * @param serviceType - тип сервиса
 * @param metadata - метаданные операции (количество фото, длительность и т.д.)
 * @param stars - количество звезд операции (для fallback)
 * @returns себестоимость в звездах
 */
export function calculateServiceCost(
  serviceType: string | null,
  metadata?: Record<string, any>,
  stars?: number
): number {
  // Если service_type не указан, возвращаем 0
  if (!serviceType) {
    return 0
  }

  const config = SERVICE_COST_CONFIG[serviceType]

  // Если конфигурация не найдена, используем fallback
  if (!config) {
    logger.warn(`Unknown service type for cost calculation: ${serviceType}`, {
      serviceType,
      metadata,
      stars,
    })
    return 0
  }

  let cost = config.baseCost

  // Специальная логика для нейрофото
  if (serviceType === 'neuro_photo' && metadata?.num_images) {
    const numImages = parseInt(metadata.num_images.toString())
    if (!isNaN(numImages) && numImages > 0) {
      cost = numImages * config.baseCost // 4⭐ за фото
    }
  }

  // Применяем ограничения
  if (config.minCost !== undefined) {
    cost = Math.max(cost, config.minCost)
  }
  if (config.maxCost !== undefined) {
    cost = Math.min(cost, config.maxCost)
  }

  logger.debug('Service cost calculated', {
    serviceType,
    metadata,
    stars,
    calculatedCost: cost,
    config,
  })

  return cost
}

/**
 * Получает конфигурацию себестоимости для сервиса
 */
export function getServiceCostConfig(
  serviceType: string
): ServiceCostConfig | null {
  return SERVICE_COST_CONFIG[serviceType] || null
}

/**
 * Проверяет, поддерживается ли расчет себестоимости для сервиса
 */
export function isServiceCostSupported(serviceType: string): boolean {
  return serviceType in SERVICE_COST_CONFIG
}

/**
 * Получает список всех поддерживаемых сервисов
 */
export function getSupportedServices(): string[] {
  return Object.keys(SERVICE_COST_CONFIG)
}
