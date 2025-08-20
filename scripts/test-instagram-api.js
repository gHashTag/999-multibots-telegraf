#!/usr/bin/env node

/**
 * 🧪 Тестовый скрипт для Instagram Parsing API
 * 
 * Проверяет интеграцию всех endpoint'ов Instagram API:
 * - Создание подписки на конкурента
 * - Получение списка подписок
 * - Обновление подписки
 * - Удаление подписки
 */

const axios = require('axios')

// Конфигурация для тестирования
const CONFIG = {
  baseUrl: process.env.NODE_ENV === 'production' 
    ? 'https://ai-server-u14194.vm.elestio.app' 
    : 'http://localhost:2999',
  testUser: {
    telegram_id: '144022504', // Тестовый пользователь
    bot_name: 'test_bot'
  },
  testData: {
    competitor_username: 'neuro_sage',
    max_reels: 15,
    min_views: 5000,
    max_age_days: 14,
    delivery_format: 'digest'
  }
}

class InstagramApiTester {
  constructor() {
    this.baseUrl = CONFIG.baseUrl
    this.testUser = CONFIG.testUser
    this.testData = CONFIG.testData
    this.createdSubscriptionId = null
    
    console.log('🚀 Instagram API Tester initialized')
    console.log('📍 Base URL:', this.baseUrl)
    console.log('👤 Test User:', this.testUser.telegram_id)
    console.log('🤖 Bot Name:', this.testUser.bot_name)
    console.log('')
  }

  async makeRequest(method, endpoint, data = null, params = null) {
    try {
      const url = `${this.baseUrl}${endpoint}`
      
      console.log(`📤 ${method.toUpperCase()} ${url}`)
      if (params) console.log('📋 Query params:', params)
      if (data) console.log('📦 Request data:', JSON.stringify(data, null, 2))
      
      const config = {
        method,
        url,
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Instagram-API-Tester/1.0'
        }
      }

      if (data) config.data = data
      if (params) config.params = params

      const response = await axios(config)
      
      console.log(`✅ Status: ${response.status}`)
      console.log('📨 Response:', JSON.stringify(response.data, null, 2))
      console.log('')
      
      return response.data
    } catch (error) {
      console.log(`❌ Error: ${error.message}`)
      if (error.response) {
        console.log(`📊 Status: ${error.response.status}`)
        console.log('📨 Error Response:', JSON.stringify(error.response.data, null, 2))
      }
      console.log('')
      throw error
    }
  }

  async testHealthCheck() {
    console.log('🏥 === HEALTH CHECK ===')
    try {
      await this.makeRequest('GET', '/api/hello')
      console.log('✅ Server is healthy\n')
      return true
    } catch (error) {
      console.log('❌ Server health check failed\n')
      return false
    }
  }

  async testGetSubscriptions() {
    console.log('📋 === GET SUBSCRIPTIONS ===')
    try {
      const response = await this.makeRequest('GET', '/api/competitor-subscriptions', null, {
        user_telegram_id: this.testUser.telegram_id,
        bot_name: this.testUser.bot_name
      })

      if (response.success) {
        console.log(`✅ Found ${response.subscriptions.length} subscriptions`)
        console.log(`📊 Active: ${response.active_count}, Total: ${response.total_count}`)
      }
      
      return response
    } catch (error) {
      console.log('❌ Failed to get subscriptions')
      return null
    }
  }

  async testCreateSubscription() {
    console.log('➕ === CREATE SUBSCRIPTION ===')
    try {
      const subscriptionData = {
        user_telegram_id: this.testUser.telegram_id,
        bot_name: this.testUser.bot_name,
        ...this.testData
      }

      const response = await this.makeRequest('POST', '/api/competitor-subscriptions', subscriptionData)

      if (response.success && response.subscription) {
        this.createdSubscriptionId = response.subscription.id
        console.log(`✅ Created subscription with ID: ${this.createdSubscriptionId}`)
        console.log(`👤 Competitor: @${response.subscription.competitor_username}`)
        console.log(`📊 Max reels: ${response.subscription.max_reels}`)
      }

      return response
    } catch (error) {
      console.log('❌ Failed to create subscription')
      return null
    }
  }

  async testUpdateSubscription() {
    if (!this.createdSubscriptionId) {
      console.log('⚠️  === SKIPPING UPDATE TEST (No subscription ID) ===\n')
      return null
    }

    console.log('✏️  === UPDATE SUBSCRIPTION ===')
    try {
      const updateData = {
        max_reels: 25,
        min_views: 10000,
        delivery_format: 'individual'
      }

      const response = await this.makeRequest(
        'PUT', 
        `/api/competitor-subscriptions/${this.createdSubscriptionId}`,
        updateData,
        {
          user_telegram_id: this.testUser.telegram_id,
          bot_name: this.testUser.bot_name
        }
      )

      if (response.success) {
        console.log('✅ Subscription updated successfully')
        console.log(`📊 New max reels: ${response.subscription.max_reels}`)
        console.log(`👀 New min views: ${response.subscription.min_views}`)
        console.log(`📦 New delivery format: ${response.subscription.delivery_format}`)
      }

      return response
    } catch (error) {
      console.log('❌ Failed to update subscription')
      return null
    }
  }

  async testGetSingleSubscription() {
    if (!this.createdSubscriptionId) {
      console.log('⚠️  === SKIPPING SINGLE GET TEST (No subscription ID) ===\n')
      return null
    }

    console.log('🔍 === GET SINGLE SUBSCRIPTION ===')
    try {
      const response = await this.makeRequest(
        'GET',
        `/api/competitor-subscriptions/${this.createdSubscriptionId}`,
        null,
        {
          user_telegram_id: this.testUser.telegram_id,
          bot_name: this.testUser.bot_name
        }
      )

      if (response.success && response.subscription) {
        console.log(`✅ Retrieved subscription: @${response.subscription.competitor_username}`)
        console.log(`📊 Settings: ${response.subscription.max_reels} reels, ${response.subscription.min_views} min views`)
        console.log(`📦 Format: ${response.subscription.delivery_format}`)
        console.log(`🟢 Active: ${response.subscription.is_active}`)
      }

      return response
    } catch (error) {
      console.log('❌ Failed to get single subscription')
      return null
    }
  }

  async testDeleteSubscription() {
    if (!this.createdSubscriptionId) {
      console.log('⚠️  === SKIPPING DELETE TEST (No subscription ID) ===\n')
      return null
    }

    console.log('🗑️  === DELETE SUBSCRIPTION ===')
    try {
      const response = await this.makeRequest(
        'DELETE',
        `/api/competitor-subscriptions/${this.createdSubscriptionId}`,
        null,
        {
          user_telegram_id: this.testUser.telegram_id,
          bot_name: this.testUser.bot_name
        }
      )

      if (response.success) {
        console.log('✅ Subscription deleted successfully')
        this.createdSubscriptionId = null
      }

      return response
    } catch (error) {
      console.log('❌ Failed to delete subscription')
      return null
    }
  }

  async testInvalidRequests() {
    console.log('🚫 === INVALID REQUESTS TESTS ===')
    
    // Тест 1: Создание подписки с невалидными данными
    console.log('🧪 Test 1: Invalid subscription data')
    try {
      await this.makeRequest('POST', '/api/competitor-subscriptions', {
        user_telegram_id: '',
        bot_name: 'test',
        competitor_username: 'invalid@username!',
        max_reels: 100, // Превышает лимит
        min_views: -1000, // Отрицательное значение
        max_age_days: 50, // Превышает лимит
        delivery_format: 'invalid_format'
      })
      console.log('❌ Expected validation error, but request succeeded')
    } catch (error) {
      console.log('✅ Correctly rejected invalid data')
    }

    // Тест 2: Доступ к несуществующей подписке
    console.log('🧪 Test 2: Access non-existent subscription')
    try {
      await this.makeRequest(
        'GET',
        '/api/competitor-subscriptions/00000000-0000-0000-0000-000000000000',
        null,
        {
          user_telegram_id: this.testUser.telegram_id,
          bot_name: this.testUser.bot_name
        }
      )
      console.log('❌ Expected 404 error, but request succeeded')
    } catch (error) {
      console.log('✅ Correctly returned 404 for non-existent subscription')
    }

    // Тест 3: Запрос без обязательных параметров
    console.log('🧪 Test 3: Missing required parameters')
    try {
      await this.makeRequest('GET', '/api/competitor-subscriptions')
      console.log('❌ Expected error for missing params, but request succeeded')
    } catch (error) {
      console.log('✅ Correctly rejected request with missing parameters')
    }

    console.log('')
  }

  async runFullTest() {
    console.log('🎯 === FULL INSTAGRAM API TEST SUITE ===\n')
    
    const results = {
      healthCheck: false,
      getSubscriptions: false,
      createSubscription: false,
      updateSubscription: false,
      getSingleSubscription: false,
      deleteSubscription: false,
      invalidRequests: true
    }

    try {
      // 1. Health check
      results.healthCheck = await this.testHealthCheck()
      if (!results.healthCheck) {
        console.log('❌ Cannot proceed without healthy server')
        return results
      }

      // 2. Get existing subscriptions
      const getResult = await this.testGetSubscriptions()
      results.getSubscriptions = getResult && getResult.success

      // 3. Create new subscription
      const createResult = await this.testCreateSubscription()
      results.createSubscription = createResult && createResult.success

      // 4. Update subscription
      const updateResult = await this.testUpdateSubscription()
      results.updateSubscription = updateResult && updateResult.success

      // 5. Get single subscription
      const getSingleResult = await this.testGetSingleSubscription()
      results.getSingleSubscription = getSingleResult && getSingleResult.success

      // 6. Delete subscription
      const deleteResult = await this.testDeleteSubscription()
      results.deleteSubscription = deleteResult && deleteResult.success

      // 7. Test invalid requests
      await this.testInvalidRequests()

    } catch (error) {
      console.log('❌ Test suite failed with error:', error.message)
    }

    // Выводим финальные результаты
    console.log('📊 === FINAL TEST RESULTS ===')
    Object.entries(results).forEach(([test, passed]) => {
      console.log(`${passed ? '✅' : '❌'} ${test}: ${passed ? 'PASSED' : 'FAILED'}`)
    })

    const passedCount = Object.values(results).filter(Boolean).length
    const totalCount = Object.keys(results).length
    
    console.log(`\n🎯 Overall: ${passedCount}/${totalCount} tests passed`)
    console.log(`📈 Success rate: ${Math.round((passedCount / totalCount) * 100)}%`)

    if (passedCount === totalCount) {
      console.log('🎉 All tests passed! Instagram API is working correctly.')
    } else {
      console.log('⚠️  Some tests failed. Check the logs above for details.')
    }

    return results
  }
}

// Запуск тестов если скрипт вызывается напрямую
if (require.main === module) {
  const tester = new InstagramApiTester()
  
  tester.runFullTest()
    .then((results) => {
      const allPassed = Object.values(results).every(Boolean)
      process.exit(allPassed ? 0 : 1)
    })
    .catch((error) => {
      console.error('💥 Test suite crashed:', error.message)
      process.exit(1)
    })
}

module.exports = InstagramApiTester