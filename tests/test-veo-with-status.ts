#!/usr/bin/env node

import { generateTextToVideo, checkVideoGenerationStatus } from '../src/services/generateTextToVideo'

async function testVeoWithStatus() {
  console.log('🎬 Testing Veo 3 Fast video generation with status checking...\n')
  
  try {
    // Запускаем генерацию
    const result = await generateTextToVideo({
      prompt: 'beautiful sunset over mountains',
      videoModel: 'veo-3-fast',
      aspectRatio: '9:16',
      telegram_id: '144022504',
      username: 'test_user',
      is_ru: true,
      bot_name: 'neuro_blogger_bot',
    })
    
    console.log('✅ Generation result:', JSON.stringify(result, null, 2))
    
    if (result.success && result.jobId) {
      console.log('\n📋 Task ID:', result.jobId)
      console.log('⏳ Checking status...\n')
      
      // Проверяем статус каждые 5 секунд
      let attempts = 0
      const maxAttempts = 60 // 5 минут максимум
      
      const checkInterval = setInterval(async () => {
        attempts++
        
        const statusResult = await checkVideoGenerationStatus(result.jobId!, true)
        
        console.log(`[Attempt ${attempts}/${maxAttempts}] Status:`, {
          success: statusResult.success,
          hasVideoUrl: !!statusResult.videoUrl,
          error: statusResult.error
        })
        
        if (statusResult.success && statusResult.videoUrl) {
          console.log('\n🎉 VIDEO READY!')
          console.log('📹 Video URL:', statusResult.videoUrl)
          clearInterval(checkInterval)
          process.exit(0)
        } else if (!statusResult.success && statusResult.error && !statusResult.error.includes('генерируется')) {
          console.log('\n❌ Generation failed:', statusResult.error)
          clearInterval(checkInterval)
          process.exit(1)
        } else if (attempts >= maxAttempts) {
          console.log('\n⏱️ Timeout - video generation took too long')
          clearInterval(checkInterval)
          process.exit(1)
        }
      }, 5000)
      
    } else if (result.success && result.videoUrl) {
      console.log('\n🎉 VIDEO READY IMMEDIATELY!')
      console.log('📹 Video URL:', result.videoUrl)
    } else {
      console.log('\n❌ FAILED! Error:', result.error)
    }
  } catch (error) {
    console.error('💥 Exception occurred:', error)
  }
}

testVeoWithStatus().catch(console.error)