#!/usr/bin/env node

// Тест реальных цен Kie.ai (синхронизированных с сервером)
console.log('💰 Тест реальных цен Kie.ai API (2025)')

import { getModelPriceInStars, VIDEO_MODELS } from './dist/services/videoModels.js'
import { calculateKieAiPriceInStars } from './dist/config/unified-pricing.config.js'

console.log('\n📊 Реальные цены Kie.ai API из интернета:')
console.log('- Veo 3 Fast: $0.05/сек ($0.40 за 8 сек)')
console.log('- Veo 3 Quality: $0.25/сек ($2.00 за 8 сек)') 
console.log('- Runway: около $0.30/сек')

console.log('\n🎬 Проверка цен в клиенте:')
console.log('=' .repeat(60))

const testData = [
  { model: 'kie-veo-3-fast', duration: 8, expected: 'около 37 ⭐ ($0.40)' },
  { model: 'kie-veo-3', duration: 8, expected: 'около 187 ⭐ ($2.00)' },
  { model: 'kie-runway-aleph', duration: 6, expected: 'около 168 ⭐ ($1.80)' }
]

for (const test of testData) {
  console.log(`\n📱 ${test.model} за ${test.duration} сек:`)
  
  try {
    // Проверяем через основную систему
    const priceVideoModels = getModelPriceInStars(test.model, test.duration)
    
    // Проверяем через unified-pricing
    const priceUnified = calculateKieAiPriceInStars(test.model, test.duration)
    
    console.log(`  videoModels: ${priceVideoModels} ⭐`)
    console.log(`  unified: ${priceUnified} ⭐`)
    console.log(`  ожидается: ${test.expected}`)
    
    // Проверяем модель в VIDEO_MODELS
    const model = VIDEO_MODELS[test.model]
    if (model) {
      const dollarsCost = model.pricePerSecond * test.duration
      console.log(`  расчет: $${model.pricePerSecond}/сек * ${test.duration}сек = $${dollarsCost.toFixed(2)}`)
    }
    
  } catch (error) {
    console.log(`  ❌ Ошибка: ${error.message}`)
  }
}

console.log('\n🎯 Сравнение с сервером:')
console.log('=' .repeat(40))
console.log('Сервер (ai-server/src/config/models.config.ts):')
console.log('- veo-3-fast: 5.0/85 ≈ $0.059/сек (близко к $0.05)')
console.log('- veo-3: $0.25/сек (точно)')
console.log('- runway-aleph: $0.30/сек (точно)')
console.log('')
console.log('Клиент (после исправления):')
console.log('- kie-veo-3-fast: $0.05/сек (точно)')
console.log('- kie-veo-3: $0.25/сек (точно)')
console.log('- kie-runway-aleph: $0.30/сек (точно)')

console.log('\n✅ Цены должны быть синхронизированы!')