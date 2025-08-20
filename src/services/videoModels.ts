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


// Конфигурация всех видео моделей
export const VIDEO_MODELS: Record<VideoModelId, VideoModelInfo> = {
  'veo-3': {
    id: 'veo-3',
    name: 'Вео 3',
    nameRu: 'Вео 3',
    priceFixed: 202,
    inputTypes: ['text'],
  },
  'veo-3-fast': {
    id: 'veo-3-fast',
    name: 'Вео 3 фаст',
    nameRu: 'Вео 3 фаст',
    priceFixed: 40,
    inputTypes: ['text', 'image'],
  },
}

/**
 * Получить цену модели в звездах
 * @param modelId ID модели
 * @param duration Длительность в секундах (не используется для фиксированных цен)
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

  return model.priceFixed!
}

/**
 * Проверить, поддерживается ли длительность для модели
 * @param modelId ID модели
 * @param duration Длительность в секундах
 * @returns true (все модели имеют фиксированную цену)
 */
export function isDurationSupported(
  modelId: VideoModelId,
  duration: number
): boolean {
  return true
}

/**
 * Получить правильную длительность для модели
 * @param modelId ID модели
 * @param requestedDuration Запрошенная длительность
 * @returns undefined (все модели имеют фиксированную цену)
 */
export function getValidDuration(
  modelId: VideoModelId,
  requestedDuration?: number
): number | undefined {
  return undefined
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

  return `${name} - ${price} ⭐`
}
