#!/usr/bin/env node

/**
 * 🧪 Тестовый скрипт для проверки Inngest интеграции Instagram парсинга
 * 
 * Отправляет событие напрямую в Inngest функцию instagramScraperV2
 * и проверяет что запрос успешно обработан
 */

const { Inngest } = require('inngest')

// Конфигурация Inngest клиента
const inngest = new Inngest({
  name: 'test-instagram-client',
  id: 'test-instagram-client',
  baseUrl: process.env.NODE_ENV === 'development' 
    ? 'http://localhost:8288'
    : 'https://ai-server-u14194.vm.elestio.app/api/inngest',
  isDev: process.env.NODE_ENV === 'development',
  eventKey: process.env.NODE_ENV === 'production' 
    ? process.env.INNGEST_EVENT_KEY 
    : undefined,
})

class InngestInstagramTester {
  constructor() {
    this.testParams = {
      username_or_id: 'neuro_sage',
      project_id: 37,
      max_users: 25,
      max_reels_per_user: 10,
      scrape_reels: true,
      requester_telegram_id: '144022504',
      bot_name: 'test_bot'
    }

    console.log('🚀 Inngest Instagram Tester initialized')
    console.log('📍 Environment:', process.env.NODE_ENV || 'development')
    console.log('🎯 Target URL:', process.env.NODE_ENV === 'development' 
      ? 'http://localhost:8288' 
      : 'https://ai-server-u14194.vm.elestio.app/api/inngest')
    console.log('')
  }

  async testInstagramScrapingEvent() {
    console.log('📤 === SENDING INSTAGRAM SCRAPING EVENT ===')
    
    const debugSessionId = `test-${Date.now()}`
    const eventData = {
      ...this.testParams,
      
      // Метаданные для отладки
      debug_source: 'test-script-direct',
      debug_session_id: debugSessionId,
      username: 'test_user',
      language: 'ru',
      timestamp: new Date().toISOString()
    }

    console.log('📦 Event data:')
    console.log(JSON.stringify(eventData, null, 2))
    console.log('')

    try {
      console.log('🚀 Sending event to Inngest...')
      
      const result = await inngest.send({
        name: 'instagram/scraper-v2',
        data: eventData,
        user: {
          external_id: this.testParams.requester_telegram_id
        },
        id: `test-instagram-${this.testParams.requester_telegram_id}-${Date.now()}`
      })

      console.log('✅ Event sent successfully!')
      console.log('📊 Result:', JSON.stringify(result, null, 2))
      console.log('')
      console.log(`🔍 Debug session ID: ${debugSessionId}`)
      console.log('💡 Check the AI server logs for this session ID')
      console.log('')

      return { success: true, result, debugSessionId }
    } catch (error) {
      console.log('❌ Error sending event to Inngest:')
      console.log('📄 Error:', error.message)
      if (error.response) {
        console.log('📊 Status:', error.response.status)
        console.log('📨 Response:', JSON.stringify(error.response.data, null, 2))
      }
      console.log('')

      return { success: false, error: error.message }
    }
  }

  async testInvalidEvent() {
    console.log('🚫 === TESTING INVALID EVENT DATA ===')
    
    const invalidData = {
      username_or_id: '', // Пустой username
      project_id: -1, // Негативный ID
      max_users: 500, // Превышает лимит
      requester_telegram_id: '', // Пустой ID
      debug_source: 'test-invalid-data'
    }

    console.log('📦 Invalid event data:')
    console.log(JSON.stringify(invalidData, null, 2))
    console.log('')

    try {
      console.log('🚀 Sending invalid event to test validation...')
      
      const result = await inngest.send({
        name: 'instagram/scraper-v2',
        data: invalidData,
        id: `test-invalid-${Date.now()}`
      })

      console.log('⚠️  Event sent (validation should catch this):')
      console.log('📊 Result:', JSON.stringify(result, null, 2))
      
      return { success: true, result }
    } catch (error) {
      console.log('✅ Event correctly rejected by validation:')
      console.log('📄 Error:', error.message)
      
      return { success: true, error: error.message }
    }
  }

  async runFullTest() {
    console.log('🎯 === INNGEST INSTAGRAM INTEGRATION TEST ===\n')
    
    const results = {
      validEvent: false,
      invalidEvent: false
    }

    try {
      // Test 1: Valid event
      console.log('🧪 Test 1: Valid Instagram scraping event')
      const validResult = await this.testInstagramScrapingEvent()
      results.validEvent = validResult.success
      
      // Пауза между тестами
      console.log('⏳ Waiting 2 seconds before next test...\n')
      await new Promise(resolve => setTimeout(resolve, 2000))

      // Test 2: Invalid event (optional)
      console.log('🧪 Test 2: Invalid event data (validation test)')
      const invalidResult = await this.testInvalidEvent()
      results.invalidEvent = invalidResult.success

    } catch (error) {
      console.log('💥 Test suite failed:', error.message)
    }

    // Результаты
    console.log('📊 === TEST RESULTS ===')
    console.log(`${results.validEvent ? '✅' : '❌'} Valid Event Test: ${results.validEvent ? 'PASSED' : 'FAILED'}`)
    console.log(`${results.invalidEvent ? '✅' : '❌'} Invalid Event Test: ${results.invalidEvent ? 'PASSED' : 'FAILED'}`)
    
    const passedCount = Object.values(results).filter(Boolean).length
    const totalCount = Object.keys(results).length
    
    console.log(`\n🎯 Overall: ${passedCount}/${totalCount} tests passed`)

    if (results.validEvent) {
      console.log('\n🎉 Main test passed! Instagram scraping event was sent successfully.')
      console.log('💡 Check the AI server logs to see if the event was processed.')
      console.log('📬 If you provided a valid Telegram ID, you should receive a notification when processing is complete.')
    } else {
      console.log('\n⚠️  Main test failed. Check your Inngest configuration and network connectivity.')
    }

    return results
  }
}

// Запуск тестов
if (require.main === module) {
  const tester = new InngestInstagramTester()
  
  tester.runFullTest()
    .then((results) => {
      const mainTestPassed = results.validEvent
      process.exit(mainTestPassed ? 0 : 1)
    })
    .catch((error) => {
      console.error('💥 Test suite crashed:', error.message)
      process.exit(1)
    })
}

module.exports = InngestInstagramTester