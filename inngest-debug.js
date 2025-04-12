// Скрипт для отладки проблемы с Inngest
require('dotenv').config()
const fetch = require('node-fetch')

// Цвета для консоли
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
}

// Получаем ключ из переменных окружения
const eventKey = process.env.INNGEST_EVENT_KEY || ''

console.log(`${colors.blue}🔍 Отладка проблемы с Inngest${colors.reset}\n`)
console.log(
  `${colors.cyan}Используемый ключ:${colors.reset} ${eventKey ? `${eventKey.substring(0, 5)}...${eventKey.substring(eventKey.length - 5)}` : 'не задан'}`
)

// Функция для проверки различных URL Inngest
async function testEndpoints() {
  console.log(
    `\n${colors.magenta}Проверка доступности различных эндпоинтов Inngest...${colors.reset}`
  )

  const endpoints = [
    { url: 'https://api.inngest.com', method: 'GET', name: 'API Root' },
    { url: 'https://api.inngest.com/v0', method: 'GET', name: 'API v0' },
    { url: 'https://api.inngest.com/v1', method: 'GET', name: 'API v1' },
    {
      url: `https://api.inngest.com/v0/e/${eventKey}`,
      method: 'GET',
      name: 'Events API v0',
    },
    {
      url: `https://api.inngest.com/v1/e/${eventKey}`,
      method: 'GET',
      name: 'Events API v1',
    },
    {
      url: `https://api.inngest.com/e/${eventKey}`,
      method: 'GET',
      name: 'Default Events API',
    },
  ]

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint.url, { method: endpoint.method })
      const status = response.status
      const isOk = status >= 200 && status < 400

      console.log(
        `${colors.cyan}${endpoint.name}:${colors.reset} ${isOk ? colors.green : colors.red}${status}${colors.reset} ${endpoint.url}`
      )

      // Если получили ответ 405, попробуем правильный метод
      if (status === 405) {
        const allowHeader = response.headers.get('allow')
        console.log(
          `  ${colors.yellow}⚠️ Метод не разрешен. Разрешенные методы: ${allowHeader}${colors.reset}`
        )

        if (allowHeader && allowHeader.includes('POST')) {
          const postResponse = await fetch(endpoint.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ test: true }),
          })

          console.log(
            `  ${colors.cyan}POST запрос:${colors.reset} ${postResponse.status >= 200 && postResponse.status < 400 ? colors.green : colors.red}${postResponse.status}${colors.reset}`
          )
        }
      }
    } catch (error) {
      console.log(
        `${colors.cyan}${endpoint.name}:${colors.reset} ${colors.red}Ошибка: ${error.message}${colors.reset}`
      )
    }
  }
}

// Функция для проверки правильного формата отправки события
async function testEventFormat() {
  console.log(
    `\n${colors.magenta}Проверка различных форматов отправки события...${colors.reset}`
  )

  const eventData = { test: true, timestamp: new Date().toISOString() }
  const testEvent = { name: 'test/debug-event', data: eventData }

  const formats = [
    {
      url: `https://api.inngest.com/e/${eventKey}`,
      body: JSON.stringify([testEvent]),
      name: 'Массив событий (стандартный формат)',
    },
    {
      url: `https://api.inngest.com/e/${eventKey}`,
      body: JSON.stringify(testEvent),
      name: 'Одиночное событие (без массива)',
    },
    {
      url: `https://api.inngest.com/v0/e/${eventKey}`,
      body: JSON.stringify([testEvent]),
      name: 'v0 API с массивом событий',
    },
    {
      url: `https://api.inngest.com/v1/e/${eventKey}`,
      body: JSON.stringify([testEvent]),
      name: 'v1 API с массивом событий',
    },
  ]

  for (const format of formats) {
    try {
      const response = await fetch(format.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: format.body,
      })

      const status = response.status
      const text = await response.text()
      const isOk = status >= 200 && status < 400

      console.log(
        `${colors.cyan}${format.name}:${colors.reset} ${isOk ? colors.green : colors.red}${status}${colors.reset}`
      )

      if (text) {
        console.log(
          `  ${colors.yellow}Ответ:${colors.reset} ${text.substring(0, 100)}`
        )
      }
    } catch (error) {
      console.log(
        `${colors.cyan}${format.name}:${colors.reset} ${colors.red}Ошибка: ${error.message}${colors.reset}`
      )
    }
  }
}

// Функция для анализа ключа
function analyzeKey() {
  console.log(`\n${colors.magenta}Анализ ключа...${colors.reset}`)

  if (!eventKey) {
    console.log(`${colors.red}Ключ не задан!${colors.reset}`)
    return
  }

  const keyLength = eventKey.length
  const hasCorrectChars = /^[A-Za-z0-9_-]+$/.test(eventKey)

  console.log(`${colors.cyan}Длина ключа:${colors.reset} ${keyLength} символов`)
  console.log(
    `${colors.cyan}Допустимые символы:${colors.reset} ${hasCorrectChars ? `${colors.green}Да${colors.reset}` : `${colors.red}Нет${colors.reset}`}`
  )

  // Типичная проблема - концы ключа с переносами строк
  const hasPotentialLineBreak =
    eventKey.includes('\n') || eventKey.includes('\r')
  console.log(
    `${colors.cyan}Есть переносы строк:${colors.reset} ${hasPotentialLineBreak ? `${colors.red}Да${colors.reset}` : `${colors.green}Нет${colors.reset}`}`
  )

  // Анализ формата
  if (keyLength > 80) {
    console.log(
      `${colors.yellow}⚠️ Ключ слишком длинный. Обычно ключи Inngest имеют длину 40-80 символов.${colors.reset}`
    )
  }

  if (!hasCorrectChars) {
    console.log(
      `${colors.red}❌ Ключ содержит недопустимые символы. Используйте только буквы, цифры, подчеркивания и дефисы.${colors.reset}`
    )
  }

  // Предложение по исправлению
  const cleanedKey = eventKey.trim().replace(/[\r\n]/g, '')
  if (cleanedKey !== eventKey) {
    console.log(
      `${colors.yellow}⚠️ Ключ может содержать невидимые символы. Попробуйте использовать очищенную версию:${colors.reset}`
    )
    console.log(`${colors.green}${cleanedKey}${colors.reset}`)
  }
}

// Запуск всех тестов
async function runAllTests() {
  analyzeKey()
  await testEndpoints()
  await testEventFormat()
}

runAllTests().then(() => {
  console.log(`\n${colors.blue}✅ Диагностика завершена${colors.reset}`)
})
