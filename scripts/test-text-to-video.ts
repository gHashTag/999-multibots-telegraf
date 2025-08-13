#!/usr/bin/env npx ts-node

import axios from 'axios'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

// Загружаем переменные окружения
dotenv.config({ path: resolve(__dirname, '../.env') })

// Типы моделей
type FixedPriceModel = {
  name: string
  price: number
  type: 'fixed'
}

type DynamicPriceModel = {
  name: string
  pricePerSecond: number
  durations: number[]
  default: number
  type: 'dynamic'
}

type ModelInfo = FixedPriceModel | DynamicPriceModel

// Доступные модели и их цены
const MODELS: Record<string, ModelInfo> = {
  // Фиксированные модели
  'kling-v1.6-pro': { name: 'Kling v1.6 Pro', price: 9, type: 'fixed' },
  'ray-v2': { name: 'Ray-v2', price: 16, type: 'fixed' },
  'hunyuan-video-fast': { name: 'Hunyuan Fast', price: 18, type: 'fixed' },
  'wan-text-to-video': { name: 'Wan-2.1', price: 23, type: 'fixed' },
  minimax: { name: 'Minimax', price: 46, type: 'fixed' },
  // Динамические модели Veo
  'veo-3-fast': {
    name: 'Google Veo 3 Fast',
    pricePerSecond: 0.3,
    durations: [2, 4, 6, 8],
    default: 4,
    type: 'dynamic',
  },
  'veo-2': {
    name: 'Google Veo 2',
    pricePerSecond: 0.3,
    durations: [4, 6, 8, 10],
    default: 8,
    type: 'dynamic',
  },
  'veo-3': {
    name: 'Google Veo 3 (Premium)',
    pricePerSecond: 0.4,
    durations: [2, 4, 6, 8],
    default: 8,
    type: 'dynamic',
  },
}

/**
 * Тестовый скрипт для проверки прямой интеграции с API сервера
 * для генерации видео из текста
 */
async function testTextToVideo(modelId?: string, duration?: number) {
  console.log('🚀 Начинаем тест генерации видео из текста...')
  console.log('\n🔧 Конфигурация:')
  console.log(
    `  LOCAL_SERVER_URL: ${process.env.LOCAL_SERVER_URL || 'http://localhost:4000'}`
  )
  console.log(
    `  SECRET_API_KEY: ${process.env.SECRET_API_KEY ? '✓ Установлен' : '✗ Не установлен'}`
  )

  // Определяем модель
  const selectedModel = modelId || 'kling-v1.6-pro' // Одна из самых доступных моделей по умолчанию
  const modelInfo = MODELS[selectedModel as keyof typeof MODELS]

  if (!modelInfo) {
    console.error(`❌ Неизвестная модель: ${selectedModel}`)
    console.log('\n📝 Доступные модели:')
    Object.entries(MODELS).forEach(([id, info]) => {
      console.log(`  - ${id}: ${info.name}`)
    })
    return
  }

  // Параметры для теста
  const testParams: any = {
    prompt: 'A beautiful sunset over mountains with golden light',
    videoModel: selectedModel,
    telegram_id: '144022504', // Тестовый ID
    username: 'test_user',
    is_ru: false,
    bot_name: 'neuro_blogger_bot',
  }

  // Получаем цену модели и длительность
  if (modelInfo.type === 'dynamic') {
    // Для динамических моделей (Veo)
    const { durations, default: defaultDuration, pricePerSecond } = modelInfo

    if (duration && !durations.includes(duration)) {
      console.error(
        `❌ Неподдерживаемая длительность ${duration} для ${selectedModel}`
      )
      console.log(`📝 Доступные длительности: ${durations.join(', ')} сек`)
      return
    }

    const finalDuration = duration || defaultDuration
    const price = Math.floor(((pricePerSecond * finalDuration) / 0.016) * 1.5)

    testParams.duration = finalDuration
    console.log(`\n🎬 Модель: ${modelInfo.name}`)
    console.log(`⏱️  Длительность: ${finalDuration} сек`)
    console.log(`💰 Цена: ${price} ⭐ ($${pricePerSecond.toFixed(2)}/сек)`)
  } else {
    // Для фиксированных моделей
    console.log(`\n🎬 Модель: ${modelInfo.name}`)
    console.log(`💰 Цена: ${modelInfo.price} ⭐`)
  }

  console.log('\n📤 Отправляем запрос:')
  console.log(JSON.stringify(testParams, null, 2))

  const baseUrl = process.env.LOCAL_SERVER_URL || 'http://localhost:4000'
  const url = `${baseUrl}/generate/text-to-video`

  try {
    console.log(`\n🌐 URL: ${url}`)
    console.log('⏳ Ожидаем ответ от сервера...')

    const response = await axios.post(url, testParams, {
      headers: {
        'Content-Type': 'application/json',
        'x-secret-key': process.env.SECRET_API_KEY || '',
      },
      timeout: 30000, // 30 секунд таймаут
    })

    console.log('\n✅ Успешно! Ответ сервера:')
    console.log(JSON.stringify(response.data, null, 2))

    if (response.data.message) {
      console.log(`\n🎆 ${response.data.message}`)
    }
    if (response.data.jobId) {
      console.log(`\n🆔 Job ID: ${response.data.jobId}`)
      console.log('🔍 Используйте этот ID для проверки статуса генерации')
    }
    if (response.data.videoUrl) {
      console.log(`\n🎬 Видео URL: ${response.data.videoUrl}`)
    }
  } catch (error: any) {
    console.error('\n❌ Ошибка при выполнении запроса:')

    if (error.response) {
      console.error('📊 Статус:', error.response.status)
      console.error(
        '📄 Данные ответа:',
        JSON.stringify(error.response.data, null, 2)
      )
    } else if (error.request) {
      console.error('🔌 Нет ответа от сервера')
      console.error('🔗 URL запроса:', url)
      console.error('⚠️  Проверьте, что сервер запущен на порту 4000')
    } else {
      console.error('💥 Ошибка:', error.message)
    }
  }
}

// Читаем аргументы командной строки
const args = process.argv.slice(2)
const modelId = args[0]
const duration = args[1] ? parseInt(args[1]) : undefined

// Показываем справку, если не указаны аргументы
if (!modelId) {
  console.log('📖 Использование:')
  console.log(
    '  npx ts-node scripts/test-text-to-video.ts [модель] [длительность]'
  )
  console.log('\n📝 Примеры:')
  console.log('  npx ts-node scripts/test-text-to-video.ts kling-v1.6-pro')
  console.log('  npx ts-node scripts/test-text-to-video.ts veo-3-fast 4')
  console.log('  npx ts-node scripts/test-text-to-video.ts veo-3 8')
  console.log('\n🎬 Доступные модели:')

  // Сначала фиксированные модели
  console.log('\n💲 Фиксированные модели:')
  Object.entries(MODELS)
    .filter(([_, info]) => info.type === 'fixed')
    .sort(
      (a, b) =>
        (a[1] as FixedPriceModel).price - (b[1] as FixedPriceModel).price
    )
    .forEach(([id, info]) => {
      const fixedModel = info as FixedPriceModel
      console.log(`  ${id}: ${fixedModel.name} (${fixedModel.price} ⭐)`)
    })

  // Затем динамические модели
  console.log('\n⏱️ Динамические модели:')
  Object.entries(MODELS)
    .filter(([_, info]) => info.type === 'dynamic')
    .forEach(([id, info]) => {
      const dynamicModel = info as DynamicPriceModel
      console.log(
        `  ${id}: ${dynamicModel.name} ` +
          `($${dynamicModel.pricePerSecond.toFixed(2)}/сек, ` +
          `длительность: ${dynamicModel.durations.join(', ')} сек)`
      )
    })
  console.log('')
}

// Запуск теста
testTextToVideo(modelId, duration)
