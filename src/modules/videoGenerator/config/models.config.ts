import { Markup } from 'telegraf'
import type { ReplyKeyboardMarkup } from 'telegraf/types'

// models.config.ts
export type VideoModelConfig = {
  id: string
  title: string
  description: string
  inputType: ('text' | 'image' | 'morph')[]
  basePrice: number
  api: {
    model: string
    input: Record<string, any>
  }
  requirements?: {
    minBalance?: number
    maxDuration?: number
  }
  imageKey?: string
  canMorph?: boolean
  resolutionOptions?: string[]
  priceByResolution?: Record<string, number>
  durationOptions?: number[] // Поддерживаемые длительности в секундах
  priceByDuration?: Record<number, number> // Цена за каждую длительность
  aspectRatioOptions?: string[] // Поддерживаемые соотношения сторон
}

export const VIDEO_MODELS_CONFIG: Record<string, VideoModelConfig> = {
  'veo-3': {
    id: 'veo-3',
    title: 'Вео 3',
    inputType: ['text'],
    description: '🎯 КАЧЕСТВО: Вео 3 премиум - 202⭐ за 8 сек',
    basePrice: 0.404,
    api: {
      model: 'google/veo-3',
      input: {
        duration: 8,
        aspect_ratio: (userAspect: string) =>
          userAspect === '9:16' ? '9:16' : '16:9',
      },
    },
    canMorph: false,
    aspectRatioOptions: ['16:9', '9:16'],
  },
  'veo-3-fast': {
    id: 'veo-3-fast',
    title: 'Вео 3 фаст',
    inputType: ['text', 'image'],
    description: '⚡ БЫСТРО: Вео 3 фаст - 40⭐ за 8 сек',
    basePrice: 0.08,
    api: {
      model: 'google/veo-3-fast',
      input: {
        duration: 8,
        aspect_ratio: (userAspect: string) =>
          userAspect === '9:16' ? '9:16' : '16:9',
      },
    },
    imageKey: 'image',
    canMorph: false,
    durationOptions: [8],
    aspectRatioOptions: ['16:9', '9:16'],
    priceByDuration: {
      8: 0.64,
    },
  },
}

// Определяем тип ключей конфига
type VideoModelKey = keyof typeof VIDEO_MODELS_CONFIG

// Используем ключи конфига как основу для цен
export const videoModelPrices: Record<VideoModelKey, number> =
  Object.fromEntries(
    Object.entries(VIDEO_MODELS_CONFIG).map(([key, config]) => {
      // Проверяем наличие basePrice на всякий случай
      if (typeof config.basePrice !== 'number') {
        throw new Error(
          `basePrice is missing or not a number for model key: ${key}`
        )
      }
      return [key, config.basePrice]
    })
  ) as Record<VideoModelKey, number>

export const findModelByTitle = (
  title: string,
  type: 'image' | 'text'
): string | undefined => {
  // Ищем модель по тексту кнопки
  console.log('🔍 Поиск модели по тексту:', { title, type })

  // Извлекаем имя модели из текста кнопки (удаляем цену в скобках)
  const modelTitle = title.replace(/\s*\([^)]*\)\s*$/, '').trim()

  console.log('🔍 Нормализованное имя модели:', { modelTitle })

  const foundModel = Object.entries(VIDEO_MODELS_CONFIG).find(([_, model]) => {
    const typeMatch = model.inputType.includes(type)
    const titleMatch = model.title === modelTitle

    console.log(`🔄 Проверка модели ${model.title}:`, {
      typeMatch,
      titleMatch,
      expectedTitle: modelTitle,
      actualTitle: model.title,
    })

    return titleMatch && typeMatch
  })

  if (foundModel) {
    console.log('✅ Модель найдена:', {
      key: foundModel[0],
      title: foundModel[1].title,
    })
    return foundModel[0] // Возвращаем ключ модели
  }

  console.log('❌ Модель не найдена')
  return undefined
}
export const videoModelKeyboard = (
  isRu: boolean,
  inputType: 'text' | 'image'
) => {
  console.log('🎹 Создание клавиатуры для видео-моделей:', {
    description: 'Creating video models keyboard',
    isRu,
    inputType,
  })

  // Фильтруем модели по типу ввода
  const filteredModels = Object.values(VIDEO_MODELS_CONFIG).filter(model => {
    const include = model.inputType.includes(inputType)
    console.log(`🔘 Проверка модели:`, {
      description: 'Checking model',
      modelTitle: model.title,
      modelInputTypes: model.inputType,
      matchesInputType: include,
    })
    return include
  })

  console.log('📋 Отфильтрованные модели:', {
    description: 'Filtered models',
    models: filteredModels.map(m => ({
      title: m.title,
      inputTypes: m.inputType,
    })),
  })

  // Формируем ряды кнопок по 2 в ряд
  const modelButtons: string[][] = []
  for (let i = 0; i < filteredModels.length; i += 2) {
    const row = [filteredModels[i], filteredModels[i + 1]]
      .filter(Boolean)
      .map(model => {
        let price = model.basePrice
        if (model.priceByResolution) {
          // Для моделей с разными разрешениями показываем минимальную цену
          price = Math.min(...Object.values(model.priceByResolution))
        }
        const stars = Math.floor(((price * 5) / 0.016) * 1.5)
        return `${model.title} (${stars} ⭐)`
      })

    if (row.length > 0) {
      modelButtons.push(row)
    }
  }

  // Добавляем последнюю кнопку "Назад в меню"
  const backButtonText = isRu ? '⬅️ Назад в меню' : '⬅️ Back to Menu'
  modelButtons.push([backButtonText])

  // Создаем клавиатуру
  const keyboard = Markup.keyboard(modelButtons).resize()

  console.log('✅ Клавиатура создана:', {
    description: 'Keyboard created',
    buttonRows: modelButtons,
  })
  return keyboard
}
