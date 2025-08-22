#!/usr/bin/env node

/**
 * Тест интеграции LipSync через ai-server
 * Проверяет доступные эндпоинты и API
 */

console.log('🔍 === ТЕСТ AI-SERVER LIPSYNC ===\n')

const AI_SERVER_URL = 'https://ai-server-production-production-8e2d.up.railway.app'

// Тест доступности сервера
async function testServerHealth() {
  console.log('1️⃣ Проверка доступности ai-server...')
  
  try {
    const response = await fetch(`${AI_SERVER_URL}/`)
    console.log(`   ✅ Сервер доступен: статус ${response.status}`)
    return true
  } catch (error) {
    console.log(`   ❌ Сервер недоступен: ${error.message}`)
    return false
  }
}

// Тест health endpoint
async function testHealthEndpoint() {
  console.log('\n2️⃣ Проверка health endpoint...')
  
  try {
    const response = await fetch(`${AI_SERVER_URL}/health`)
    if (response.ok) {
      const data = await response.text()
      console.log('   ✅ Health endpoint работает')
      return true
    } else {
      console.log(`   ❌ Health endpoint вернул: ${response.status}`)
      return false
    }
  } catch (error) {
    console.log(`   ❌ Ошибка health endpoint: ${error.message}`)
    return false
  }
}

// Тест API моделей
async function testModelsEndpoint() {
  console.log('\n3️⃣ Проверка доступных моделей...')
  
  const endpoints = [
    '/api/models',
    '/models', 
    '/api/v1/models',
    '/generate/models'
  ]
  
  for (const endpoint of endpoints) {
    try {
      console.log(`   🔍 Проверяем: ${endpoint}`)
      const response = await fetch(`${AI_SERVER_URL}${endpoint}`)
      
      if (response.ok) {
        const data = await response.json()
        console.log(`   ✅ ${endpoint}: найдено ${Array.isArray(data) ? data.length : Object.keys(data).length} моделей`)
        
        // Ищем LipSync модели
        const models = Array.isArray(data) ? data : Object.values(data)
        const lipsyncModels = models.filter(model => 
          typeof model === 'string' ? 
            model.toLowerCase().includes('lip') || model.toLowerCase().includes('sync') :
            model.name?.toLowerCase().includes('lip') || 
            model.name?.toLowerCase().includes('sync') ||
            model.id?.toLowerCase().includes('lip') ||
            model.id?.toLowerCase().includes('sync')
        )
        
        if (lipsyncModels.length > 0) {
          console.log(`   🎯 Найдены LipSync модели:`)
          lipsyncModels.forEach(model => {
            console.log(`      - ${typeof model === 'string' ? model : model.name || model.id}`)
          })
          return { endpoint, models: lipsyncModels }
        }
        
        return { endpoint, models: [] }
      }
    } catch (error) {
      console.log(`   ❌ ${endpoint}: ошибка - ${error.message}`)
    }
  }
  
  return null
}

// Тест LipSync эндпоинтов  
async function testLipSyncEndpoints() {
  console.log('\n4️⃣ Проверка специфических LipSync эндпоинтов...')
  
  const endpoints = [
    '/api/lipsync',
    '/generate/lipsync',
    '/generate/kling-lipsync',
    '/api/v1/lipsync',
    '/lipsync',
    '/api/generate',
    '/generate'
  ]
  
  for (const endpoint of endpoints) {
    try {
      console.log(`   🔍 Проверяем: ${endpoint}`)
      const response = await fetch(`${AI_SERVER_URL}${endpoint}`, {
        method: 'GET'
      })
      
      console.log(`   📊 ${endpoint}: статус ${response.status}`)
      
      if (response.status === 200) {
        console.log(`   ✅ ${endpoint}: работает!`)
      } else if (response.status === 405) {
        console.log(`   ⚠️ ${endpoint}: требует POST запрос`)
      } else if (response.status === 404) {
        console.log(`   ❌ ${endpoint}: не найден`)
      } else {
        const text = await response.text()
        console.log(`   ℹ️ ${endpoint}: ${text.substring(0, 100)}...`)
      }
    } catch (error) {
      console.log(`   ❌ ${endpoint}: ошибка - ${error.message}`)
    }
  }
}

// Тест с тестовыми данными
async function testLipSyncWithData() {
  console.log('\n5️⃣ Тест LipSync с тестовыми данными...')
  
  const testData = {
    video_url: 'https://example.com/test-video.mp4',
    audio_url: 'https://example.com/test-audio.mp3',
    user_id: 'test_user_123'
  }
  
  const endpoints = [
    '/generate/lipsync',
    '/api/lipsync',
    '/generate/kling-lipsync'
  ]
  
  for (const endpoint of endpoints) {
    try {
      console.log(`   🧪 Тестируем POST ${endpoint}...`)
      
      const response = await fetch(`${AI_SERVER_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testData)
      })
      
      console.log(`   📊 Статус: ${response.status}`)
      
      if (response.status === 200 || response.status === 201) {
        const result = await response.json()
        console.log(`   ✅ ${endpoint}: успешный ответ!`)
        console.log(`   📝 Ответ:`, result)
        return { endpoint, success: true, result }
      } else if (response.status === 400) {
        console.log(`   ⚠️ ${endpoint}: требуются другие параметры`)
        const error = await response.text()
        console.log(`   📝 Ошибка:`, error.substring(0, 200))
      } else {
        console.log(`   ❌ ${endpoint}: неожиданный статус`)
      }
    } catch (error) {
      console.log(`   ❌ ${endpoint}: ошибка - ${error.message}`)
    }
  }
}

// Основная функция
async function runTests() {
  const serverOk = await testServerHealth()
  if (!serverOk) {
    console.log('\n🔴 Сервер недоступен, остальные тесты пропущены')
    return
  }
  
  await testHealthEndpoint()
  const modelsResult = await testModelsEndpoint()
  await testLipSyncEndpoints()
  await testLipSyncWithData()
  
  console.log('\n📋 === ИТОГОВЫЙ АНАЛИЗ ===')
  
  if (modelsResult?.models?.length > 0) {
    console.log('✅ Найдены LipSync модели на сервере')
    console.log('✅ ai-server поддерживает LipSync')
    console.log('🎯 Рекомендуемый эндпоинт:', modelsResult.endpoint)
  } else {
    console.log('⚠️ LipSync модели не найдены')
    console.log('💡 Возможно, используется другая система именования')
  }
  
  console.log('\n🛠️ СЛЕДУЮЩИЕ ШАГИ:')
  console.log('1. Обновить конфигурацию для использования ai-server')
  console.log('2. Заменить прямые вызовы Replicate API на ai-server API')
  console.log('3. Протестировать с реальными данными')
  console.log('\n✨ Тест завершён!')
}

runTests().catch(console.error)