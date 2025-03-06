import { openai } from '@/core/openai'

// Тип для модели с рейтингом
interface ModelWithRating {
  id: string
  rating: number // чем выше, тем популярнее
  provider: string
  category?: string // категория модели
}

// Категории моделей по рейтингу
enum ModelCategory {
  TOP = 'топовые',
  HIGH = 'продвинутые',
  MEDIUM = 'хорошие',
  BASIC = 'базовые',
}

// Список популярных моделей с рейтингом
const popularModels: ModelWithRating[] = [
  // ТОП категория - самые популярные модели (рейтинг 95-100)
  {
    id: 'google/gemini-2.0-flash-001',
    rating: 100,
    provider: 'google',
    category: ModelCategory.TOP,
  },
  {
    id: 'anthropic/claude-3.7-sonnet',
    rating: 99,
    provider: 'anthropic',
    category: ModelCategory.TOP,
  },
  {
    id: 'anthropic/claude-3.5-sonnet',
    rating: 98,
    provider: 'anthropic',
    category: ModelCategory.TOP,
  },
  {
    id: 'deepseek/deepseek-r1:free',
    rating: 97,
    provider: 'deepseek',
    category: ModelCategory.TOP,
  },
  {
    id: 'google/gemini-flash-1.5-8b',
    rating: 96,
    provider: 'google',
    category: ModelCategory.TOP,
  },
  {
    id: 'anthropic/claude-3.7-sonnet:thinking',
    rating: 95,
    provider: 'anthropic',
    category: ModelCategory.TOP,
  },

  // HIGH категория - продвинутые модели (рейтинг 80-94)
  {
    id: 'google/gemini-flash-1.5',
    rating: 94,
    provider: 'google',
    category: ModelCategory.HIGH,
  },
  {
    id: 'openai/gpt-4o-mini',
    rating: 93,
    provider: 'openai',
    category: ModelCategory.HIGH,
  },
  {
    id: 'anthropic/claude-3.7-sonnet:beta',
    rating: 92,
    provider: 'anthropic',
    category: ModelCategory.HIGH,
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct',
    rating: 91,
    provider: 'meta-llama',
    category: ModelCategory.HIGH,
  },
  {
    id: 'google/gemini-2.0-pro-exp-02-05:free',
    rating: 90,
    provider: 'google',
    category: ModelCategory.HIGH,
  },
  {
    id: 'google/gemini-2.0-flash-exp:free',
    rating: 89,
    provider: 'google',
    category: ModelCategory.HIGH,
  },
  {
    id: 'anthropic/claude-3.5-sonnet:beta',
    rating: 88,
    provider: 'anthropic',
    category: ModelCategory.HIGH,
  },
  {
    id: 'mistralai/mistral-nemo',
    rating: 87,
    provider: 'mistralai',
    category: ModelCategory.HIGH,
  },
  {
    id: 'deepseek/deepseek-chat:free',
    rating: 86,
    provider: 'deepseek',
    category: ModelCategory.HIGH,
  },

  // MEDIUM категория - хорошие модели (рейтинг 60-79)
  {
    id: 'google/gemini-2.0-flash-lite-001',
    rating: 79,
    provider: 'google',
    category: ModelCategory.MEDIUM,
  },
  {
    id: 'meta-llama/llama-3.1-70b-instruct',
    rating: 78,
    provider: 'meta-llama',
    category: ModelCategory.MEDIUM,
  },
  {
    id: 'deepseek/deepseek-r1-distill-llama-70b',
    rating: 77,
    provider: 'deepseek',
    category: ModelCategory.MEDIUM,
  },
  {
    id: 'nousresearch/hermes-3-llama-3.1-405b',
    rating: 76,
    provider: 'nousresearch',
    category: ModelCategory.MEDIUM,
  },
]

// Опции для фильтрации моделей
interface ModelFilterOptions {
  minRating?: number // минимальный рейтинг
  maxResults?: number // максимальное количество результатов
  category?: ModelCategory // фильтр по категории
  provider?: string // фильтр по провайдеру
}

// Функция для извлечения провайдера из полного ID модели
function getProviderFromFullId(fullId: string): string {
  return fullId.includes('/') ? fullId.split('/')[0] : ''
}

export async function getAvailableModels(
  options: ModelFilterOptions = {}
): Promise<string[]> {
  try {
    console.log(
      '🔍 Получаем список доступных моделей... [Getting list of available models]'
    )

    // Устанавливаем значения по умолчанию
    const { minRating = 0, maxResults = 50, category, provider } = options

    // Фильтруем популярные модели по рейтингу, категории и провайдеру
    const filteredPopularModels = popularModels
      .filter(
        model =>
          model.rating >= minRating &&
          (category ? model.category === category : true) &&
          (provider
            ? getProviderFromFullId(model.id) === provider ||
              model.provider === provider
            : true)
      )
      .map(model => model.id)

    // Объединяем с моделями OpenAI
    const combinedModels = [...filteredPopularModels]

    // Удаляем дубликаты (учитывая полные ID с провайдером)
    const uniqueModels = Array.from(new Set(combinedModels))

    // Сортируем модели по рейтингу (популярные сначала)
    const sortedModels = uniqueModels.sort((a, b) => {
      const modelAInfo = popularModels.find(m => m.id === a)
      const modelBInfo = popularModels.find(m => m.id === b)

      // Если обе модели найдены в списке популярных, сравниваем их рейтинги
      if (modelAInfo && modelBInfo) {
        return modelBInfo.rating - modelAInfo.rating
      }

      // Если только одна модель найдена, она получает приоритет
      if (modelAInfo) return -1
      if (modelBInfo) return 1

      // Если ни одна модель не найдена, сохраняем исходный порядок
      return 0
    })

    console.log('models', sortedModels)

    // Ограничиваем количество результатов
    return sortedModels.slice(0, maxResults)
  } catch (error) {
    console.error(
      '🚨 Ошибка при получении моделей: [Error fetching models:]',
      error
    )

    // Фильтруем модели по умолчанию с тем же минимальным рейтингом
    const minRating = options.minRating || 0
    const category = options.category
    const provider = options.provider

    // Список моделей по умолчанию (первые 10 моделей из списка)
    const defaultModels = popularModels.slice(0, 10).map(model => model.id)

    const maxResults = 20

    // Если указан минимальный рейтинг, фильтруем модели по умолчанию
    if (minRating > 0 || category || provider) {
      return popularModels
        .filter(
          model =>
            model.rating >= minRating &&
            (category ? model.category === category : true) &&
            (provider
              ? getProviderFromFullId(model.id) === provider ||
                model.provider === provider
              : true)
        )
        .map(model => model.id)
        .slice(0, maxResults)
    }

    return defaultModels
  }
}

// Функция для получения моделей по категории
export async function getModelsByCategory(
  category: ModelCategory
): Promise<string[]> {
  return getAvailableModels({ category })
}

// Функция для получения топовых моделей
export async function getTopModels(count = 5): Promise<string[]> {
  return getAvailableModels({ minRating: 95, maxResults: count })
}

// Функция для получения моделей конкретного провайдера
export async function getProviderModels(
  provider: string,
  minRating = 0
): Promise<string[]> {
  return getAvailableModels({ provider, minRating })
}
