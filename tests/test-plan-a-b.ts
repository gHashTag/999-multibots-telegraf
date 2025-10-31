#!/usr/bin/env node

import { generateTextToVideo } from '../src/services/generateTextToVideo'

async function testPlanAandB() {
  console.log('🎯 Testing Plan A (Server) and Plan B (Direct Kie.ai)...\n')
  console.log('=====================================\n')
  
  try {
    // Тест генерации через Plan A/B
    console.log('📋 Attempting video generation...')
    console.log('1️⃣ Plan A: Trying server first')
    console.log('2️⃣ Plan B: Will fallback to Kie.ai if server fails\n')
    
    const result = await generateTextToVideo({
      prompt: 'futuristic city with flying cars at night',
      videoModel: 'veo-3-fast',
      aspectRatio: '9:16',
      telegram_id: '144022504',
      username: 'test_user',
      is_ru: true,
      bot_name: 'neuro_blogger_bot',
    })
    
    console.log('\n📊 Generation result:', JSON.stringify(result, null, 2))
    
    if (result.success) {
      if (result.jobId) {
        console.log('\n✅ SUCCESS! Generation started')
        console.log('📋 Task ID:', result.jobId)
        console.log('📝 Message:', result.message)
        
        // Определяем какой план сработал
        if (result.message?.includes('Plan B')) {
          console.log('\n⚠️ PLAN B was used - Server is down!')
          console.log('🔔 Admin should have been notified')
        } else {
          console.log('\n✅ PLAN A worked - Server is operational')
        }
      } else if (result.videoUrl) {
        console.log('\n✅ Video ready immediately!')
        console.log('📹 Video URL:', result.videoUrl)
      }
    } else {
      console.log('\n❌ Generation failed!')
      console.log('Error:', result.error)
    }
    
  } catch (error) {
    console.error('\n💥 Exception occurred:', error)
  }
  
  console.log('\n=====================================')
  console.log('📝 Test completed!')
}

testPlanAandB().catch(console.error)