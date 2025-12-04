#!/usr/bin/env node

/**
 * 🔍 ТЕСТ КНОПКИ "ТЕХПОДДЕРЖКА"
 *
 * Проверяем, что обработчик правильно настроен
 */

const fs = require('fs')

console.log('🔍 ТЕСТИРУЕМ КНОПКУ "💬 ТЕХПОДДЕРЖКА"\n')

// 1. Проверяем unified-navigation.config.ts
console.log('1️⃣ Проверяем unified-navigation.config.ts...')
const navContent = fs.readFileSync('./src/navigation/unified-navigation.config.ts', 'utf8')

// Ищем "💬 Техподдержка" в NAVIGATION_BUTTONS
const buttonMatch = navContent.match(/ru:\s*'💬 Техподдержка'[\s\S]*?mode:\s*([^,\n]+)/)
if (buttonMatch) {
  console.log('   ✅ Кнопка найдена в NAVIGATION_BUTTONS')
  console.log('   📍 Mode:', buttonMatch[1].trim())
} else {
  console.log('   ❌ КНОПКА НЕ НАЙДЕНА В NAVIGATION_BUTTONS')
}

// 2. Проверяем levels[21]
const level21Match = navContent.match(/NAVIGATION_BUTTONS\.forEach[\s\S]*?levels\[(\d+)\]/g)
if (level21Match) {
  console.log('   ✅ Автогенерация levels[] найдена')
}

// Ищем уровень для техподдержки
const techSupportInLevels = navContent.match(/levels\[(\d+)\][\s\S]*?💬 Техподдержка/g)
if (techSupportInLevels) {
  techSupportInLevels.forEach(match => {
    const levelNum = match.match(/levels\[(\d+)\]/)[1]
    console.log(`   📍 levels[${levelNum}] = "💬 Техподдержка"`)
  })
}

// 3. Проверяем hearsHandlers.ts
console.log('\n2️⃣ Проверяем hearsHandlers.ts...')
const hearsContent = fs.readFileSync('./src/hearsHandlers.ts', 'utf8')

// Ищем обработчик для levels[21]
const handler21Match = hearsContent.match(/levels\[21\]\.title_ru[\s\S]*?bot\.hears/)
if (handler21Match) {
  console.log('   ✅ Обработчик для levels[21] найден')
} else {
  console.log('   ❌ Обработчик для levels[21] НЕ НАЙДЕН')
}

// Ищем текст "DEBUG TECH SUPPORT"
const debugMatch = hearsContent.match(/DEBUG TECH SUPPORT/)
if (debugMatch) {
  console.log('   ✅ Отладочный лог добавлен')
}

// 4. Проверяем индексы
console.log('\n3️⃣ Анализ индексов...')
const buttonLines = navContent.split('\n').filter(line => line.includes("ru: '💬 Техподдержка'"))
if (buttonLines.length > 0) {
  const lineNum = navContent.split('\n').indexOf(buttonLines[0]) + 1
  console.log(`   📍 Строка ${lineNum}: "💬 Техподдержка"`)

  // Считаем индекс в массиве
  const arrayStart = navContent.indexOf('export const NAVIGATION_BUTTONS')
  const beforeButton = navContent.substring(arrayStart, navContent.indexOf(buttonLines[0]))
  const commas = (beforeButton.match(/},\s*{/g) || []).length
  console.log(`   📍 Индекс в массиве: ${commas}`)
  console.log(`   📍 Будет levels[${commas + 1}]`)
}

console.log('\n✅ ТЕСТ ЗАВЕРШЕН')
console.log('\n💡 Для проверки работы:')
console.log('   1. Сервер запущен локально')
console.log('   2. Отправьте боту сообщение "💬 Техподдержка"')
console.log('   3. Проверьте логи на наличие "🔍 [DEBUG TECH SUPPORT]"')
