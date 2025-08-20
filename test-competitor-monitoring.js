#!/usr/bin/env node

/**
 * 🧪 Тест системы мониторинга конкурентов
 */

const axios = require('axios')

async function testCompetitorMonitoring() {
  console.log('🔍 Тестируем систему мониторинга конкурентов...\n')

  const baseUrl = 'http://localhost:2999'
  const testUser = {
    telegram_id: '144022504',
    bot_name: 'test_bot'
  }

  try {
    // 1. Проверяем получение существующих подписок
    console.log('1️⃣ Проверяем существующие подписки...')
    const subscriptionsResponse = await axios.get(`${baseUrl}/api/competitor-subscriptions`, {
      params: testUser,
      timeout: 5000
    })
    
    if (subscriptionsResponse.data.success) {
      console.log(`✅ Найдено подписок: ${subscriptionsResponse.data.subscriptions.length}`)
      if (subscriptionsResponse.data.subscriptions.length > 0) {
        console.log('   Список подписок:')
        subscriptionsResponse.data.subscriptions.forEach((sub, i) => {
          console.log(`   ${i+1}. @${sub.competitor_username} (${sub.is_active ? 'активна' : 'неактивна'})`)
        })
      }
    }

    // 2. Создаем тестовую подписку
    console.log('\n2️⃣ Создаем тестовую подписку на @neuro_sage...')
    const createResponse = await axios.post(`${baseUrl}/api/competitor-subscriptions`, {
      ...testUser,
      competitor_username: 'neuro_sage',
      max_reels: 10,
      min_views: 2000,
      max_age_days: 1,
      delivery_format: 'individual'
    }, {
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' }
    })

    if (createResponse.data.success) {
      console.log('✅ Подписка создана успешно!')
      console.log(`   ID подписки: ${createResponse.data.subscription.id}`)
      console.log(`   Конкурент: @${createResponse.data.subscription.competitor_username}`)
      console.log(`   Настройки: до ${createResponse.data.subscription.max_reels} рилсов, мин. ${createResponse.data.subscription.min_views} просмотров`)
    } else {
      console.log('⚠️ Подписка не создана:', createResponse.data.error)
    }

    // 3. Проверяем обновленный список подписок
    console.log('\n3️⃣ Проверяем обновленный список подписок...')
    const updatedSubscriptionsResponse = await axios.get(`${baseUrl}/api/competitor-subscriptions`, {
      params: testUser,
      timeout: 5000
    })

    if (updatedSubscriptionsResponse.data.success) {
      console.log(`✅ Обновленное количество подписок: ${updatedSubscriptionsResponse.data.subscriptions.length}`)
      console.log(`   Активных: ${updatedSubscriptionsResponse.data.active_count}`)
      console.log(`   Всего: ${updatedSubscriptionsResponse.data.total_count}`)
    }

    console.log('\n🎉 Тест системы мониторинга конкурентов завершен успешно!')

  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log('❌ API сервер недоступен. Запусти локальный сервер сначала.')
    } else if (error.response) {
      console.log(`❌ HTTP ${error.response.status}: ${error.response.data?.error || error.response.statusText}`)
    } else {
      console.log('❌ Ошибка:', error.message)
    }
  }
}

// Запуск
testCompetitorMonitoring().catch(console.error)