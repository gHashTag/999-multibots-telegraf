require('dotenv').config()
const { Inngest } = require('inngest')

// Цвета для вывода в консоль
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
}

/**
 * Простой скрипт для тестирования SDK Inngest
 */
console.log(`${colors.blue}🚀 Тестирование SDK Inngest${colors.reset}\n`)

// Проверяем наличие необходимых переменных окружения
const envVariables = {
  INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY,
  INNGEST_SIGNING_KEY: process.env.INNGEST_SIGNING_KEY,
  INNGEST_URL: process.env.INNGEST_URL,
  NODE_ENV: process.env.NODE_ENV || 'development',
}

// Выводим информацию о переменных окружения
console.log(`${colors.cyan}Переменные окружения:${colors.reset}`)

Object.entries(envVariables).forEach(([key, value]) => {
  const hasValue = !!value
  const status = hasValue
    ? `${colors.green}✓ Доступна${colors.reset}`
    : `${colors.red}✗ Отсутствует${colors.reset}`

  let displayValue = hasValue
    ? key === 'INNGEST_EVENT_KEY' || key === 'INNGEST_SIGNING_KEY'
      ? `${value.substring(0, 5)}...${value.substring(value.length - 5)}`
      : value
    : 'не задано'

  console.log(
    `  ${colors.yellow}${key}:${colors.reset} ${status} (${displayValue})`
  )
})

// Функция для создания и отправки тестового события
async function testInngestSDK() {
  try {
    console.log(
      `\n${colors.blue}Инициализация Inngest клиента...${colors.reset}`
    )

    // Создаем экземпляр Inngest
    const inngest = new Inngest({
      id: 'test-inngest-sdk',
      eventKey: process.env.INNGEST_EVENT_KEY,
    })

    console.log(`${colors.green}✓ Клиент Inngest успешно создан${colors.reset}`)

    // Подготавливаем тестовое событие
    const testEvent = {
      name: 'test/sdk-event',
      data: {
        message: 'Тестирование SDK Inngest',
        timestamp: new Date().toISOString(),
        testId: Date.now().toString(),
      },
    }

    console.log(`\n${colors.cyan}Данные тестового события:${colors.reset}`)
    console.log(JSON.stringify(testEvent, null, 2))

    // Отправляем событие
    console.log(`\n${colors.blue}Отправка события...${colors.reset}`)
    const result = await inngest.send(testEvent)

    console.log(`${colors.green}✓ Событие успешно отправлено!${colors.reset}`)
    console.log(`\n${colors.cyan}Результат отправки:${colors.reset}`)
    console.log(JSON.stringify(result, null, 2))

    return { success: true, result }
  } catch (error) {
    console.log(
      `${colors.red}✗ Ошибка при отправке события: ${error.message}${colors.reset}`
    )

    if (error.cause) {
      console.log(`\n${colors.yellow}Причина ошибки:${colors.reset}`)
      console.log(JSON.stringify(error.cause, null, 2))
    }

    return { success: false, error }
  }
}

// Запускаем тест
testInngestSDK()
  .then(({ success }) => {
    if (success) {
      console.log(
        `\n${colors.green}🎉 Тест SDK Inngest успешно завершен${colors.reset}`
      )
    } else {
      console.log(
        `\n${colors.red}❌ Тест SDK Inngest завершился с ошибкой${colors.reset}`
      )
    }

    // Небольшая задержка для обработки асинхронных операций
    setTimeout(() => {
      process.exit(success ? 0 : 1)
    }, 1000)
  })
  .catch(error => {
    console.log(
      `\n${colors.red}❌ Непредвиденная ошибка: ${error.message}${colors.reset}`
    )
    process.exit(1)
  })
