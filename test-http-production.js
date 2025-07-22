console.log('🧪 Тестируем HTTP API отправку на ПРОДАКШН...')

async function sendInstagramEventViaHTTP() {
  const eventData = {
    name: 'instagram/scraper-v2',
    data: {
      username_or_id: 'neuro_sage',
      project_id: 37,
      max_users: 10,
      max_reels_per_user: 5,
      scrape_reels: true,
      requester_telegram_id: '144022504',
      // Дополнительные данные для контекста
      username: 'test_username',
      bot_name: 'ai_koshey_bot',
      language: 'ru',
      is_test: true,
    },
  }

  console.log('📤 Отправляем событие через HTTP API...')
  console.log(
    '🌐 URL: https://ai-server-u14194.vm.elestio.app/api/inngest/e/dummy-key'
  )
  console.log('📋 Данные события:', JSON.stringify(eventData, null, 2))

  try {
    const response = await fetch(
      'https://ai-server-u14194.vm.elestio.app/api/inngest/e/dummy-key',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(eventData),
      }
    )

    console.log('📊 HTTP Status:', response.status)
    console.log('📊 HTTP Status Text:', response.statusText)

    const result = await response.json()
    console.log('✅ HTTP ОТВЕТ ПОЛУЧЕН!')
    console.log('📋 Результат:', JSON.stringify(result, null, 2))

    if (result.ids && result.ids.length > 0) {
      console.log(`🔍 ID события: ${result.ids[0]}`)
      return result.ids[0]
    }

    return result
  } catch (error) {
    console.error('❌ ОШИБКА HTTP отправки:')
    console.error('📝 Детали:', error.message)
    console.error('📋 Полная ошибка:', error)
    throw error
  }
}

// Запускаем HTTP тест
sendInstagramEventViaHTTP()
  .then(eventId => {
    console.log('🎉 HTTP ТЕСТ ЗАВЕРШЕН УСПЕШНО!')
    console.log('🆔 Event ID:', eventId)
    console.log(
      '📊 Проверь dashboard: https://ai-server-u14194.vm.elestio.app/admin/inngest'
    )
  })
  .catch(error => {
    console.error('💥 HTTP тест провалился:', error)
  })
