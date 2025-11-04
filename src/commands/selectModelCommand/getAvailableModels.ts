import axios from 'axios'
import { openai } from '@/core/openai'

// Тип для модели с рейтингом
interface ModelWithRating {
  id: string
  name: string // человекочитаемое имя модели
  rating: number // чем выше, тем популярнее
  provider: string
  category?: string // категория модели
  pricing?: {
    prompt: number
    completion: number
  }
}

// Категории моделей по рейтинг
enum ModelCategory {
  TOP = 'топовые',
  HIGH = 'продвинутые',
  MEDIUM = 'хорошие',
  BASIC = 'базовые',
}

// Функция для получения моделей с OpenRouter API
async function fetchOpenRouterModels(): Promise<ModelWithRating[]> {
  try {
    console.log('🔍 Получаем модели с OpenRouter API...')

    const response = await axios.get('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY || 'demo'}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    })

    if (!response.data?.data) {
      throw new Error('Некорректный ответ от API')
    }

    const models = response.data.data
      .filter((model: any) => model.top_provider?.is_moderated === true)
      .sort((a: any, b: any) => {
        // Сортируем по популярности ( Context Length * Top Provider Score )
        const scoreA = (a.context_length || 0) * (a.top_provider?.score || 0)
        const scoreB = (b.context_length || 0) * (b.top_provider?.score || 0)
        return scoreB - scoreA
      })
      .slice(0, 10) // Топ 10 моделей
      .map((model: any) => ({
        id: model.id,
        name: model.name || model.id,
        rating: Math.round((model.top_provider?.score || 0) * 100),
        provider: model.id.split('/')[0] || 'unknown',
        category: ModelCategory.TOP,
        pricing: {
          prompt: model.pricing?.prompt || 0,
          completion: model.pricing?.completion || 0,
        },
      }))

    console.log(`✅ Получено ${models.length} моделей с OpenRouter API`)
    return models
  } catch (error) {
    console.error('❌ Ошибка при получении моделей с OpenRouter:', error.message)
    return []
  }
}

// Функция для получения топ моделей (API + fallback)
export async function getAvailableModels(): Promise<SelectableModel[]> {
  try {
    console.log('🔍 Получаем список доступных моделей... [Getting list of available models]')

    // Пытаемся получить модели с OpenRouter API
    const apiModels = await fetchOpenRouterModels()

    if (apiModels.length > 0) {
      console.log('✅ Используем модели из OpenRouter API')
      return apiModels
        .slice(0, 10)
        .map(model => ({ id: model.id, name: model.name }))
    }

    // Fallback: используем статический список
    console.log('⚠️ Используем fallback список моделей')
    return [
      { id: 'openai/gpt-4o', name: 'GPT-4o' },
      { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'anthropic/claude-3-5-sonnet-latest', name: 'Claude 3.5 Sonnet' },
      { id: 'anthropic/claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku' },
      { id: 'google/gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash' },
      { id: 'google/gemini-1.5-pro-latest', name: 'Gemini 1.5 Pro' },
      { id: 'deepseek/deepseek-reasoner', name: 'DeepSeek Reasoner' },
      { id: 'meta-llama/llama-3.3-70b-versatile', name: 'Llama 3.3 70B' },
      { id: 'mistralai/mistral-large-latest', name: 'Mistral Large' },
      { id: 'qwen/qwen-2.5-72b-instruct', name: 'Qwen 2.5 72B' },
    ]
  } catch (error) {
    console.error('🚨 Ошибка при получении моделей:', error)

    // Крайний fallback
    return [
      { id: 'openai/gpt-4o', name: 'GPT-4o' },
      { id: 'anthropic/claude-3-5-sonnet-latest', name: 'Claude 3.5 Sonnet' },
      { id: 'google/gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash' },
    ]
  }
}

export interface SelectableModel {
  id: string
  name: string
}

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

// Функция для получения моделей по категории
export async function getModelsByCategory(
  category: ModelCategory
): Promise<SelectableModel[]> {
  return getAvailableModels({ category })
}

// Функция для получения топовых моделей
export async function getTopModels(count = 5): Promise<SelectableModel[]> {
  return getAvailableModels({ maxResults: count })
}

// Функция для получения моделей конкретного провайдера
export async function getProviderModels(
  provider: string,
  minRating = 0
): Promise<SelectableModel[]> {
  return getAvailableModels({ provider, minRating })
}
