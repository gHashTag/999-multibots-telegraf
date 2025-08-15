#!/usr/bin/env npx ts-node

import { VIDEO_MODELS, getModelPriceInStars } from '../src/services/videoModels'
import { VideoModelId } from '../src/services/generateTextToVideo'

console.log('🎬 ТЕСТИРОВАНИЕ ДИНАМИЧЕСКОГО ЦЕНООБРАЗОВАНИЯ VEO МОДЕЛЕЙ\n')
console.log('='.repeat(60))

// Тестируем все VEO модели
const veoModels: VideoModelId[] = ['veo-3', 'veo-3-fast', 'veo-2']

for (const modelId of veoModels) {
  const model = VIDEO_MODELS[modelId]

  if (!model) {
    console.log(`❌ Модель ${modelId} не найдена!`)
    continue
  }

  console.log(`\n📹 ${model.name} (${model.nameRu})`)
  console.log('-'.repeat(50))
  console.log(`💰 Цена за секунду: $${model.pricePerSecond}`)
  console.log(`⏱️  Длительность по умолчанию: ${model.defaultDuration} сек`)
  console.log(
    `📊 Поддерживаемые длительности: ${model.supportedDurations?.join(', ')} сек`
  )

  if (model.supportedDurations) {
    console.log('\n💎 Цены по длительностям:')
    for (const duration of model.supportedDurations) {
      const price = getModelPriceInStars(modelId, duration)
      const isDefault = duration === model.defaultDuration
      const usdPrice = duration * (model.pricePerSecond || 0)
      console.log(
        `   ${duration} сек: ${price} ⭐ ($${usdPrice.toFixed(2)})${isDefault ? ' ⭐ (по умолчанию)' : ''}`
      )
    }
  }
}

console.log('\n' + '='.repeat(60))
console.log('\n📊 СРАВНЕНИЕ С ФИКСИРОВАННЫМИ МОДЕЛЯМИ:\n')

// Показываем несколько фиксированных моделей для сравнения
const fixedModels: VideoModelId[] = ['kling-v1.6-pro', 'minimax', 'ray-v2']

for (const modelId of fixedModels) {
  const model = VIDEO_MODELS[modelId]
  if (model) {
    const price = getModelPriceInStars(modelId)
    console.log(`${model.name}: ${price} ⭐ (фиксированная цена)`)
  }
}

console.log('\n✅ Тестирование завершено!')
