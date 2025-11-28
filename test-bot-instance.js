/**
 * Тест отправки события через BOT instance
 * Использует RENDER_INNGEST_EVENT_KEY для BOT instance
 */
const { Inngest } = require('inngest')

// Создаем BOT client с теми же настройками что и в продакшене
const botClient = new Inngest({
  name: 'telegram-bot-client',
  eventKey: process.env.RENDER_INNGEST_EVENT_KEY || 'n6DddAUg5idycTbtQGP7lXn6FCoIDc...',
  baseUrl: 'https://three-head-dragon.shop/api/inngest',
  isDev: false,
})

async function testBotInstance() {
  try {
    console.log('🚀 Тестируем BOT instance...')
    console.log('EventKey:', (process.env.RENDER_INNGEST_EVENT_KEY || '').substring(0, 20) + '...')
    console.log('BaseURL:', 'https://three-head-dragon.shop/api/inngest')

    const result = await botClient.send({
      name: 'model/training.start',
      data: {
        telegram_id: '144022504',
        bot_name: 'neuro_blogger_bot',
        modelName: 'test_model_bot',
        triggerWord: 'TEST_BOT_MODEL',
        zipUrl: 'https://three-head-dragon.shop/uploads/test/test_bot.zip',
        steps: 1000,
        is_ru: true,
        gender: 'male',
      }
    })

    console.log('✅ Событие отправлено через BOT instance!')
    console.log('EventID:', result.eventId)
    console.log('Name:', 'model/training.start')
    console.log('Time:', new Date().toISOString())

    process.exit(0)
  } catch (error) {
    console.error('❌ Ошибка отправки через BOT instance:')
    console.error('Message:', error.message)
    if (error.stack) {
      console.error('Stack:', error.stack)
    }
    process.exit(1)
  }
}

testBotInstance()
