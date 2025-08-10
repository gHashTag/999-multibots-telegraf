#!/usr/bin/env node

/**
 * Скрипт для тестирования функции getReferalsCountAndUserData
 */

const path = require('path')
const { execSync } = require('child_process')

// Устанавливаем NODE_ENV и запускаем через Bun
process.env.NODE_ENV = 'test'

const telegramId = process.argv[2]

if (!telegramId) {
  console.error('❌ Использование: node scripts/test-referrals-function.js <telegram_id>')
  console.error('   Пример: node scripts/test-referrals-function.js 484954118')
  process.exit(1)
}

const testScript = `
import { getReferalsCountAndUserData } from './src/core/supabase/getReferalsCountAndUserData.js'

console.log('🔍 Тестирование функции getReferalsCountAndUserData для пользователя:', '${telegramId}')

try {
  const result = await getReferalsCountAndUserData('${telegramId}')
  
  console.log('📊 Результат функции:')
  console.log('   • count:', result.count)
  console.log('   • level:', result.level)
  console.log('   • subscriptionType:', result.subscriptionType)
  console.log('   • isExist:', result.isExist)
  console.log('   • userData:', result.userData ? {
    user_id: result.userData.user_id,
    telegram_id: result.userData.telegram_id,
    username: result.userData.username,
    first_name: result.userData.first_name,
    inviter: result.userData.inviter
  } : null)
  
  console.log('✅ Тест завершен успешно')
} catch (error) {
  console.error('❌ Ошибка:', error.message)
  process.exit(1)
}
`

try {
  // Сохраняем временный файл
  const fs = require('fs')
  const tempFile = 'temp-test-referrals.mjs'
  fs.writeFileSync(tempFile, testScript)
  
  // Запускаем через Bun
  const result = execSync(`bun run ${tempFile}`, { 
    encoding: 'utf8',
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: 'test' }
  })
  
  console.log(result)
  
  // Удаляем временный файл
  fs.unlinkSync(tempFile)
  
} catch (error) {
  console.error('❌ Ошибка выполнения:', error.message)
  if (error.stdout) console.log('STDOUT:', error.stdout)
  if (error.stderr) console.log('STDERR:', error.stderr)
  process.exit(1)
}
