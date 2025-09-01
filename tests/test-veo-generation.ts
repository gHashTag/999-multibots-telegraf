#!/usr/bin/env node

import { generateTextToVideo } from '../src/services/generateTextToVideo'

async function testVeoGeneration() {
  console.log('🎬 Testing Veo 3 Fast video generation...\n')
  
  try {
    const result = await generateTextToVideo({
      prompt: 'shaman dancing in forest at sunset',
      videoModel: 'veo-3-fast',
      aspectRatio: '9:16',
      telegram_id: '144022504',
      username: 'test_user',
      is_ru: true,
      bot_name: 'neuro_blogger_bot',
    })
    
    console.log('✅ Generation result:', JSON.stringify(result, null, 2))
    
    if (result.success) {
      console.log('\n🎉 SUCCESS! Video URL:', result.videoUrl)
      if (result.message) {
        console.log('📝 Message:', result.message)
      }
    } else {
      console.log('\n❌ FAILED! Error:', result.error)
    }
  } catch (error) {
    console.error('💥 Exception occurred:', error)
  }
}

testVeoGeneration().catch(console.error)