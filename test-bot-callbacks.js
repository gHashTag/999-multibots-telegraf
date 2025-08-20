/**
 * Тестирование callback'ов мониторинга конкурентов
 */

const axios = require('axios')

async function testBotCallbacks() {
  console.log('🧪 Тестируем callback функциональность...')
  
  const baseUrl = 'http://localhost:2999'
  const userId = '144022504'
  const botName = 'telegram_bot'
  
  try {
    // 1. Получаем текущие подписки
    console.log('\n1️⃣ Получаем текущие подписки...')
    const subscriptionsResponse = await axios.get(`${baseUrl}/api/competitor-subscriptions`, {
      params: {
        user_telegram_id: userId,
        bot_name: botName
      }
    })
    
    console.log(`✅ Найдено ${subscriptionsResponse.data.active_count} активных подписок`)
    subscriptionsResponse.data.subscriptions.forEach((sub, index) => {
      console.log(`   ${index + 1}. @${sub.competitor_username} (${sub.id})`)
    })
    
    // 2. Тестируем создание новой подписки
    console.log('\n2️⃣ Создаем тестовую подписку...')
    const testUsername = `test_user_${Date.now()}`
    const createResponse = await axios.post(`${baseUrl}/api/competitor-subscriptions`, {
      user_telegram_id: userId,
      bot_name: botName,
      competitor_username: testUsername,
      max_reels: 5,
      min_views: 1000,
      max_age_days: 1,
      delivery_format: 'individual'
    })
    
    if (createResponse.data.success) {
      console.log(`✅ Тестовая подписка создана: @${testUsername}`)
      const newSubId = createResponse.data.subscription.id
      
      // 3. Тестируем удаление подписки
      console.log('\n3️⃣ Удаляем тестовую подписку...')
      const deleteResponse = await axios.delete(`${baseUrl}/api/competitor-subscriptions/${newSubId}`, {
        params: {
          user_telegram_id: userId,
          bot_name: botName
        }
      })
      
      if (deleteResponse.data.success) {
        console.log(`✅ Тестовая подписка удалена`)
      } else {
        console.log(`❌ Ошибка удаления: ${deleteResponse.data.error}`)
      }
    } else {
      console.log(`❌ Ошибка создания: ${createResponse.data.error}`)
    }
    
    // 4. Финальная проверка подписок
    console.log('\n4️⃣ Финальная проверка подписок...')
    const finalResponse = await axios.get(`${baseUrl}/api/competitor-subscriptions`, {
      params: {
        user_telegram_id: userId,
        bot_name: botName
      }
    })
    
    console.log(`✅ Итого активных подписок: ${finalResponse.data.active_count}`)
    
    console.log('\n🎉 Все API тесты пройдены!')
    console.log('\n📱 Теперь попробуйте нажать кнопки в Telegram боте:')
    console.log('   - "🔍 Мониторинг конкурентов" в главном меню')
    console.log('   - "➕ Добавить конкурента" в inline меню')
    console.log('   - "❌ username" для удаления')
    console.log('   - "🔄 Обновить" для обновления списка')
    console.log('\n👀 Следите за логами сервера для callback активности!')
    
  } catch (error) {
    console.error('❌ Ошибка тестирования:', error.response?.data || error.message)
  }
}

testBotCallbacks().catch(console.error)