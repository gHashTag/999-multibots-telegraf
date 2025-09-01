#!/usr/bin/env node

// Временно переопределяем API_URL для теста Plan A с production сервером
process.env.USE_PRODUCTION_API = 'true'

import { generateTextToVideo } from '../src/services/generateTextToVideo'

async function testPlanAProduction() {
  console.log('🎯 Testing Plan A with Production Server...\n')
  console.log('=====================================\n')
  console.log('📌 Server URL: https://ai-server-production-production-8e2d.up.railway.app')
  console.log('📌 Endpoint: /api/v1/veo/generate\n')
  
  try {
    const result = await generateTextToVideo({
      prompt: 'magical forest with glowing mushrooms',
      videoModel: 'veo-3-fast',
      aspectRatio: '16:9',
      telegram_id: '144022504',
      username: 'test_user',
      is_ru: true,
      bot_name: 'neuro_blogger_bot',
    })
    
    console.log('\n📊 Generation result:', JSON.stringify(result, null, 2))
    
    if (result.success) {
      if (result.message?.includes('Plan B')) {
        console.log('\n⚠️ PLAN B was used - Server endpoint not found!')
        console.log('🔔 Admin was notified about server issue')
      } else {
        console.log('\n✅ PLAN A SUCCESS - Server is working!')
        console.log('✨ No admin notification needed')
      }
      
      if (result.jobId) {
        console.log('📋 Task ID:', result.jobId)
      }
    } else {
      console.log('\n❌ Generation failed!')
      console.log('Error:', result.error)
    }
    
  } catch (error) {
    console.error('\n💥 Exception occurred:', error)
  }
  
  console.log('\n=====================================')
}

testPlanAProduction().catch(console.error)