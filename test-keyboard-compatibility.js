#!/usr/bin/env node

// Тест совместимости клавиатур между различными системами
console.log('🔧 Testing Keyboard Compatibility\n')

// Импортируем обе системы клавиатур
import { createVideoModelKeyboard, findModelByButtonText as findByHelpers } from './dist/helpers/videoModelKeyboard.js'
import { formatModelButton, findModelByButtonText as findByVideoGenerator } from './dist/modules/videoGenerator/helpers/modelMapping.js'
import { videoModelKeyboard } from './dist/modules/videoGenerator/config/models.config.js'
import { VIDEO_MODELS } from './dist/services/videoModels.js'

console.log('✅ All imports successful')

// Тестируем кнопки для моделей Kie.ai
const kieModels = ['kie-veo-3-fast', 'kie-veo-3', 'kie-runway-aleph']

console.log('\n🎬 Testing Kie.ai Models Button Formatting:')
console.log('=' .repeat(60))

for (const modelId of kieModels) {
  console.log(`\n📱 Model: ${modelId}`)
  
  // Тестируем кнопку из helpers/videoModelKeyboard
  try {
    const model = VIDEO_MODELS[modelId]
    if (model) {
      const isRu = true
      const price = Math.floor(((model.pricePerSecond * model.defaultDuration * 5) / 0.016) * 1.5)
      const buttonText = `${model.nameRu} (${price} ⭐)`
      console.log(`  🔹 Helper System: "${buttonText}"`)
      
      // Проверяем, найдет ли модель обратная функция
      const foundModel = findByHelpers(buttonText, 'text')
      console.log(`  🔍 Reverse lookup: ${foundModel || 'NOT FOUND'}`)
    }
  } catch (error) {
    console.log(`  ❌ Helper System Error: ${error.message}`)
  }
  
  // Тестируем кнопку из videoGenerator/modelMapping
  try {
    const buttonText = formatModelButton(modelId)
    console.log(`  🔹 VideoGen System: "${buttonText}"`)
    
    // Проверяем, найдет ли модель обратная функция
    const foundModel = findByVideoGenerator(buttonText)
    console.log(`  🔍 Reverse lookup: ${foundModel || 'NOT FOUND'}`)
  } catch (error) {
    console.log(`  ❌ VideoGen System Error: ${error.message}`)
  }
}

console.log('\n🎹 Testing Keyboard Generation:')
console.log('=' .repeat(60))

// Тестируем генерацию клавиатуры для текстовых моделей
console.log('\n📝 Text-to-Video Models:')
try {
  const keyboard1 = createVideoModelKeyboard(true, 'text')
  console.log('  ✅ Helper keyboard generated successfully')
} catch (error) {
  console.log(`  ❌ Helper keyboard error: ${error.message}`)
}

try {
  const keyboard2 = videoModelKeyboard(true, 'text')
  console.log('  ✅ VideoGen keyboard generated successfully')
} catch (error) {
  console.log(`  ❌ VideoGen keyboard error: ${error.message}`)
}

// Тестируем генерацию клавиатуры для image-to-video моделей
console.log('\n🖼️  Image-to-Video Models:')
try {
  const keyboard1 = createVideoModelKeyboard(true, 'image')
  console.log('  ✅ Helper keyboard generated successfully')
} catch (error) {
  console.log(`  ❌ Helper keyboard error: ${error.message}`)
}

try {
  const keyboard2 = videoModelKeyboard(true, 'image')
  console.log('  ✅ VideoGen keyboard generated successfully')
} catch (error) {
  console.log(`  ❌ VideoGen keyboard error: ${error.message}`)
}

console.log('\n✅ Keyboard Compatibility Test Complete')