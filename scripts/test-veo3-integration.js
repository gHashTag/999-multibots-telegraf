#!/usr/bin/env node

/**
 * Тестовый скрипт для проверки интеграции VEO3 и VEO3 FAST
 * Использование: node scripts/test-veo3-integration.js
 */

const axios = require('axios')

// Конфигурация
const API_URL = 'https://ai-server-production-production-8e2d.up.railway.app'
const TEST_USER = {
  telegram_id: '144022504',
  username: 'test_user',
  is_ru: true,
  bot_name: 'ai-training-bot'
}

// Цветной вывод в консоль
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

async function testVEO3Fast() {
  log('\n📹 Тестирование VEO3 FAST (8 секунд, $0.40)', 'cyan')
  log('=' .repeat(50), 'cyan')
  
  const requestBody = {
    prompt: 'A futuristic robot walking through a neon-lit cyberpunk city at night',
    model: 'veo3_fast',
    duration: 8,
    aspectRatio: '9:16',
    ...TEST_USER
  }
  
  try {
    log('\n📤 Отправка запроса на VEO3 FAST...', 'yellow')
    log(`URL: ${API_URL}/generate/veo3-video`, 'yellow')
    log(`Тело запроса: ${JSON.stringify(requestBody, null, 2)}`, 'yellow')
    
    const response = await axios.post(
      `${API_URL}/generate/veo3-video`,
      requestBody,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      }
    )
    
    log('\n✅ Ответ получен:', 'green')
    log(JSON.stringify(response.data, null, 2), 'green')
    
    if (response.data.success) {
      log('\n🎉 VEO3 FAST работает корректно!', 'bright')
      log(`JobId: ${response.data.jobId}`, 'bright')
      log(`Ожидаемое время генерации: 2-3 минуты`, 'bright')
      log(`Стоимость: 200 звезд ($0.40)`, 'bright')
    }
    
    return response.data
  } catch (error) {
    log('\n❌ Ошибка при тестировании VEO3 FAST:', 'red')
    log(error.response?.data || error.message, 'red')
    return null
  }
}

async function testVEO3Standard() {
  log('\n🎬 Тестирование VEO3 Standard (10 секунд, $1.50)', 'magenta')
  log('=' .repeat(50), 'magenta')
  
  const requestBody = {
    prompt: 'Epic cinematic drone shot over mountain peaks at sunset, golden hour lighting',
    model: 'veo3',
    duration: 10,
    aspectRatio: '16:9',
    ...TEST_USER
  }
  
  try {
    log('\n📤 Отправка запроса на VEO3 Standard...', 'yellow')
    log(`URL: ${API_URL}/generate/veo3-video`, 'yellow')
    log(`Тело запроса: ${JSON.stringify(requestBody, null, 2)}`, 'yellow')
    
    const response = await axios.post(
      `${API_URL}/generate/veo3-video`,
      requestBody,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      }
    )
    
    log('\n✅ Ответ получен:', 'green')
    log(JSON.stringify(response.data, null, 2), 'green')
    
    if (response.data.success) {
      log('\n🎉 VEO3 Standard работает корректно!', 'bright')
      log(`JobId: ${response.data.jobId}`, 'bright')
      log(`Ожидаемое время генерации: 5-10 минут`, 'bright')
      log(`Стоимость: 750 звезд ($1.50)`, 'bright')
    }
    
    return response.data
  } catch (error) {
    log('\n❌ Ошибка при тестировании VEO3 Standard:', 'red')
    log(error.response?.data || error.message, 'red')
    return null
  }
}

async function testInvalidRequest() {
  log('\n🔴 Тестирование обработки ошибок', 'yellow')
  log('=' .repeat(50), 'yellow')
  
  const requestBody = {
    prompt: 'Test prompt',
    model: 'veo3_fast',
    duration: 30, // Неверная длительность для VEO3 FAST
    aspectRatio: '16:9',
    ...TEST_USER
  }
  
  try {
    log('\n📤 Отправка некорректного запроса (30 сек для VEO3 FAST)...', 'yellow')
    
    const response = await axios.post(
      `${API_URL}/generate/veo3-video`,
      requestBody,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      }
    )
    
    log('\n⚠️ Неожиданный успех (должна была быть ошибка):', 'yellow')
    log(JSON.stringify(response.data, null, 2), 'yellow')
  } catch (error) {
    log('\n✅ Ошибка обработана корректно:', 'green')
    log(error.response?.data || error.message, 'green')
  }
}

async function runTests() {
  log('\n🚀 НАЧАЛО ТЕСТИРОВАНИЯ VEO3 API', 'bright')
  log('=' .repeat(60), 'bright')
  
  // Тест 1: VEO3 FAST
  const veo3FastResult = await testVEO3Fast()
  
  // Небольшая пауза между тестами
  await new Promise(resolve => setTimeout(resolve, 2000))
  
  // Тест 2: VEO3 Standard
  const veo3StandardResult = await testVEO3Standard()
  
  // Небольшая пауза между тестами
  await new Promise(resolve => setTimeout(resolve, 2000))
  
  // Тест 3: Обработка ошибок
  await testInvalidRequest()
  
  // Итоговый отчет
  log('\n📊 ИТОГОВЫЙ ОТЧЕТ', 'bright')
  log('=' .repeat(60), 'bright')
  
  const tests = [
    { name: 'VEO3 FAST', result: veo3FastResult },
    { name: 'VEO3 Standard', result: veo3StandardResult }
  ]
  
  tests.forEach(test => {
    if (test.result && test.result.success) {
      log(`✅ ${test.name}: УСПЕШНО`, 'green')
    } else if (test.result) {
      log(`⚠️ ${test.name}: ЧАСТИЧНО УСПЕШНО`, 'yellow')
    } else {
      log(`❌ ${test.name}: ОШИБКА`, 'red')
    }
  })
  
  log('\n📝 Примечания:', 'cyan')
  log('- VEO3 FAST: 8 секунд, $0.05/сек, 200 звезд', 'cyan')
  log('- VEO3 Standard: 5-30 секунд, $0.15/сек, от 375 до 2250 звезд', 'cyan')
  log('- Поддерживаемые форматы: 16:9, 9:16, 1:1', 'cyan')
  log('- Время генерации: 2-3 мин (FAST), 5-10 мин (Standard)', 'cyan')
  
  log('\n✨ Тестирование завершено!', 'bright')
}

// Запуск тестов
runTests().catch(error => {
  log('\n💥 Критическая ошибка:', 'red')
  log(error.stack || error, 'red')
  process.exit(1)
})