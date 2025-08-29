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
  'hunyuan-video-fast': {
    id: 'hunyuan-video-fast',
    name: 'Hunyuan Fast',
    nameRu: 'Hunyuan Fast',
    priceFixed: 18,
    inputTypes: ['text'],
  },
  'wan-image-to-video': {
    id: 'wan-image-to-video',
    name: 'Wan-2.1 Image to Video',
    nameRu: 'Wan-2.1 Изображение в видео',
    priceFixed: 23,
    inputTypes: ['image'],
  },
  'wan-text-to-video': {
    id: 'wan-text-to-video',
    name: 'Wan-2.1 Text to Video',
    nameRu: 'Wan-2.1 Текст в видео',
    priceFixed: 23,
    inputTypes: ['text'],
  },
  minimax: {
    id: 'minimax',
    name: 'Minimax',
    nameRu: 'Minimax',
    priceFixed: 46,
    inputTypes: ['text', 'image'],
  },

  // Google VEO3 модели через KIE.AI
  'veo3_fast': {
    id: 'veo3_fast',
    name: 'VEO3 Fast',
    nameRu: 'VEO3 Быстрая',
    pricePerSecond: 0.05, // $0.05 за секунду
    supportedDurations: [8], // Только 8 секунд
    defaultDuration: 8,
    inputTypes: ['text'],
  },
  'veo3': {
    id: 'veo3',
    name: 'VEO3 Standard',
    nameRu: 'VEO3 Стандарт',
    pricePerSecond: 0.15, // $0.15 за секунду
    supportedDurations: [5, 10, 15, 20, 25, 30], // От 5 до 30 секунд
    defaultDuration: 10,
    maxDuration: 30,
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
