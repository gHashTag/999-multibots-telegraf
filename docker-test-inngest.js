// Простой скрипт для тестирования Inngest SDK
require('dotenv').config()
const fetch = require('node-fetch')

// Получаем ключи из env
const eventKey = process.env.INNGEST_EVENT_KEY

// Цвета для консоли
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
}

console.log(
  `${colors.blue}🚀 Тестирование соединения с Inngest${colors.reset}\n`
)
console.log(`${colors.cyan}Информация о ключе:${colors.reset}`)
console.log(
  `  Event Key: ${eventKey ? `${eventKey.substring(0, 5)}...${eventKey.substring(eventKey.length - 5)}` : 'не задан'}`
)

async function testDirectAPI() {
  console.log(
    `\n${colors.yellow}Тестирование API Inngest напрямую...${colors.reset}`
  )

  try {
    // Формируем тестовое событие
    const testEvent = {
      name: 'test/direct-event',
      data: {
        message: 'Тестовое событие через прямой API',
        timestamp: new Date().toISOString(),
        test_id: Date.now(),
      },
    }

    console.log(`${colors.cyan}Отправка события:${colors.reset}`)
    console.log(JSON.stringify(testEvent, null, 2))

    // URL для отправки событий
    const url = `https://api.inngest.com/e/${eventKey}`
    console.log(`${colors.cyan}URL:${colors.reset} ${url}`)

    // Отправляем запрос
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([testEvent]),
    })

    const status = response.status
    const text = await response.text()

    if (status >= 200 && status < 300) {
      console.log(`${colors.green}✓ Событие успешно отправлено!${colors.reset}`)
      console.log(`${colors.cyan}Статус:${colors.reset} ${status}`)
      console.log(`${colors.cyan}Ответ:${colors.reset} ${text}`)
    } else {
      console.log(`${colors.red}✗ Ошибка при отправке события${colors.reset}`)
      console.log(`${colors.cyan}Статус:${colors.reset} ${status}`)
      console.log(`${colors.cyan}Ответ:${colors.reset} ${text}`)
    }

    return { success: status >= 200 && status < 300, status, text }
  } catch (error) {
    console.log(
      `${colors.red}✗ Ошибка при обращении к API: ${error.message}${colors.reset}`
    )
    return { success: false, error: error.message }
  }
}

// Тестирование соединения с inngest.com
async function testConnection() {
  console.log(
    `\n${colors.yellow}Тестирование соединения с Inngest.com...${colors.reset}`
  )

  try {
    const response = await fetch('https://api.inngest.com', {
      method: 'GET',
    })

    console.log(`${colors.cyan}Статус:${colors.reset} ${response.status}`)
    console.log(
      `${colors.cyan}Доступность:${colors.reset} ${response.status >= 200 && response.status < 300 ? `${colors.green}Да${colors.reset}` : `${colors.red}Нет${colors.reset}`}`
    )

    return {
      success: response.status >= 200 && response.status < 300,
      status: response.status,
    }
  } catch (error) {
    console.log(
      `${colors.red}✗ Ошибка соединения: ${error.message}${colors.reset}`
    )
    return { success: false, error: error.message }
  }
}

// Проверка правильности формата ключа
function validateEventKey() {
  console.log(`\n${colors.yellow}Проверка формата ключа...${colors.reset}`)

  if (!eventKey) {
    console.log(`${colors.red}✗ Ключ не задан${colors.reset}`)
    return false
  }

  // Базовые проверки на формат ключа
  const validFormat = /^[A-Za-z0-9_-]{20,}$/.test(eventKey)
  console.log(
    `${colors.cyan}Формат ключа:${colors.reset} ${validFormat ? `${colors.green}Корректный${colors.reset}` : `${colors.red}Некорректный${colors.reset}`}`
  )

  return validFormat
}

// Запуск всех тестов
async function runAllTests() {
  console.log(`\n${colors.blue}Запуск тестов Inngest...${colors.reset}`)

  const keyValid = validateEventKey()
  if (!keyValid) {
    console.log(
      `${colors.red}✗ Формат ключа некорректен, дальнейшие тесты невозможны${colors.reset}`
    )
    return
  }

  const connectionResult = await testConnection()
  if (!connectionResult.success) {
    console.log(
      `${colors.red}✗ Соединение с Inngest.com недоступно, дальнейшие тесты невозможны${colors.reset}`
    )
    return
  }

  const apiResult = await testDirectAPI()

  // Итоговый результат
  console.log(`\n${colors.blue}Итоги тестирования:${colors.reset}`)
  console.log(
    `${colors.cyan}Формат ключа:${colors.reset} ${keyValid ? `${colors.green}Корректный${colors.reset}` : `${colors.red}Некорректный${colors.reset}`}`
  )
  console.log(
    `${colors.cyan}Соединение с Inngest:${colors.reset} ${connectionResult.success ? `${colors.green}Доступно${colors.reset}` : `${colors.red}Недоступно${colors.reset}`}`
  )
  console.log(
    `${colors.cyan}Отправка события:${colors.reset} ${apiResult.success ? `${colors.green}Успешно${colors.reset}` : `${colors.red}Ошибка${colors.reset}`}`
  )
}

// Запускаем тесты
runAllTests()
