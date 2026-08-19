// ✅ ДИНАМИЧЕСКОЕ ПОЛУЧЕНИЕ МОДЕЛЕЙ ИЗ OPENROUTER API

export interface SelectableModel {
  id: string
  name: string
}

interface OpenRouterModel {
  id: string
  name: string
  description?: string
  pricing?: {
    prompt?: string
    completion?: string
  }
  context_length?: number
  architecture?: {
    modality?: string
    tokenizer?: string
    instruct_type?: string
  }
  top_provider?: {
    max_completion_tokens?: number
    is_moderated?: boolean
  }
  per_request_limits?: {
    prompt_tokens?: string
    completion_tokens?: string
  }
}

interface OpenRouterModelsResponse {
  data: OpenRouterModel[]
}

// Опции для фильтрации моделей
interface ModelFilterOptions {
  maxResults?: number // максимальное количество результатов (по умолчанию 10)
}

/**
 * ✅ ДИНАМИЧЕСКОЕ ПОЛУЧЕНИЕ ТОП-10 МОДЕЛЕЙ ДЛЯ АГЕНТНОГО КОДИНГА
 * Получает актуальный список моделей из OpenRouter API
 */
export async function getAvailableModels(
  options: ModelFilterOptions = {}
): Promise<SelectableModel[]> {
  const maxResults = options.maxResults || 10

  try {
    console.log(
      '🔍 [DYNAMIC] Получаем список моделей из OpenRouter API... [Getting models from OpenRouter API]'
    )

    const openRouterApiKey = process.env.OPENROUTER_API_KEY
    if (!openRouterApiKey) {
      console.warn(
        '⚠️ [DYNAMIC] OPENROUTER_API_KEY не найден, используем fallback список'
      )
      return getFallbackModels(maxResults)
    }

    // Запрос к OpenRouter API для получения списка моделей
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${openRouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.BASE_WEBHOOK_URL || '',
        'X-Title': 'Vibee Bot',
      },
    })

    if (!response.ok) {
      console.error(
        `❌ [DYNAMIC] OpenRouter API error: ${response.status} ${response.statusText}`
      )
      return getFallbackModels(maxResults)
    }

    const data: OpenRouterModelsResponse = await response.json()

    if (!data.data || !Array.isArray(data.data)) {
      console.error('❌ [DYNAMIC] Invalid response format from OpenRouter')
      return getFallbackModels(maxResults)
    }

    console.log(
      `✅ [DYNAMIC] Получено ${data.data.length} моделей из OpenRouter API`
    )

    // ✅ Приоритет: ищем самые последние версии (3.x, 4.x, 5.x)
    const latestVersionPatterns = [
      'gemini-3',
      'claude-4.5',
      'claude-opus-4.5',
      'gpt-5',
      'gpt-4o',
      'deepseek-r1',
      'deepseek-v3',
      'llama-3.3',
      'qwen-3',
    ]

    // Фильтруем и сортируем модели для агентного кодинга
    // ✅ Приоритет: самые последние версии моделей
    const codingModels = data.data
      .filter(model => {
        // Фильтруем модели, подходящие для кодинга
        const id = model.id.toLowerCase()
        const name = model.name?.toLowerCase() || ''
        const description = model.description?.toLowerCase() || ''

        // Ищем модели от топовых провайдеров
        const topProviders = [
          'google',
          'anthropic',
          'openai',
          'deepseek',
          'meta',
          'mistral',
          'qwen',
        ]

        const isTopProvider = topProviders.some(provider =>
          id.includes(provider)
        )

        const isLatestVersion = latestVersionPatterns.some(pattern =>
          id.includes(pattern)
        )

        // Ищем ключевые слова для кодинга
        const codingKeywords = [
          'code',
          'coder',
          'coding',
          'programming',
          'agent',
          'instruct',
          'chat',
          'pro',
          'sonnet',
          'opus',
          'gemini',
          'claude',
          'gpt',
          'deepseek',
        ]

        const hasCodingKeywords =
          codingKeywords.some(keyword => id.includes(keyword)) ||
          codingKeywords.some(keyword => name.includes(keyword)) ||
          codingKeywords.some(keyword => description.includes(keyword))

        // ✅ Приоритет моделям с последними версиями
        return isTopProvider && (isLatestVersion || hasCodingKeywords)
      })
      .map(model => ({
        id: model.id,
        name: model.name || model.id,
        contextLength: model.context_length || 0,
        pricing: model.pricing,
        isLatest: latestVersionPatterns.some(pattern =>
          model.id.toLowerCase().includes(pattern)
        ),
      }))
      // ✅ Сортируем: сначала последние версии, потом по контекстному окну
      .sort((a, b) => {
        if (a.isLatest && !b.isLatest) return -1
        if (!a.isLatest && b.isLatest) return 1
        return b.contextLength - a.contextLength
      })
      // Берем топ-N моделей
      .slice(0, maxResults)
      .map(model => ({
        id: model.id,
        name: model.name,
      }))

    console.log(
      `✅ [DYNAMIC] Отфильтровано ${codingModels.length} моделей для агентного кодинга:`,
      codingModels.map(m => m.name)
    )

    return codingModels
  } catch (error) {
    console.error(
      '🚨 [DYNAMIC] Ошибка при получении моделей из OpenRouter:',
      error instanceof Error ? error.message : String(error)
    )
    return getFallbackModels(maxResults)
  }
}

/**
 * Fallback список АКТУАЛЬНЫХ моделей (если API недоступен)
 * Обновлено: январь 2025 - только самые последние версии
 */
function getFallbackModels(maxResults: number): SelectableModel[] {
  const fallbackModels: SelectableModel[] = [
    { id: 'google/gemini-3-pro', name: 'Gemini 3 Pro' },
    { id: 'google/gemini-3-deep-think', name: 'Gemini 3 Deep Think' },
    { id: 'anthropic/claude-4.5-sonnet', name: 'Claude 4.5 Sonnet' },
    { id: 'anthropic/claude-opus-4.5', name: 'Claude Opus 4.5' },
    { id: 'openai/gpt-5.1', name: 'GPT-5.1' },
    { id: 'openai/gpt-4o', name: 'GPT-4o' },
    { id: 'deepseek/deepseek-r1', name: 'DeepSeek-R1' },
    { id: 'deepseek/deepseek-v3', name: 'DeepSeek V3' },
    { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B Instruct' },
    { id: 'qwen/qwen-3', name: 'Qwen 3' },
  ]

  return fallbackModels.slice(0, maxResults)
}

// Функция для получения топовых моделей
export async function getTopModels(count = 10): Promise<SelectableModel[]> {
  return getAvailableModels({ maxResults: count })
}
