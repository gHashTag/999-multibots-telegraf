/**
 * Тест отправки события model/training.start в BOT instance
 */
const { Inngest } = require('inngest')

// Используем те же настройки что и в BOT instance
const inngest = new Inngest({
  name: 'telegram-bot-client',
  id: 'telegram-bot-client',
  baseUrl: 'https://three-head-dragon.shop/api/inngest',
  eventKey: process.env.BOT_INNGEST_EVENT_KEY || process.env.RENDER_INNGEST_EVENT_KEY,
  isDev: false,
})

async function sendTestEvent() {
  try {
    console.log('🚀 Отправляем тестовое событие model/training.start...')

    const result = await inngest.send({
      name: 'model/training.start',
      data: {
        telegram_id: '144022504',
        bot_name: 'neuro_blogger_bot',
        modelName: 'test_model',
        triggerWord: 'TEST_MODEL',
        zipUrl: 'https://three-head-dragon.shop/uploads/test/test.zip',
        steps: 1000,
        is_ru: true,
        gender: 'male',
      }
    })

    console.log('✅ Событие отправлено успешно!', {
      eventId: result?.eventId || 'unknown',
      name: 'model/training.start',
      ts: new Date().toISOString()
    })

    process.exit(0)
  } catch (error) {
    console.error('❌ Ошибка отправки события:', error.message)
    console.error('Stack:', error.stack)
    process.exit(1)
  }
}

sendTestEvent()
