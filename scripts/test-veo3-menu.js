#!/usr/bin/env node

const { VIDEO_MODELS_CONFIG } = require('../dist/modules/videoGenerator/config/models.config')
const { calculateFinalPrice } = require('../dist/price/helpers/calculateFinalPrice')

console.log('\n🎬 ПРОВЕРКА ОТОБРАЖЕНИЯ VEO3 МОДЕЛЕЙ В МЕНЮ')
console.log('=' .repeat(60))

// Фильтруем модели для text input (как в меню)
const textModels = Object.entries(VIDEO_MODELS_CONFIG)
  .filter(([key, config]) => config.inputType.includes('text'))

console.log('\n📋 Модели с поддержкой текстового ввода:')
textModels.forEach(([key, config]) => {
  const price = calculateFinalPrice(key)
  console.log(`✅ ${config.title} (${price} ⭐) - key: ${key}`)
})

// Проверим VEO3 модели отдельно
console.log('\n🔍 Проверка VEO3 моделей:')
const veo3Fast = VIDEO_MODELS_CONFIG['veo3_fast']
const veo3 = VIDEO_MODELS_CONFIG['veo3']

if (veo3Fast) {
  const price = calculateFinalPrice('veo3_fast')
  console.log(`✅ VEO3 Fast найдена:`)
  console.log(`   - Название: ${veo3Fast.title}`)
  console.log(`   - Цена: ${price} ⭐`)
  console.log(`   - inputType: ${veo3Fast.inputType}`)
} else {
  console.log('❌ VEO3 Fast НЕ НАЙДЕНА!')
}

if (veo3) {
  const price = calculateFinalPrice('veo3')
  console.log(`✅ VEO3 Standard найдена:`)
  console.log(`   - Название: ${veo3.title}`)
  console.log(`   - Цена: ${price} ⭐`)
  console.log(`   - inputType: ${veo3.inputType}`)
} else {
  console.log('❌ VEO3 Standard НЕ НАЙДЕНА!')
}

console.log('\n' + '=' .repeat(60))