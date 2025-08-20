#!/usr/bin/env node

/**
 * 🧪 Тест Instagram парсинга через API
 */

const axios = require('axios')

async function testInstagramParsing() {
  console.log('🚀 Тестируем Instagram парсинг API...\n')

  // Тестируем локально и на продакшене
  const servers = [
    'http://localhost:2999',
    'https://ai-server-u14194.vm.elestio.app'
  ]

  for (const baseUrl of servers) {
    console.log(`\n📡 Тестируем сервер: ${baseUrl}`)
    
    try {
      // 1. Проверяем hello endpoint
      console.log('1️⃣ Проверяем /api/hello...')
      const helloResponse = await axios.get(`${baseUrl}/api/hello`, { timeout: 5000 })
      console.log('✅ Hello endpoint работает:', helloResponse.data.message)

      // 2. Проверяем получение проектов
      console.log('2️⃣ Проверяем /api/instagram/projects...')
      const projectsResponse = await axios.get(`${baseUrl}/api/instagram/projects`, {
        params: { user_telegram_id: '144022504' },
        timeout: 10000
      })
      console.log(`✅ Найдено проектов: ${projectsResponse.data.projects?.length || 0}`)
      if (projectsResponse.data.projects?.length > 0) {
        console.log('   Первый проект:', projectsResponse.data.projects[0].name)
      }

      // 3. Тестируем запуск парсинга
      console.log('3️⃣ Запускаем тестовый парсинг...')
      const parsingResponse = await axios.post(`${baseUrl}/api/instagram/parse`, {
        username_or_id: 'neuro_sage',
        project_id: 1,
        max_users: 10,
        max_reels_per_user: 5,
        scrape_reels: false,
        requester_telegram_id: '144022504',
        bot_name: 'test_bot'
      }, { 
        timeout: 15000,
        headers: { 'Content-Type': 'application/json' }
      })
      
      if (parsingResponse.data.success) {
        console.log('✅ Парсинг запущен успешно!')
        console.log('   Session ID:', parsingResponse.data.eventId)
      } else {
        console.log('❌ Ошибка парсинга:', parsingResponse.data.error)
      }

      // 4. Проверяем подписки
      console.log('4️⃣ Проверяем /api/competitor-subscriptions...')
      const subscriptionsResponse = await axios.get(`${baseUrl}/api/competitor-subscriptions`, {
        params: { 
          user_telegram_id: '144022504',
          bot_name: 'test_bot'
        },
        timeout: 5000
      })
      console.log(`✅ Найдено подписок: ${subscriptionsResponse.data.subscriptions?.length || 0}`)

    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        console.log('❌ Сервер недоступен')
      } else if (error.response) {
        console.log(`❌ HTTP ${error.response.status}: ${error.response.data?.error || error.response.statusText}`)
      } else {
        console.log('❌ Ошибка:', error.message)
      }
    }
  }

  console.log('\n✅ Тестирование завершено!')
}

// Запуск
testInstagramParsing().catch(console.error)