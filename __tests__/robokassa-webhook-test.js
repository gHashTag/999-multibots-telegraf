/**
 * Тест для проверки работы Robokassa вебхуков
 * Запускать: node __tests__/robokassa-webhook-test.js
 */

const axios = require('axios')
const crypto = require('crypto')

// Настройки тестирования
const config = {
  // URL вашего вебхука (измените на актуальный)
  webhookUrl:
    'https://999-multibots-telegraf-u14194.vm.elestio.app/payment-success',
  // Тестовые данные платежа
  testData: {
    OutSum: '1110.00', // Сумма платежа
    InvId: Math.floor(Math.random() * 1000000).toString(), // Случайный ID инвойса
    SignatureValue: '', // Будет заполнено автоматически
    shp_botname: 'neuro_blogger_bot', // Дополнительный параметр с именем бота
  },
  // Тестовый пароль №2 для проверки подписи (замените на ваш)
  password2: process.env.ROBOKASSA_PASSWORD_2 || 'test_password_2',
  // Задержка между запросами (мс)
  delay: 3000,
}

/**
 * Вычисляет подпись для параметров Robokassa
 * @param {Object} params - Параметры запроса
 * @param {string} password - Пароль №2 Robokassa
 * @returns {string} - MD5 хеш подписи в верхнем регистре
 */
function calculateSignature(params, password) {
  // Формируем строку для подписи: OutSum:InvId:Password2
  const signatureString = `${params.OutSum}:${params.InvId}:${password}`

  // Добавляем shp_ параметры в алфавитном порядке, если они есть
  const shpParams = Object.keys(params)
    .filter(key => key.startsWith('shp_'))
    .sort()

  const shpString =
    shpParams.length > 0
      ? `:${shpParams.map(key => `${key}=${params[key]}`).join(':')}`
      : ''

  // Итоговая строка для подписи
  const finalString = signatureString + shpString

  // Вычисляем MD5 хеш
  return crypto
    .createHash('md5')
    .update(finalString)
    .digest('hex')
    .toUpperCase()
}

/**
 * Выполняет тест вебхука с заданными параметрами
 * @param {string} name - Название теста
 * @param {Object} params - Параметры запроса
 */
async function testWebhook(name, params) {
  console.log(`\n🧪 Запуск теста: ${name}`)
  console.log('📤 Отправляем параметры:', params)

  try {
    // Отправляем POST запрос
    console.log(`🔄 Отправка запроса на: ${config.webhookUrl}`)
    const response = await axios.post(config.webhookUrl, params)

    // Проверяем ответ
    console.log(`✅ Получен ответ со статусом: ${response.status}`)
    console.log(`📝 Тело ответа: ${response.data}`)

    // Проверка правильности ответа
    if (
      response.status === 200 &&
      response.data.includes(`OK${params.InvId}`)
    ) {
      console.log('✅ ТЕСТ ПРОЙДЕН: Получен правильный ответ от сервера')
    } else {
      console.log('❌ ТЕСТ НЕ ПРОЙДЕН: Неправильный ответ от сервера')
    }
  } catch (error) {
    console.error('❌ ОШИБКА при выполнении запроса:')
    if (error.response) {
      // Сервер ответил с ошибкой
      console.error(`📊 Статус: ${error.response.status}`)
      console.error(`📝 Данные: ${JSON.stringify(error.response.data)}`)
    } else if (error.request) {
      // Запрос отправлен, но ответ не получен
      console.error(
        '📊 Ответ не получен. Сервер недоступен или неправильный URL.'
      )
    } else {
      // Ошибка при настройке запроса
      console.error(`📝 Сообщение: ${error.message}`)
    }
  }
}

/**
 * Эмулирует задержку
 * @param {number} ms - Время задержки в миллисекундах
 */
async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Основная функция запуска тестов
 */
async function runTests() {
  console.log('🚀 Запуск тестов для Robokassa webhook')
  console.log(`🔗 URL вебхука: ${config.webhookUrl}`)

  // Тест 1: Правильный запрос с корректной подписью
  const validParams = { ...config.testData }
  validParams.SignatureValue = calculateSignature(validParams, config.password2)
  await testWebhook('Валидный запрос', validParams)

  // Задержка между тестами
  await delay(config.delay)

  // Тест 2: Запрос без подписи
  const noSignatureParams = { ...config.testData }
  delete noSignatureParams.SignatureValue
  await testWebhook('Запрос без подписи', noSignatureParams)

  // Задержка между тестами
  await delay(config.delay)

  // Тест 3: Запрос с неверной подписью
  const invalidSignatureParams = { ...config.testData }
  invalidSignatureParams.SignatureValue = 'INVALID_SIGNATURE_12345'
  await testWebhook('Запрос с неверной подписью', invalidSignatureParams)

  // Задержка между тестами
  await delay(config.delay)

  // Тест 4: Запрос без обязательных параметров
  await testWebhook('Запрос без InvId', {
    OutSum: config.testData.OutSum,
    SignatureValue: calculateSignature(
      { OutSum: config.testData.OutSum },
      config.password2
    ),
  })

  console.log('\n🏁 Все тесты завершены')
}

// Запуск тестов
runTests().catch(console.error)
