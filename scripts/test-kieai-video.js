#!/usr/bin/env node

/**
 * 🧪 Тест генерации видео через Kie.ai
 * Тестирует реальную генерацию видео с самой дешевой моделью
 */

import 'dotenv/config'
import { KieAiProvider } from '../dist/services/video-providers/KieAiProvider.js'
import { providerManager } from '../dist/services/UniversalProviderManager.js'

console.log('🚀 Starting Kie.ai Video Generation Test...\n')

async function testVideoGeneration() {
  try {
    // Проверяем наличие API ключа
    if (!process.env.KIE_AI_API_KEY) {
      console.error('❌ KIE_AI_API_KEY not found in environment variables')
      console.log('Please add KIE_AI_API_KEY=your_key_here to your .env file')
      process.exit(1)
    }

    console.log('✅ KIE_AI_API_KEY found')
    
    // Проверяем баланс
    const provider = new KieAiProvider()
    console.log('\n📊 Checking account balance...')
    
    try {
      const balance = await provider.getAccountBalance()
      console.log(`💰 Account Balance: ${balance.credits} credits`)
      
      if (balance.credits < 10) {
        console.warn('⚠️  Low balance! Video generation may fail')
        console.log('Consider topping up your Kie.ai account before testing')
      }
    } catch (error) {
      console.error('❌ Failed to get account balance:', error.message)
      return
    }

    // Тестируем UniversalProviderManager
    console.log('\n🔧 Testing UniversalProviderManager...')
    
    // Получаем все доступные модели
    const allModels = providerManager.getAllModels()
    const videoModels = providerManager.getModelsByType('video')
    const kieModels = providerManager.getModelsByProvider('Kie.ai')
    
    console.log(`📋 Total models: ${allModels.length}`)
    console.log(`🎬 Video models: ${videoModels.length}`)
    console.log(`🏭 Kie.ai models: ${kieModels.length}`)
    
    // Выводим Kie.ai видео модели
    console.log('\n🎬 Available Kie.ai Video Models:')
    videoModels
      .filter(m => m.provider === 'Kie.ai')
      .forEach(model => {
        console.log(`  • ${model.name} (${model.id}) - $${model.pricePerUnit}/sec`)
      })

    // Тестируем самую дешевую модель
    const testModel = 'veo-3-fast' // Самая дешевая модель
    console.log(`\n🧪 Testing video generation with model: ${testModel}`)
    
    const testPrompt = 'A beautiful sunset over mountains, cinematic shot, 4K quality'
    const testDuration = 2 // Минимальная длительность для экономии
    
    console.log(`📝 Prompt: "${testPrompt}"`)
    console.log(`⏱️  Duration: ${testDuration} seconds`)
    
    console.log('\n⏳ Starting video generation... (this may take 1-3 minutes)')
    const startTime = Date.now()
    
    try {
      const result = await providerManager.generateVideo(testModel, {
        prompt: testPrompt,
        duration: testDuration,
        aspectRatio: '16:9'
      })
      
      const endTime = Date.now()
      const processingTime = Math.round((endTime - startTime) / 1000)
      
      console.log('\n✅ Video generation completed!')
      console.log(`⏱️  Processing time: ${processingTime} seconds`)
      console.log(`💰 Cost: $${result.cost.usd} USD (${result.cost.stars} ⭐)`)
      console.log(`🎬 Video URL: ${result.data?.videoUrl}`)
      console.log(`📊 Provider: ${result.provider}`)
      console.log(`🤖 Model: ${result.model}`)
      
      if (result.data?.taskId) {
        console.log(`🆔 Task ID: ${result.data.taskId}`)
      }
      
      // Проверяем, что URL валидный
      if (result.data?.videoUrl && result.data.videoUrl.startsWith('http')) {
        console.log('✅ Video URL appears to be valid')
      } else {
        console.warn('⚠️  Video URL may be invalid')
      }
      
    } catch (error) {
      console.error('❌ Video generation failed:', error.message)
      
      // Предлагаем альтернативы при ошибке
      if (error.message.includes('credits') || error.message.includes('balance')) {
        console.log('\n💡 Possible solutions:')
        console.log('1. Top up your Kie.ai account balance')
        console.log('2. Check your API key permissions')
      } else if (error.message.includes('rate limit')) {
        console.log('\n💡 Possible solutions:')
        console.log('1. Wait a few minutes and try again')
        console.log('2. Upgrade your Kie.ai plan')
      } else {
        console.log('\n💡 Possible solutions:')
        console.log('1. Check your internet connection')
        console.log('2. Verify your API key is correct')
        console.log('3. Try a simpler prompt')
      }
    }

    // Тестируем health check
    console.log('\n🏥 Testing provider health check...')
    const isHealthy = await providerManager.checkProviderHealth('Kie.ai')
    console.log(`Provider health: ${isHealthy ? '✅ Healthy' : '❌ Unhealthy'}`)

    console.log('\n✅ Video generation test completed!')

  } catch (error) {
    console.error('❌ Test failed:', error.message)
    console.error('Stack:', error.stack)
    process.exit(1)
  }
}

testVideoGeneration()