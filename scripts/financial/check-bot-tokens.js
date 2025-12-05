#!/usr/bin/env node

/**
 * 🔍 ДИАГНОСТИКА ТОКЕНОВ БОТОВ
 * Проверяем все BOT_TOKEN_1-11 и статус ботов
 */

const fs = require('fs')

console.log('🔍 ДИАГНОСТИКА ТОКЕНОВ БОТОВ\n')

// Читаем содержимое файла конфигурации ботов
const botConfigPath = './src/core/bot/index.ts'
const botConfigContent = fs.readFileSync(botConfigPath, 'utf8')

// Извлекаем маппинг ботов
const botMappingMatch = botConfigContent.match(/export const BOT_NAMES: Record<BotName, string> = \{[\s\S]*?\}/)
if (!botMappingMatch) {
  console.log('❌ Не удалось найти маппинг ботов')
  process.exit(1)
}

console.log('📋 Маппинг ботов на токены:')
console.log('='.repeat(60))

const mappingContent = botMappingMatch[0]
const lines = mappingContent.split('\n').filter(line => line.trim().length > 0)

lines.forEach((line, index) => {
  // Пропускаем первую и последнюю строки
  if (index === 0 || index === lines.length - 1) return
  if (line.includes('as const')) return

  const match = line.match(/^\s*\['([^']+)'\]:\s*process\.env\.([^,\s]+)/)
  if (match) {
    const botName = match[1]
    const tokenEnv = match[2]

    console.log(`  ${botName}`)
    console.log(`    └─ Токен: ${tokenEnv}`)
    console.log(`    └─ Статус: ${tokenEnv === 'BOT_TOKEN_11' ? '🎯 ЦЕЛЕВОЙ БОТ' : 'Обычный'}`)
    console.log('')
  }
})

console.log('='.repeat(60))
console.log('\n📌 ПРОВЕРКА ПЕРЕМЕННЫХ ОКРУЖЕНИЯ:')

// Проверяем BOT_TOKEN_11 (критически важный)
console.log('\n1️⃣ BOT_TOKEN_11 (для OM_AI_Digital_studio_bot):')
if (process.env.BOT_TOKEN_11) {
  console.log(`   ✅ УСТАНОВЛЕН`)
  console.log(`   📏 Длина: ${process.env.BOT_TOKEN_11.length} символов`)
  console.log(`   🔒 Первые 10 символов: ${process.env.BOT_TOKEN_11.substring(0, 10)}...`)
} else {
  console.log(`   ❌ НЕ УСТАНОВЛЕН!`)
  console.log(`   💥 Это причина, почему бот @OM_AI_Digital_studio_bot не отвечает!`)
}

// Проверяем остальные токены для сравнения
console.log('\n2️⃣ Остальные токены (для сравнения):')
for (let i = 1; i <= 10; i++) {
  const tokenName = `BOT_TOKEN_${i}`
  const tokenValue = process.env[tokenName]
  const status = tokenValue ? '✅' : '❌'
  const length = tokenValue ? `${tokenValue.length} симв.` : 'нет'
  console.log(`   ${status} ${tokenName}: ${length}`)
}

console.log('\n' + '='.repeat(60))
console.log('\n💡 РЕШЕНИЕ:')

if (!process.env.BOT_TOKEN_11) {
  console.log('❌ Бот @OM_AI_Digital_studio_bot НЕ МОЖЕТ работать!')
  console.log('   Причина: BOT_TOKEN_11 не установлен в переменных окружения')
  console.log('')
  console.log('🔧 Что нужно сделать:')
  console.log('   1. Зайти в Infisical Dashboard')
  console.log('   2. Найти проект: fd763fa3-35d5-4045-93bd-1795c5f00fc3')
  console.log('   3. Добавить переменную BOT_TOKEN_11 со значением:')
  console.log('      8546804869:AAGYO9teJWJLVSsVj2U9nmyr5N80lIq7bvU')
  console.log('   4. Перезапустить сервер')
} else {
  console.log('✅ BOT_TOKEN_11 установлен')
  console.log('')
  console.log('🔍 Возможные причины молчания бота:')
  console.log('   1. Бот не инициализирован (проверить логи запуска)')
  console.log('   2. Ошибка в коде инициализации')
  console.log('   3. Бот запущен, но не получает сообщения')
  console.log('   4. Проблемы с сетью')
}

console.log('\n✅ ДИАГНОСТИКА ЗАВЕРШЕНА\n')
