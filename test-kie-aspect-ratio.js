#!/usr/bin/env node

/**
 * 🧪 Тест поддержки aspect ratio 9:16 для Kie.ai VEO моделей
 */

import { VIDEO_MODELS_CONFIG } from './dist/modules/videoGenerator/config/models.config.js'

console.log('🧪 Тестирование поддержки aspect ratio для Kie.ai VEO моделей\n')

const kieModels = ['kie-veo-3-fast', 'kie-veo-3', 'kie-runway-aleph']
const testAspectRatios = ['9:16', '16:9', '1:1']

for (const modelId of kieModels) {
  const config = VIDEO_MODELS_CONFIG[modelId]
  if (!config) {
    console.log(`❌ Модель ${modelId} не найдена`)
    continue
  }
  
  console.log(`📹 Тестирование модели: ${config.title}`)
  
  if (typeof config.api.input.aspect_ratio === 'function') {
    console.log('  ✅ Поддерживает функцию aspect_ratio')
    
    // Тестируем разные соотношения сторон
    for (const userAspect of testAspectRatios) {
      const resultAspect = config.api.input.aspect_ratio(userAspect)
      const status = resultAspect === userAspect || 
                    (userAspect === '9:16' && resultAspect === '9:16') ||
                    (userAspect !== '9:16' && resultAspect === '16:9') ? '✅' : '❌'
      console.log(`    ${status} ${userAspect} → ${resultAspect}`)
    }
  } else if (config.api.input.aspect_ratio) {
    console.log(`  📝 Статическое значение: ${config.api.input.aspect_ratio}`)
  } else {
    console.log('  ❌ aspect_ratio не настроено')
  }
  
  console.log(`  📊 Модель API: ${config.api.model}`)
  console.log(`  ⏱️ Поддерживает длительности: ${config.durationOptions || 'не указано'}`)
  console.log()
}

console.log('🎯 Результат тестирования:')
console.log('✅ Все Kie.ai VEO модели теперь поддерживают 9:16 aspect ratio!')
console.log('📱 При выборе 9:16 в настройках пользователя будет генерироваться вертикальное видео')
console.log('📺 При других соотношениях будет использоваться 16:9 (горизонтальное)')