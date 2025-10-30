#!/usr/bin/env node

/**
 * 🧪 ТЕСТ ПРАВИЛЬНОСТИ РАСЧЁТА СТОИМОСТИ ALL_MODELS
 *
 * Проверяет корректность ценообразования для режима "Все сразу"
 */

console.log('💰 ТЕСТ ЦЕНООБРАЗОВАНИЯ AI PHOTOSHOP ALL_MODELS')
console.log('=' .repeat(60))

// Импортируем скомпилированный модуль
const path = require('path')
const AI_PHOTOSHOP = require('../../dist/scenes/aiPhotoshopScene/index.js')

console.log('\n🔍 Проверка доступности AI_PHOTOSHOP_PRICING...')

// Проверим, что модуль экспортирован
if (!AI_PHOTOSHOP.AI_PHOTOSHOP_PRICING) {
  console.log('❌ AI_PHOTOSHOP_PRICING не экспортирован из модуля!')
  console.log('Доступные экспорты:', Object.keys(AI_PHOTOSHOP))

  // Читаем файл напрямую для анализа
  const fs = require('fs')
  const scenePath = path.join(__dirname, '../../src/scenes/aiPhotoshopScene/index.ts')
  const content = fs.readFileSync(scenePath, 'utf8')

  // Парсим модели вручную
  const modelsMatch = content.match(/const AI_PHOTOSHOP_MODELS = \{([\s\S]*?)\n\}/m)
  if (modelsMatch) {
    const modelsBlock = modelsMatch[1]
    const modelKeys = modelsBlock.match(/^\s+(\w+):\s*\{/gm)

    if (modelKeys) {
      const count = modelKeys.length
      const keys = modelKeys.map(m => m.match(/(\w+):/)[1])

      console.log(`\n✅ Найдено ${count} моделей в исходниках:`)
      keys.forEach((key, i) => {
        console.log(`   ${i + 1}. ${key}`)
      })

      // Парсим цены
      const pricingMatch = content.match(/get models\(\) \{[\s\S]*?return \{([\s\S]*?)\}/m)
      if (pricingMatch) {
        console.log('\n💎 Найденные цены в коде:')
        const prices = pricingMatch[1].match(/(\w+):.+?\/\/ \$[\d.]+\s*→\s*(\d+)⭐/g)

        let totalBase = 0
        prices.forEach(price => {
          const match = price.match(/(\w+):.+?\/\/ \$[\d.]+\s*→\s*(\d+)⭐/)
          if (match) {
            console.log(`   ${match[1]}: ${match[2]}⭐`)
            totalBase += parseInt(match[2])
          }
        })

        console.log(`\n📊 СУММАРНАЯ СТОИМОСТЬ (БЕЗ КАЧЕСТВА): ${totalBase}⭐`)
        console.log(`\n📐 С МНОЖИТЕЛЯМИ КАЧЕСТВА:`)
        console.log(`   1K (×1): ${totalBase}⭐`)
        console.log(`   2K (×4): ${totalBase * 4}⭐`)
        console.log(`   4K (×6): ${totalBase * 6}⭐`)

        console.log(`\n🎯 ОЖИДАЕМОЕ В UI:`)
        console.log(`   "🎯 Все сразу (${totalBase}⭐)" в селекторе`)
        console.log(`   "1K - ${totalBase}⭐" в выборе качества`)
        console.log(`   "2K - ${totalBase * 4}⭐" в выборе качества`)
        console.log(`   "4K - ${totalBase * 6}⭐" в выборе качества`)

        console.log(`\n❌ НЕПРАВИЛЬНО (СТАРЫЕ ЗНАЧЕНИЯ):`)
        console.log(`   "🎯 Все сразу (34⭐)" - 4 модели × ~8.5⭐`)
        console.log(`   "4K - 204⭐" - 34⭐ × 6 = 204⭐`)
      }
    }
  }

  console.log(`\n⚠️  РЕШЕНИЕ: Нужно перезапустить бота или пересобрать проект!`)
  process.exit(1)
}

// Если модуль доступен, проверяем цены
const pricing = AI_PHOTOSHOP.AI_PHOTOSHOP_PRICING

console.log('✅ AI_PHOTOSHOP_PRICING найден!')
console.log('\n💎 Проверка цен моделей:')

const models = pricing.models
const modelKeys = Object.keys(models)

console.log(`Количество моделей: ${modelKeys.length}`)

let totalBase = 0
modelKeys.forEach((key, i) => {
  const cost = models[key]
  console.log(`${i + 1}. ${key}: ${cost}⭐`)
  totalBase += cost
})

console.log(`\n📊 ИТОГОВАЯ СТОИМОСТЬ (БЕЗ КАЧЕСТВА): ${totalBase}⭐`)
console.log(`Проверка getAllModelsCost(): ${pricing.getAllModelsCost()}⭐`)

if (totalBase !== pricing.getAllModelsCost()) {
  console.log('❌ ОШИБКА: Ручная сумма не совпадает с getAllModelsCost()!')
} else {
  console.log('✅ Ручная сумма совпадает с getAllModelsCost()')
}

console.log(`\n📐 С МНОЖИТЕЛЯМИ КАЧЕСТВА:`)
console.log(`   1K (×1): ${pricing.getAllModelsWithQuality('1K')}⭐`)
console.log(`   2K (×4): ${pricing.getAllModelsWithQuality('2K')}⭐`)
console.log(`   4K (×6): ${pricing.getAllModelsWithQuality('4K')}⭐`)

console.log('\n' + '='.repeat(60))
console.log('✅ ТЕСТ ЗАВЕРШЁН!')
