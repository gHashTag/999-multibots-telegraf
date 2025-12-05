/**
 * Скрипт для замены всех levels[] на прямые тексты из CATEGORIES
 * 
 * Запуск: pnpm tsx scripts/replace-all-levels.ts
 */

import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

// Маппинг levels[N] -> ModeEnum из CATEGORIES
const levelToModeMap: Record<number, string> = {
  1: 'ModeEnum.DigitalAvatarBody',
  2: 'ModeEnum.NeuroPhoto',
  3: 'ModeEnum.ImageToPrompt',
  4: 'ModeEnum.Avatar',
  5: 'ModeEnum.ChatWithAvatar',
  6: 'ModeEnum.SelectModel',
  7: 'ModeEnum.Voice',
  8: 'ModeEnum.TextToSpeech',
  9: 'ModeEnum.ImageToVideo',
  10: 'ModeEnum.TextToVideo',
  11: 'ModeEnum.TextToImage',
  12: "'ai_photoshop'",
  13: 'ModeEnum.ImageUpscaler',
  14: "'morphing'",
  15: "'face_swap'",
  16: "'ai_heroes'",
  17: "'lip_sync'", // Или ModeEnum.Help - нужно проверить контекст
  18: "'competitor_monitoring'",
  19: "'ai_reels'",
  20: 'ModeEnum.Invite',
  22: "'language'",
  23: 'ModeEnum.SubscriptionScene',
  24: 'ModeEnum.TopUpBalance',
  25: 'ModeEnum.Balance',
  100: 'ModeEnum.TopUpBalance', // Дубликат levels[24]
  101: 'ModeEnum.Balance', // Дубликат levels[25]
  102: 'ModeEnum.Invite', // Дубликат levels[20]
  103: 'ModeEnum.Help',
  104: "'main_menu'", // Специальный случай
  105: 'ModeEnum.SubscriptionScene', // Дубликат levels[23]
  106: "'language'", // Дубликат levels[22]
  107: 'ModeEnum.ImageUpscaler', // Дубликат levels[13]
  108: 'ModeEnum.VideoTranscription',
}

const filePath = join(process.cwd(), 'src/hearsHandlers.ts')
let content = readFileSync(filePath, 'utf-8')

// Собираем все переменные для объявления в начале функции
const variables: string[] = []

// Заменяем все levels[N].title_ru и levels[N].title_en
for (const [levelStr, mode] of Object.entries(levelToModeMap)) {
  const levelNum = parseInt(levelStr)
  
  // Создаем имя переменной
  const varName = `buttonTexts${levelNum}`
  
  // Проверяем, используется ли этот level
  const ruPattern = new RegExp(`levels\\[${levelNum}\\]\\.title_ru`, 'g')
  const enPattern = new RegExp(`levels\\[${levelNum}\\]\\.title_en`, 'g')
  
  if (ruPattern.test(content) || enPattern.test(content)) {
    // Добавляем объявление переменной
    if (mode === "'main_menu'") {
      variables.push(`  const ${varName} = getSpecialButtonTexts('main_menu')`)
    } else {
      variables.push(`  const ${varName} = getButtonTextsByMode(${mode}) || { ru: '', en: '' }`)
    }
    
    // Заменяем использования
    content = content.replace(ruPattern, `${varName}.ru`)
    content = content.replace(enPattern, `${varName}.en`)
  }
}

// Добавляем объявления переменных после начала функции setupHearsHandlers
const functionStart = content.indexOf('export const setupHearsHandlers')
const openingBrace = content.indexOf('{', functionStart)
const firstHandler = content.indexOf('bot.hears', openingBrace)

if (variables.length > 0 && firstHandler > -1) {
  const declarations = '\n' + variables.join('\n') + '\n'
  content = content.slice(0, firstHandler) + declarations + content.slice(firstHandler)
}

// Добавляем импорт getSpecialButtonTexts если его нет
if (!content.includes('getSpecialButtonTexts') && content.includes("'main_menu'")) {
  const importLine = content.indexOf("import { HAIM_GROUP_STAFF_IDS, getButtonTextsByMode }")
  if (importLine > -1) {
    content = content.replace(
      "import { HAIM_GROUP_STAFF_IDS, getButtonTextsByMode }",
      "import { HAIM_GROUP_STAFF_IDS, getButtonTextsByMode, getSpecialButtonTexts }"
    )
  }
}

writeFileSync(filePath, content, 'utf-8')
console.log(`✅ Замена завершена! Заменено ${variables.length} переменных.`)



