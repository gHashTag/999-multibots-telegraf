#!/usr/bin/env node

/**
 * Скрипт для проверки обязательных переменных окружения
 */

const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')

// Загружаем переменные окружения из .env файла, если он существует
if (fs.existsSync(path.resolve(process.cwd(), '.env'))) {
  console.log('🔍 Загружаем переменные окружения из .env файла...')
  dotenv.config()
}

// Список обязательных переменных окружения
const requiredVars = [
  'BOT_TOKEN_1',
  'BOT_TOKEN_2',
  'BOT_TOKEN_3',
  'BOT_TOKEN_4',
  'BOT_TOKEN_5',
  'BOT_TOKEN_6',
  'BOT_TOKEN_7',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SERVICE_KEY',
  'INNGEST_EVENT_KEY',
  'INNGEST_SIGNING_KEY',
]

// Проверяем, все ли обязательные переменные установлены
const missingVars = requiredVars.filter(varName => !process.env[varName])

if (missingVars.length > 0) {
  console.error('❌ Отсутствуют следующие обязательные переменные окружения:')
  missingVars.forEach(varName => {
    console.error(`  - ${varName}`)
  })
  console.error(
    'Пожалуйста, установите эти переменные в файле .env или через переменные окружения.'
  )
  process.exit(1)
} else {
  console.log('✅ Все обязательные переменные окружения установлены.')
  console.log(
    '🔑 BOT_TOKEN_1:',
    `${process.env.BOT_TOKEN_1.substring(0, 10)}...`
  )
  console.log(
    '🔌 SUPABASE_URL:',
    `${process.env.SUPABASE_URL.substring(0, 10)}...`
  )
  console.log(
    '🎯 INNGEST_EVENT_KEY:',
    `${process.env.INNGEST_EVENT_KEY.substring(0, 10)}...`
  )
}

// Проверяем длину токенов ботов
for (let i = 1; i <= 7; i++) {
  const tokenVar = `BOT_TOKEN_${i}`
  const token = process.env[tokenVar]

  if (token && token.length < 30) {
    console.warn(
      `⚠️ ${tokenVar} имеет подозрительно короткую длину: ${token.length} символов.`
    )
  }
}

// Проверка тестовой среды
if (process.env.NODE_ENV === 'test') {
  const testRequiredVars = ['BOT_TOKEN_TEST_1', 'BOT_TOKEN_TEST_2']

  const missingTestVars = testRequiredVars.filter(
    varName => !process.env[varName]
  )

  if (missingTestVars.length > 0) {
    console.warn('⚠️ Отсутствуют некоторые переменные для тестовой среды:')
    missingTestVars.forEach(varName => {
      console.warn(`  - ${varName}`)
    })
  } else {
    console.log('✅ Все переменные для тестовой среды установлены.')
  }
}

// Успешное завершение
console.log('🚀 Проверка переменных окружения завершена успешно.')
process.exit(0)
