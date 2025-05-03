import {
  VIDEO_MODELS_CONFIG,
  VideoModelConfig,
} from '@/price/models/VIDEO_MODELS_CONFIG'

/**
 * Finds a video model ID by its title and input type.
 * @param title - The title to search for (case-insensitive, trimmed).
 * @param type - The required input type ('image' or 'text').
 * @returns The model ID string if found, otherwise undefined.
 */
export const findModelByTitle = (
  title: string,
  type: 'image' | 'text'
): string | undefined => {
  console.log('🔍 Поиск модели по заголовку:', {
    inputTitle: title.trim(),
    inputType: type,
  })

  const foundModel = Object.values(VIDEO_MODELS_CONFIG).find(
    (model: VideoModelConfig) => {
      const normalizedInput = title.toLowerCase().trim()
      const normalizedModelTitle = model.title.toLowerCase().trim()

      const titleMatch = normalizedModelTitle === normalizedInput
      const typeMatch = model.inputType.includes(type)

      console.log(`🔄 Проверка "${model.title}" [${model.inputType}]:`, {
        titleMatch,
        typeMatch,
      })

      return titleMatch && typeMatch
    }
  )

  const resultId = foundModel?.id
  console.log('🔎 Результат поиска:', resultId || 'Модель не найдена')
  return resultId
}
