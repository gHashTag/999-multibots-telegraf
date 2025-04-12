import 'dotenv/config'

/**
 * Простой скрипт для проверки доступности переменных окружения Inngest
 *
 * Запуск: npx tsx test-inngest-availability.ts
 */

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

console.log(`${colors.blue}🚀 Проверка настроек Inngest${colors.reset}\n`)

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

  const displayValue = hasValue
    ? key === 'INNGEST_EVENT_KEY' || key === 'INNGEST_SIGNING_KEY'
      ? `${value.substring(0, 5)}...${value.substring(value.length - 5)}`
      : value
    : 'не задано'

  console.log(
    `  ${colors.yellow}${key}:${colors.reset} ${status} (${displayValue})`
  )
})

// Проверяем основные параметры конфигурации
console.log(`\n${colors.cyan}Статус конфигурации:${colors.reset}`)

const configStatus = {
  'Основной ключ': !!process.env.INNGEST_EVENT_KEY,
  'Ключ подписи': !!process.env.INNGEST_SIGNING_KEY,
  'URL Inngest': !!process.env.INNGEST_URL,
}

Object.entries(configStatus).forEach(([key, isAvailable]) => {
  const status = isAvailable
    ? `${colors.green}✓ Настроен${colors.reset}`
    : `${colors.yellow}⚠ Не настроен${colors.reset}`

  console.log(`  ${colors.magenta}${key}:${colors.reset} ${status}`)
})

// Итоговое заключение
const allRequiredAvailable = configStatus['Основной ключ']
const warning = !allRequiredAvailable
  ? `\n${colors.yellow}⚠ Предупреждение: Отсутствует обязательный ключ INNGEST_EVENT_KEY${colors.reset}`
  : ''

console.log(`\n${colors.blue}Итог проверки:${colors.reset}`)
console.log(
  allRequiredAvailable
    ? `${colors.green}✓ Базовая настройка Inngest в порядке${colors.reset}`
    : `${colors.red}✗ Базовая настройка Inngest неполная${colors.reset}`
)

if (warning) console.log(warning)

// Инструкции в случае проблем с настройкой
if (!allRequiredAvailable) {
  console.log(`\n${colors.cyan}Инструкции для настройки:${colors.reset}`)
  console.log(`1. Добавьте INNGEST_EVENT_KEY в файл .env`)
  console.log(`2. Опционально добавьте INNGEST_SIGNING_KEY и INNGEST_URL`)
  console.log(`3. Перезапустите приложение после обновления переменных`)
}

console.log('\n')
