#!/usr/bin/env node

/**
 * 🔧 Автоматический скрипт для добавления недостающих обработчиков кнопок
 *
 * ПРОБЛЕМА: В hearsHandlers.ts есть обработчики только для levels[1-12, 14, 19, 100-103, 107-108]
 * РЕШЕНИЕ: Добавляем обработчики для ВСЕХ 25 кнопок из NAVIGATION_BUTTONS
 *
 * Схема:
 * - levels[1] = '🤖 Цифровое тело'
 * - levels[2] = '📸 Нейрофото'
 * - levels[3] = '🔍 Промпт из фото'
 * - ...
 * - levels[25] = '💰 Баланс'
 */

const fs = require('fs')
const path = require('path')

// Получаем все кнопки из unified-navigation.config.ts
const navConfigPath = path.join(process.cwd(), 'src/navigation/unified-navigation.config.ts')
const navConfigContent = fs.readFileSync(navConfigPath, 'utf8')

// Извлекаем NAVIGATION_BUTTONS
const buttonsMatch = navConfigContent.match(/export const NAVIGATION_BUTTONS: NavigationButton\[\] = \[([\s\S]*?)\];/)
if (!buttonsMatch) {
  console.error('❌ Не удалось найти NAVIGATION_BUTTONS')
  process.exit(1)
}

console.log('🔍 Найден NAVIGATION_BUTTONS, извлекаем кнопки...\n')

// Простой парсер для извлечения кнопок
const buttonsText = buttonsMatch[1]
const buttonLines = buttonsText.split('\n').filter(line => line.includes('ru:') && line.includes('mode:'))

const buttons = buttonLines.map((line, index) => {
  const ruMatch = line.match(/ru:\s*'([^']+)'/)
  const enMatch = line.match(/en:\s*'([^']+)'/)
  const modeMatch = line.match(/mode:\s*ModeEnum\.([^,]+)|mode:\s*'([^']+)'/)

  let mode = ''
  if (modeMatch) {
    mode = modeMatch[1] || modeMatch[2] || ''
  }

  return {
    index: index + 1, // levels[1], levels[2], etc.
    ru: ruMatch ? ruMatch[1] : '',
    en: enMatch ? enMatch[1] : '',
    mode: mode,
    level: index + 1
  }
}).filter(btn => btn.ru && btn.en)

console.log(`📋 Найдено ${buttons.length} кнопок в NAVIGATION_BUTTONS:\n`)

buttons.forEach(btn => {
  console.log(`  levels[${btn.level}]: ${btn.ru} / ${btn.en} (${btn.mode})`)
})

// Теперь читаем текущий hearsHandlers.ts
const hearsPath = path.join(process.cwd(), 'src/hearsHandlers.ts')
const hearsContent = fs.readFileSync(hearsPath, 'utf8')

// Находим существующие обработчики уровней
const existingLevels = []
const levelPattern = /levels\[(\d+)\]\.title_ru/g
let match
while ((match = levelPattern.exec(hearsContent)) !== null) {
  existingLevels.push(parseInt(match[1]))
}

console.log(`\n📊 Существующие обработчики в hearsHandlers.ts: levels[${existingLevels.join(', ')}]`)

// Находим недостающие уровни
const allLevels = Array.from({ length: 25 }, (_, i) => i + 1)
const missingLevels = allLevels.filter(level => !existingLevels.includes(level))

console.log(`\n❌ Недостающие обработчики для levels: [${missingLevels.join(', ')}]`)

// Создаем недостающие обработчики
const handlerTemplate = `
  // === КНОПКА levels[{level}] - {ru} / {en} ===
  bot.hears([levels[{level}].title_ru, levels[{level}].title_en], async (ctx) => {{
    const is_ru = isRussianFromState(ctx)
    logger.info('NAVIGATION HEARS: {buttonText} pressed', {{
      telegramId: ctx.from?.id,
      buttonText: ctx.message && 'text' in ctx.message ? ctx.message.text : 'unknown'
    }})

    try {{
      // Устанавливаем режим и переходим в CheckBalanceScene
      ctx.session.mode = ModeEnum.{mode}
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)

      logger.info('✅ NAVIGATION HEARS: Successfully entered scene for {buttonText}', {{
        telegramId: ctx.from?.id
      }})
    }} catch (error) {{
      logger.error('❌ NAVIGATION HEARS: Error in handler for {buttonText}:', {{
        error: error instanceof Error ? error.message : String(error),
        telegramId: ctx.from?.id
      }})

      await ctx.reply(
        is_ru
          ? '❌ Произошла ошибка. Попробуйте позже.'
          : '❌ An error occurred. Please try again later.'
      )
    }}
  }})
`

const missingHandlers = missingLevels.map(level => {
  const button = buttons.find(b => b.level === level)
  if (!button) {
    console.warn(`⚠️  Не найдена кнопка для levels[${level}]`)
    return ''
  }

  return handlerTemplate
    .replace(/{level}/g, level)
    .replace(/{ru}/g, button.ru)
    .replace(/{en}/g, button.en)
    .replace(/{mode}/g, button.mode || 'MainMenu')
    .replace(/{buttonText}/g, button.ru)
}).join('\n')

// Находим место для вставки (после последнего существующего bot.hears для levels)
const insertPoint = hearsContent.lastIndexOf('})')
if (insertPoint === -1) {
  console.error('❌ Не удалось найти место для вставки')
  process.exit(1)
}

// Вставляем новые обработчики
const newContent = hearsContent.slice(0, insertPoint) + missingHandlers + '\n' + hearsContent.slice(insertPoint)

// Записываем файл
fs.writeFileSync(hearsPath, newContent)

console.log(`\n✅ Добавлено ${missingLevels.length} недостающих обработчиков в hearsHandlers.ts`)
console.log('📝 Обработчики добавлены для levels:', missingLevels)
console.log('\n🎉 Все кнопки теперь должны работать!')
console.log('🔄 Перезапустите сервер для тестирования')
