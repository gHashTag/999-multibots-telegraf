const { Inngest } = require('inngest')
require('dotenv').config()

// Используем специальный ключ для dev-сервера
const INNGEST_DEV_KEY = 'dev'
const INNGEST_URL = 'https://api.inngest.com'

console.log('🌐 INNGEST_URL:', INNGEST_URL)

// Создаем клиент с dev ключом
const inngest = new Inngest({
  id: 'test-client-dev',
  eventKey: INNGEST_DEV_KEY,
})

async function testInngest() {
  try {
    console.log('🚀 Отправка тестового события...')

    const result = await inngest.send({
      name: 'test/hello.world',
      data: {
        message: 'Тестовое событие!',
        timestamp: new Date().toISOString(),
      },
    })

    console.log(
      '✅ Событие успешно отправлено:',
      JSON.stringify(result, null, 2)
    )
  } catch (error) {
    console.error('❌ Ошибка при отправке события:', error.message)

    if (error.stack) {
      console.error('Стек ошибки:', error.stack)
    }
  }
}

// Запускаем тест
testInngest()
