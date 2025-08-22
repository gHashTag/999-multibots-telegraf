#!/usr/bin/env node

/**
 * Тест API подключений для LipSync
 */

require('dotenv').config()

async function testReplicateConnection() {
  console.log('🔍 Тестирование Replicate API...')
  
  if (!process.env.REPLICATE_API_TOKEN) {
    console.log('❌ REPLICATE_API_TOKEN не установлен')
    return false
  }
  
  try {
    const response = await fetch('https://api.replicate.com/v1/models', {
      headers: {
        'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    })
    
    if (response.ok) {
      console.log('✅ Replicate API подключение успешно')
      return true
    } else {
      console.log(`❌ Replicate API ошибка: ${response.status} - ${response.statusText}`)
      return false
    }
  } catch (error) {
    console.log(`❌ Ошибка подключения к Replicate: ${error.message}`)
    return false
  }
}

async function testSupabaseConnection() {
  console.log('🔍 Тестирование Supabase подключения...')
  
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.log('❌ SUPABASE_URL или SUPABASE_ANON_KEY не установлены')
    return false
  }
  
  try {
    const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/`, {
      headers: {
        'apikey': process.env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
      }
    })
    
    if (response.ok || response.status === 200) {
      console.log('✅ Supabase подключение успешно')
      return true
    } else {
      console.log(`❌ Supabase ошибка: ${response.status} - ${response.statusText}`)
      return false
    }
  } catch (error) {
    console.log(`❌ Ошибка подключения к Supabase: ${error.message}`)
    return false
  }
}

async function runTests() {
  console.log('🧪 === ТЕСТИРОВАНИЕ API ПОДКЛЮЧЕНИЙ ===\n')
  
  const replicateOk = await testReplicateConnection()
  const supabaseOk = await testSupabaseConnection()
  
  console.log('\n📋 === РЕЗУЛЬТАТЫ ===')
  
  if (replicateOk && supabaseOk) {
    console.log('🟢 ВСЕ API ПОДКЛЮЧЕНИЯ РАБОТАЮТ')
    console.log('✅ LipSync готов к использованию!')
  } else {
    console.log('🔴 НЕКОТОРЫЕ API НЕ РАБОТАЮТ')
    if (!replicateOk) {
      console.log('❌ Проверьте REPLICATE_API_TOKEN')
    }
    if (!supabaseOk) {
      console.log('❌ Проверьте SUPABASE_URL и SUPABASE_ANON_KEY')
    }
  }
}

runTests().catch(console.error)
