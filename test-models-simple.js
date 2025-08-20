#!/usr/bin/env node

// Простой тест моделей без загрузки всей системы
console.log('🔧 Simple Models Test\n')

// Тестируем только импорты модулей без инициализации сложных зависимостей
try {
  // Тестируем импорт VideoModelId типов
  const generateTextToVideoModule = await import('./dist/services/generateTextToVideo.js')
  console.log('✅ generateTextToVideo types imported successfully')

  // Тестируем импорт videoModels
  const videoModelsModule = await import('./dist/services/videoModels.js')
  console.log('✅ videoModels imported successfully')
  
  // Тестируем модели Kie.ai
  const { VIDEO_MODELS, getModelPriceInStars } = videoModelsModule
  const kieModels = ['kie-veo-3-fast', 'kie-veo-3', 'kie-runway-aleph']
  
  console.log('\n🎬 Testing Kie.ai Models:')
  console.log('=' .repeat(50))
  
  for (const modelId of kieModels) {
    if (VIDEO_MODELS[modelId]) {
      const model = VIDEO_MODELS[modelId]
      const price = getModelPriceInStars(modelId, model.defaultDuration)
      console.log(`  ✅ ${modelId}:`)
      console.log(`     Name: ${model.name} / ${model.nameRu}`)
      console.log(`     Default Duration: ${model.defaultDuration}s`)
      console.log(`     Price: ${price} ⭐`)
      console.log(`     Input Types: ${model.inputTypes.join(', ')}`)
    } else {
      console.log(`  ❌ ${modelId}: Model not found`)
    }
  }
  
  console.log('\n💰 Testing Price Calculations:')
  console.log('=' .repeat(50))
  
  // Тестируем разные длительности
  const durations = [2, 5, 8, 10]
  for (const modelId of ['kie-veo-3-fast']) {
    console.log(`\n  🎯 Model: ${modelId}`)
    for (const duration of durations) {
      try {
        const price = getModelPriceInStars(modelId, duration)
        console.log(`     ${duration}s → ${price} ⭐`)
      } catch (error) {
        console.log(`     ${duration}s → ERROR: ${error.message}`)
      }
    }
  }

} catch (error) {
  console.error(`❌ Import Error: ${error.message}`)
}

console.log('\n✅ Simple Models Test Complete')