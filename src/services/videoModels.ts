import { VideoModelId } from './generateTextToVideo'

// Интерфейс для информации о модели
export interface VideoModelInfo {
  id: VideoModelId
  name: string
  nameRu: string
  priceFixed?: number // Фиксированная цена в звездах
  pricePerSecond?: number // Цена в USD за секунду (для динамических моделей)
  supportedDurations?: number[] // Поддерживаемые длительности в секундах
  defaultDuration?: number // Длительность по умолчанию
  inputTypes: ('text' | 'image')[]
  maxDuration?: number // Максимальная длительность для динамических моделей
}

// Импортируем единую функцию расчета
import {
  calculateVideoPriceInStars,
  VEO_MODELS_PRICING,
  calculateKieAiPriceInStars,
  KIE_AI_MODELS_PRICING,
} from '@/config/unified-pricing.config'

// Конфигурация всех видео моделей
export const VIDEO_MODELS: Record<VideoModelId, VideoModelInfo> = {
  // Фиксированные модели
  'kling-v1.6-pro': {
    id: 'kling-v1.6-pro',
    name: 'Kling v1.6 Pro',
    nameRu: 'Kling v1.6 Pro',
    priceFixed: 9,
    inputTypes: ['text', 'image'],
  },
  'ray-v2': {
    id: 'ray-v2',
    name: 'Ray-v2',
    nameRu: 'Ray-v2',
    priceFixed: 16,
    inputTypes: ['text', 'image'],
  },
  // ❌ УДАЛЕНЫ устаревшие модели (404 ошибки):
  // - hunyuan-video-fast (18⭐) - не работает
  // - wan-image-to-video (23⭐) - не работает
  // - wan-text-to-video (23⭐) - не работает
  // - minimax (46⭐) - не работает

  // Kie.ai модели с конкурентными ценами
  'veo3_fast': {
    id: 'veo3_fast',
    name: 'Veo 3 Fast',
    nameRu: 'Veo 3 Fast',
    priceFixed: 40,
    inputTypes: ['text', 'image'],
  },
  'veo3': {
    id: 'veo3',
    name: 'Veo 3',
    nameRu: 'Veo 3',
    priceFixed: 202,
    inputTypes: ['text'],
  },
  'runway-aleph': {
    id: 'runway-aleph',
    name: 'Runway Aleph',
    nameRu: 'Runway Aleph',
    pricePerSecond:
      KIE_AI_MODELS_PRICING['runway-aleph'].pricePerSecondUSD!,
    supportedDurations:
      KIE_AI_MODELS_PRICING['runway-aleph'].supportedDurations!,
    defaultDuration: KIE_AI_MODELS_PRICING['runway-aleph'].defaultDuration!,
    maxDuration: KIE_AI_MODELS_PRICING['runway-aleph'].maxDuration,
    inputTypes: ['text', 'image'],
  },

  // OpenAI Sora 2 модели (через Kie.ai)
  'sora-2': {
    id: 'sora-2',
    name: 'Sora 2',
    nameRu: 'Sora 2',
    priceFixed: 9, // $0.15 за 10 сек = 9⭐ БЕЗ наценки (Kie.ai API pricing)
    defaultDuration: 10,
    inputTypes: ['text'],
  },
  'sora-2-pro': {
    id: 'sora-2-pro',
    name: 'Sora 2 Pro',
    nameRu: 'Sora 2 Pro',
    priceFixed: 28, // $0.45 за 10 сек standard = 28⭐ (Kie.ai API pricing)
    defaultDuration: 10,
    inputTypes: ['text'],
  },

  // Sora 2 Image-to-Video модели
  'sora-2-i2v': {
    id: 'sora-2-i2v',
    name: 'Sora 2 I2V',
    nameRu: 'Sora 2 Изображение в видео',
    priceFixed: 9, // $0.15 за 10 сек = 9⭐ (аналогично text-to-video)
    defaultDuration: 10,
    inputTypes: ['image'],
  },
  'sora-2-pro-i2v': {
    id: 'sora-2-pro-i2v',
    name: 'Sora 2 Pro I2V',
    nameRu: 'Sora 2 Pro Изображение в видео',
    priceFixed: 28, // $0.45 за 10 сек standard = 28⭐ (аналогично text-to-video)
    defaultDuration: 10,
    inputTypes: ['image'],
  },
}

/**
 * Получить цену модели в звездах
 * @param modelId ID модели
 * @param duration Длительность в секундах (для динамических моделей)
 * @returns Цена в звездах
 */
export function getModelPriceInStars(
  modelId: VideoModelId,
  duration?: number
): number {
  const model = VIDEO_MODELS[modelId]

  if (!model) {
    throw new Error(`Unknown model: ${modelId}`)
  }

  // Для фиксированных моделей
  if (model.priceFixed !== undefined) {
    return model.priceFixed
  }

  // Для динамических моделей
  if (model.pricePerSecond !== undefined) {
    const finalDuration = duration || model.defaultDuration || 4

    // Для Kie.ai моделей используем специальную функцию расчета
    if (['veo3_fast', 'veo3', 'runway-aleph'].includes(modelId)) {
      return calculateKieAiPriceInStars(modelId, finalDuration)
    }

    return calculateVideoPriceInStars(model.pricePerSecond, finalDuration)
  }

  throw new Error(`Cannot calculate price for model: ${modelId}`)
}

/**
 * Проверить, поддерживается ли длительность для модели
 * @param modelId ID модели
 * @param duration Длительность в секундах
 * @returns true если поддерживается или не требуется
 */
export function isDurationSupported(
  modelId: VideoModelId,
  duration: number
): boolean {
  const model = VIDEO_MODELS[modelId]

  if (!model || !model.supportedDurations) {
    return true // Для фиксированных моделей длительность не важна
  }

  return model.supportedDurations.includes(duration)
}

/**
 * Получить правильную длительность для модели
 * @param modelId ID модели
 * @param requestedDuration Запрошенная длительность
 * @returns Корректная длительность или undefined для фиксированных моделей
 */
export function getValidDuration(
  modelId: VideoModelId,
  requestedDuration?: number
): number | undefined {
  const model = VIDEO_MODELS[modelId]

  if (!model || !model.supportedDurations) {
    return undefined // Для фиксированных моделей
  }

  if (!requestedDuration) {
    return model.defaultDuration
  }

  // Если запрошенная длительность поддерживается
  if (model.supportedDurations.includes(requestedDuration)) {
    return requestedDuration
  }

  // Иначе возвращаем значение по умолчанию
  return model.defaultDuration
}

/**
 * Получить список всех доступных моделей для текстового ввода
 */
export function getTextToVideoModels(): VideoModelInfo[] {
  return Object.values(VIDEO_MODELS).filter(model =>
    model.inputTypes.includes('text')
  )
}

/**
 * Получить список всех доступных моделей для изображений
 */
export function getImageToVideoModels(): VideoModelInfo[] {
  return Object.values(VIDEO_MODELS).filter(model =>
    model.inputTypes.includes('image')
  )
}

/**
 * Форматировать информацию о модели для отображения
 */
export function formatModelInfo(
  modelId: VideoModelId,
  duration?: number,
  is_ru = false
): string {
  const model = VIDEO_MODELS[modelId]
  if (!model) return 'Unknown model'

  const name = is_ru ? model.nameRu : model.name
  const price = getModelPriceInStars(modelId, duration)

  if (model.supportedDurations && duration) {
    return `${name} (${duration} сек) - ${price} ⭐`
  }

  return `${name} - ${price} ⭐`
}
