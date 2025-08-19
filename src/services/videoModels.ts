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

  // Динамические модели Veo (используем конфигурацию из unified-pricing.config.ts)
  'veo-3': {
    id: 'veo-3',
    name: 'Google Veo 3 (Premium)',
    nameRu: 'Google Veo 3 (Премиум)',
    pricePerSecond: VEO_MODELS_PRICING['veo-3'].pricePerSecondUSD,
    supportedDurations: VEO_MODELS_PRICING['veo-3'].supportedDurations,
    defaultDuration: VEO_MODELS_PRICING['veo-3'].defaultDuration,
    inputTypes: ['text'],
  },
  'veo-3-fast': {
    id: 'veo-3-fast',
    name: 'Google Veo 3 Fast',
    nameRu: 'Google Veo 3 Fast',
    pricePerSecond: VEO_MODELS_PRICING['veo-3-fast'].pricePerSecondUSD,
    supportedDurations: VEO_MODELS_PRICING['veo-3-fast'].supportedDurations,
    defaultDuration: VEO_MODELS_PRICING['veo-3-fast'].defaultDuration,
    inputTypes: ['text', 'image'],
  },
  'veo-2': {
    id: 'veo-2',
    name: 'Google Veo 2',
    nameRu: 'Google Veo 2',
    pricePerSecond: VEO_MODELS_PRICING['veo-2'].pricePerSecondUSD,
    supportedDurations: VEO_MODELS_PRICING['veo-2'].supportedDurations,
    defaultDuration: VEO_MODELS_PRICING['veo-2'].defaultDuration,
    inputTypes: ['text'],
  },

  // Kie.ai модели с более выгодными ценами
  'kie-veo-3-fast': {
    id: 'kie-veo-3-fast',
    name: 'Kie.ai Veo 3 Fast',
    nameRu: 'Kie.ai Veo 3 Fast',
    pricePerSecond: KIE_AI_MODELS_PRICING['kie-veo-3-fast'].pricePerSecondUSD!,
    supportedDurations:
      KIE_AI_MODELS_PRICING['kie-veo-3-fast'].supportedDurations!,
    defaultDuration: KIE_AI_MODELS_PRICING['kie-veo-3-fast'].defaultDuration!,
    maxDuration: KIE_AI_MODELS_PRICING['kie-veo-3-fast'].maxDuration,
    inputTypes: ['text', 'image'],
  },
  'kie-veo-3': {
    id: 'kie-veo-3',
    name: 'Kie.ai Veo 3 Quality',
    nameRu: 'Kie.ai Veo 3 Качество',
    pricePerSecond: KIE_AI_MODELS_PRICING['kie-veo-3'].pricePerSecondUSD!,
    supportedDurations: KIE_AI_MODELS_PRICING['kie-veo-3'].supportedDurations!,
    defaultDuration: KIE_AI_MODELS_PRICING['kie-veo-3'].defaultDuration!,
    maxDuration: KIE_AI_MODELS_PRICING['kie-veo-3'].maxDuration,
    inputTypes: ['text'],
  },
  'kie-runway-aleph': {
    id: 'kie-runway-aleph',
    name: 'Kie.ai Runway Aleph',
    nameRu: 'Kie.ai Runway Aleph',
    pricePerSecond:
      KIE_AI_MODELS_PRICING['kie-runway-aleph'].pricePerSecondUSD!,
    supportedDurations:
      KIE_AI_MODELS_PRICING['kie-runway-aleph'].supportedDurations!,
    defaultDuration: KIE_AI_MODELS_PRICING['kie-runway-aleph'].defaultDuration!,
    maxDuration: KIE_AI_MODELS_PRICING['kie-runway-aleph'].maxDuration,
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
    if (modelId.startsWith('kie-')) {
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
  is_ru: boolean = false
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
