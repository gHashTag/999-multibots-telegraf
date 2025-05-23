import { openai } from '@/core/openai'

// Тип для модели с рейтингом
interface ModelWithRating {
  id: string
  name: string // человекочитаемое имя модели
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
  {
    id: 'google/gemini-2.5-pro-preview',
    name: 'Gemini 2.5 Pro Preview',
    rating: 100,
    provider: 'google',
    category: ModelCategory.TOP,
  },
  {
    id: 'anthropic/claude-opus-4',
    name: 'Claude Opus 4',
    rating: 99,
    provider: 'anthropic',
    category: ModelCategory.TOP,
  },
  {
    id: 'openai/gpt-4.1',
    name: 'GPT-4.1',
    rating: 98,
    provider: 'openai',
    category: ModelCategory.TOP,
  },
  {
    id: 'deepseek/deepseek-v3-0324:free',
    name: 'DeepSeek V3 (Free)',
    rating: 97,
    provider: 'deepseek',
    category: ModelCategory.TOP,
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct',
    name: 'Llama 3.3 70B Instruct',
    rating: 95,
    provider: 'meta-llama',
    category: ModelCategory.TOP,
  },
  {
    id: 'mistralai/mistral-nemo',
    name: 'Mistral Nemo',
    rating: 90,
    provider: 'mistralai',
    category: ModelCategory.HIGH,
  },
  {
    id: 'nousresearch/hermes-3-llama-3.1-405b',
    name: 'Hermes 3 Llama 3.1 405B',
    rating: 85,
    provider: 'nousresearch',
    category: ModelCategory.HIGH,
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

export interface SelectableModel {
  id: string
  name: string
}

export async function getAvailableModels(
  options: ModelFilterOptions = {}
): Promise<SelectableModel[]> {
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
      .map(model => ({ id: model.id, name: model.name }))

    // Объединяем с моделями OpenAI
    const combinedModels = [...filteredPopularModels]

    // Удаляем дубликаты (учитывая полные ID с провайдером)
    const uniqueModels = Array.from(
      new Set(combinedModels.map(model => JSON.stringify(model)))
    ).map(strModel => JSON.parse(strModel) as SelectableModel)

    // Сортируем модели по рейтингу (популярные сначала)
    const sortedModels = uniqueModels.sort((a, b) => {
      const modelAInfo = popularModels.find(m => m.id === a.id)
      const modelBInfo = popularModels.find(m => m.id === b.id)

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
    const defaultModels = popularModels
      .slice(0, 10)
      .map(model => ({ id: model.id, name: model.name }))

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
        .map(model => ({ id: model.id, name: model.name }))
        .slice(0, maxResults)
    }

    return defaultModels
  }
}

// Функция для получения моделей по категории
export async function getModelsByCategory(
  category: ModelCategory
): Promise<SelectableModel[]> {
  return getAvailableModels({ category })
}

// Функция для получения топовых моделей
export async function getTopModels(count = 5): Promise<SelectableModel[]> {
  return getAvailableModels({ minRating: 95, maxResults: count })
}

// Функция для получения моделей конкретного провайдера
export async function getProviderModels(
  provider: string,
  minRating = 0
): Promise<SelectableModel[]> {
  return getAvailableModels({ provider, minRating })
}
