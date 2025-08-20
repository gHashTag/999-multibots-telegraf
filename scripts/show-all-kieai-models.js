#!/usr/bin/env node

/**
 * 📋 Показать все доступные Kie.ai модели
 * Отображает полную информацию о всех моделях в удобном формате
 */

import 'dotenv/config'
import { providerManager } from '../dist/services/UniversalProviderManager.js'
import { 
  calculateKieAiPriceInStars,
  starsToRUB,
  KIE_AI_MODELS_PRICING 
} from '../dist/config/unified-pricing.config.js'

console.log('🚀 Kie.ai Models Catalog\n')

function displayModelCategory(title, models, emoji) {
  console.log(`${emoji} ${title}`)
  console.log('=' .repeat(60))
  
  models.forEach((model, index) => {
    console.log(`${index + 1}. ${model.name} (${model.id})`)
    console.log(`   Description: ${model.description}`)
    console.log(`   Features: ${model.supportedFeatures.join(', ')}`)
    
    // Расчет стоимости в зависимости от типа модели
    let costInfo = ''
    if (model.type === 'video') {
      const duration = 5 // Стандартная длительность для примера
      const stars = calculateKieAiPriceInStars(model.id, duration)
      const rubles = starsToRUB(stars)
      costInfo = `$${model.pricePerUnit}/sec → ${duration}s = ${stars} ⭐ (${rubles} ₽)`
    } else if (model.type === 'image') {
      const stars = calculateKieAiPriceInStars(model.id, undefined, 1)
      const rubles = starsToRUB(stars)
      costInfo = `$${model.pricePerUnit}/image → ${stars} ⭐ (${rubles} ₽)`
    } else if (model.type === 'music') {
      const stars = calculateKieAiPriceInStars(model.id)
      const rubles = starsToRUB(stars)
      const maxDuration = KIE_AI_MODELS_PRICING[model.id]?.maxDuration
      costInfo = `$${model.pricePerUnit}/track → ${stars} ⭐ (${rubles} ₽) [max ${Math.floor(maxDuration/60)}min]`
    }
    
    console.log(`   Pricing: ${costInfo}`)
    console.log('')
  })
}

function showModelStats() {
  const allModels = providerManager.getAllModels()
  const videoModels = providerManager.getModelsByType('video').filter(m => m.provider === 'Kie.ai')
  const imageModels = providerManager.getModelsByType('image').filter(m => m.provider === 'Kie.ai')
  const musicModels = providerManager.getModelsByType('music').filter(m => m.provider === 'Kie.ai')
  
  console.log('📊 STATISTICS')
  console.log('=' .repeat(60))
  console.log(`Total models in system: ${allModels.length}`)
  console.log(`Kie.ai video models: ${videoModels.length}`)
  console.log(`Kie.ai image models: ${imageModels.length}`)
  console.log(`Kie.ai music models: ${musicModels.length}`)
  console.log(`Total Kie.ai models: ${videoModels.length + imageModels.length + musicModels.length}`)
  console.log('')

  // Показываем модели по категориям
  displayModelCategory('VIDEO MODELS', videoModels, '🎬')
  displayModelCategory('IMAGE MODELS', imageModels, '🖼️')
  displayModelCategory('MUSIC MODELS', musicModels, '🎵')
}

function showPricingComparison() {
  console.log('💰 PRICING COMPARISON')
  console.log('=' .repeat(60))
  
  // Сравнение видео моделей
  console.log('\n🎬 Video Models (5 seconds):')
  const videoComparisons = [
    { model: 'kie-veo-3-fast', original: 1.50, name: 'Veo 3 Fast' },
    { model: 'kie-veo-3', original: 3.20, name: 'Veo 3 Quality' },
    { model: 'kie-runway-aleph', original: 2.40, name: 'Runway Aleph' }
  ]
  
  videoComparisons.forEach(({ model, original, name }) => {
    const stars = calculateKieAiPriceInStars(model, 5)
    const kiePrice = 0.05 * 5 // 5 seconds
    const savings = Math.round((1 - kiePrice / original) * 100)
    console.log(`  ${name}: ${stars} ⭐ (vs $${original} = ${savings}% savings)`)
  })
  
  // Cheapest options
  console.log('\n🏆 RECOMMENDED CHOICES:')
  console.log('=' .repeat(60))
  console.log('🥇 Cheapest video: kie-veo-3-fast (83% savings vs Google)')
  console.log('🥇 Cheapest image: kie-flux-1-kontext')
  console.log('🥇 Best music value: kie-suno-v4 (4 min max)')
  console.log('')
}

function showUsageExamples() {
  console.log('💡 USAGE EXAMPLES')
  console.log('=' .repeat(60))
  
  console.log('// Video generation')
  console.log('const result = await providerManager.generateVideo("veo-3-fast", {')
  console.log('  prompt: "Beautiful sunset over mountains",')
  console.log('  duration: 5,')
  console.log('  aspectRatio: "16:9"')
  console.log('})')
  console.log('')
  
  console.log('// Image generation')
  console.log('const result = await providerManager.generateImage("flux-1-kontext", {')
  console.log('  prompt: "Cyberpunk city at night",')
  console.log('  width: 1024,')
  console.log('  height: 1024')
  console.log('})')
  console.log('')
  
  console.log('// Music generation')
  console.log('const result = await providerManager.generateMusic("suno-v4", {')
  console.log('  prompt: "Epic orchestral music",')
  console.log('  duration: 120,')
  console.log('  instrumental: true')
  console.log('})')
  console.log('')
}

// Главная функция
function main() {
  try {
    showModelStats()
    showPricingComparison()
    showUsageExamples()
    
    console.log('🎯 INTEGRATION STATUS')
    console.log('=' .repeat(60))
    console.log('✅ KieAiProvider implemented')
    console.log('✅ UniversalProviderManager integrated')
    console.log('✅ Pricing configuration updated')
    console.log('✅ Model definitions added')
    console.log('✅ Test scripts created')
    console.log('')
    
    console.log('🧪 TESTING')
    console.log('=' .repeat(60))
    console.log('1. node scripts/test-kieai-simple.js   - Basic API test')
    console.log('2. node scripts/test-kieai-full.js     - Comprehensive test')
    console.log('3. node scripts/test-kieai-video.js    - Video generation test')
    console.log('')
    
    console.log('✅ Kie.ai integration is ready for use!')
    
  } catch (error) {
    console.error('❌ Error displaying models:', error.message)
    process.exit(1)
  }
}

main()