#!/usr/bin/env node

/**
 * 🧪 Простой тест Kie.ai API
 * Проверяет баланс и отображает цены на модели
 */

import 'dotenv/config'
import { KieAiProvider } from '../dist/services/video-providers/KieAiProvider.js'
import { calculateKieAiPriceInStars } from '../dist/config/unified-pricing.config.js'

console.log('🚀 Starting Kie.ai Simple Test...\n')

async function testKieAiSimple() {
  try {
    // Проверяем наличие API ключа
    if (!process.env.KIE_AI_API_KEY) {
      console.error('❌ KIE_AI_API_KEY not found in environment variables')
      console.log('Please add KIE_AI_API_KEY=your_key_here to your .env file')
      process.exit(1)
    }

    console.log('✅ KIE_AI_API_KEY found')
    
    // Создаем провайдер
    const provider = new KieAiProvider()
    console.log('✅ KieAiProvider initialized')

    // Проверяем баланс аккаунта
    console.log('\n📊 Checking account balance...')
    try {
      const balance = await provider.getAccountBalance()
      console.log(`💰 Account Balance: ${balance.credits} credits`)
      
      if (balance.credits < 1) {
        console.warn('⚠️  Low balance! Consider topping up your Kie.ai account')
      }
    } catch (error) {
      console.error('❌ Failed to get account balance:', error.message)
      return
    }

    // Отображаем цены на модели
    console.log('\n💰 Model Pricing (in stars ⭐):')
    console.log('=' .repeat(50))
    
    // Видео модели
    console.log('\n🎬 VIDEO MODELS:')
    const videoModels = [
      { id: 'kie-veo-3-fast', name: 'Veo 3 Fast', duration: 5 },
      { id: 'kie-veo-3', name: 'Veo 3 Quality', duration: 8 },
      { id: 'kie-runway-aleph', name: 'Runway Aleph', duration: 6 }
    ]

    videoModels.forEach(model => {
      try {
        const stars = calculateKieAiPriceInStars(model.id, model.duration)
        console.log(`  ${model.name} (${model.duration}s): ${stars} ⭐`)
      } catch (error) {
        console.log(`  ${model.name}: Error calculating price`)
      }
    })

    // Модели изображений
    console.log('\n🖼️  IMAGE MODELS:')
    const imageModels = [
      { id: 'kie-gpt-4o-image', name: 'GPT-4o Image' },
      { id: 'kie-midjourney-v7', name: 'Midjourney v7' },
      { id: 'kie-flux-1-kontext', name: 'FLUX.1 Kontext' }
    ]

    imageModels.forEach(model => {
      try {
        const stars = calculateKieAiPriceInStars(model.id, undefined, 1)
        console.log(`  ${model.name}: ${stars} ⭐`)
      } catch (error) {
        console.log(`  ${model.name}: Error calculating price`)
      }
    })

    // Музыкальные модели
    console.log('\n🎵 MUSIC MODELS:')
    const musicModels = [
      { id: 'kie-suno-v3.5', name: 'Suno v3.5' },
      { id: 'kie-suno-v4', name: 'Suno v4' },
      { id: 'kie-suno-v4.5', name: 'Suno v4.5' },
      { id: 'kie-suno-v4.5-plus', name: 'Suno v4.5+' }
    ]

    musicModels.forEach(model => {
      try {
        const stars = calculateKieAiPriceInStars(model.id)
        console.log(`  ${model.name}: ${stars} ⭐`)
      } catch (error) {
        console.log(`  ${model.name}: Error calculating price`)
      }
    })

    console.log('\n✅ Simple test completed successfully!')
    console.log('\nNext steps:')
    console.log('1. Run `node scripts/test-kieai-full.js` for comprehensive testing')
    console.log('2. Run `node scripts/test-kieai-video.js` to test video generation')

  } catch (error) {
    console.error('❌ Test failed:', error.message)
    console.error('Stack:', error.stack)
    process.exit(1)
  }
}

testKieAiSimple()