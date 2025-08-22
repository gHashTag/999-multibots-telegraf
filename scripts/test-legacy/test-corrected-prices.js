#!/usr/bin/env node

// Тест исправленных цен для Kie.ai моделей
console.log('🎯 Тест исправленных цен Kie.ai')

// Импортируем модули
import { getModelPriceInStars, VIDEO_MODELS } from './dist/services/videoModels.js'
import { calculateKieAiPriceInStars } from './dist/config/unified-pricing.config.js'

console.log('\n✅ Модули загружены успешно')

const kieModels = ['kie-veo-3-fast', 'kie-veo-3', 'kie-runway-aleph']
const testDurations = [2, 4, 6, 8, 10]

console.log('\n🎬 Проверка цен Kie.ai моделей:')
console.log('=' .repeat(60))
console.log('ОЖИДАЕМЫЕ ЦЕНЫ: 5 ⭐ за секунду (40 ⭐ за 8 секунд)')
console.log('=' .repeat(60))

for (const modelId of kieModels) {
  console.log(`\n📱 Модель: ${modelId}`)
  const model = VIDEO_MODELS[modelId]
  
  if (!model) {
    console.log('  ❌ Модель не найдена!')
    continue
  }
  
  console.log(`  📊 Название: ${model.nameRu}`)
  console.log(`  ⏱️  Длительность по умолчанию: ${model.defaultDuration} сек`)
  
  // Проверяем цены для разных длительностей
  console.log('  💰 Цены:')
  for (const duration of testDurations) {
    try {
      // Используем основную функцию расчета из videoModels
      const priceFromVideoModels = getModelPriceInStars(modelId, duration)
      
      // Используем прямой расчет из unified-pricing
      const priceFromUnified = calculateKieAiPriceInStars(modelId, duration)
      
      const expectedPrice = duration * 5 // Ожидаем 5 ⭐ за секунду
      
      const isCorrect1 = priceFromVideoModels === expectedPrice
      const isCorrect2 = priceFromUnified === expectedPrice
      
      const status1 = isCorrect1 ? '✅' : '❌'
      const status2 = isCorrect2 ? '✅' : '❌'
      
      console.log(`     ${duration} сек: ${priceFromVideoModels} ⭐ ${status1} | Unified: ${priceFromUnified} ⭐ ${status2} (ожидается: ${expectedPrice} ⭐)`)
      
    } catch (error) {
      console.log(`     ${duration} сек: ❌ ERROR: ${error.message}`)
    }
  }
}

console.log('\n📋 Сводка ожидаемых цен:')
console.log('=' .repeat(40))
for (const duration of testDurations) {
  console.log(`${duration} сек = ${duration * 5} ⭐`)
}

console.log('\n🎯 ГЛАВНАЯ ПРОВЕРКА: kie-veo-3 за 8 секунд')
console.log('=' .repeat(40))
try {
  const price8sec = getModelPriceInStars('kie-veo-3', 8)
  const isCorrect = price8sec === 40
  const status = isCorrect ? '✅ ПРАВИЛЬНО!' : '❌ НЕПРАВИЛЬНО!'
  
  console.log(`Результат: ${price8sec} ⭐ ${status}`)
  console.log(`Ожидалось: 40 ⭐`)
  
  if (isCorrect) {
    console.log('\n🎉 ЦЕНЫ ИСПРАВЛЕНЫ УСПЕШНО!')
  } else {
    console.log('\n⚠️  ЦЕНЫ НУЖДАЮТСЯ В ДОПОЛНИТЕЛЬНОЙ КОРРЕКТИРОВКЕ')
  }
  
} catch (error) {
  console.log(`❌ Ошибка при проверке: ${error.message}`)
}

console.log('\n✅ Тест цен завершен')