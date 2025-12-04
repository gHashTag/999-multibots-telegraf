#!/usr/bin/env node

/**
 * 🔧 Автоматический скрипт для добавления fallback к levels[104]
 *
 * Проблема: Код обращается к levels[104].title_ru и levels[104].title_en напрямую
 * Решение: Заменяем на безопасный доступ с fallback
 *
 * БЫЛО: levels[104].title_ru
 * СТАЛО: (levels?.[104]?.title_ru || '🏠 Главное меню')
 *
 * БЫЛО: levels[104].title_en
 * СТАЛО: (levels?.[104]?.title_en || '🏠 Main menu')
 */

const fs = require('fs')
const path = require('path')

// Регулярные выражения для поиска проблемных обращений
const patterns = [
  {
    // levels[104].title_ru
    regex: /levels\[104\]\.title_ru/g,
    replacement: "(levels?.[104]?.title_ru || '🏠 Главное меню')"
  },
  {
    // levels[104].title_en
    regex: /levels\[104\]\.title_en/g,
    replacement: "(levels?.[104]?.title_en || '🏠 Main menu')"
  }
]

// Файлы для обработки
const filesToProcess = [
  'src/hearsHandlers.ts',
  'src/menu/startMenu.ts',
  'src/menu/videoModelMenu.ts',
  'src/scenes/videoTranscriptionWizard/index.ts',
  'src/scenes/levelQuestWizard/handlers.ts',
  'src/scenes/neuroPhotoWizardV2/index.ts',
  'src/services/plan_b/generateImageToPrompt.ts'
]

console.log('🔧 Начинаем исправление levels[104] с fallback...\n')

let fixedCount = 0

filesToProcess.forEach(filePath => {
  const fullPath = path.join(process.cwd(), filePath)

  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  Файл не найден: ${filePath}`)
    return
  }

  let content = fs.readFileSync(fullPath, 'utf8')
  let fileFixedCount = 0

  patterns.forEach(({ regex, replacement }) => {
    const matches = content.match(regex)
    if (matches) {
      content = content.replace(regex, replacement)
      fileFixedCount += matches.length
      console.log(`  ✅ ${filePath}: заменено ${matches.length} обращений`)
    }
  })

  if (fileFixedCount > 0) {
    fs.writeFileSync(fullPath, content)
    fixedCount += fileFixedCount
  }
})

console.log(`\n🎉 Готово! Всего исправлено: ${fixedCount} обращений к levels[104]\n`)
console.log('📝 Теперь все обращения к levels[104] безопасны с fallback')
console.log('🚀 Можно тестировать локально!')
