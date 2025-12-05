/**
 * Скрипт для замены всех levels[] на прямые тексты из CATEGORIES
 * 
 * Запуск: pnpm tsx scripts/replace-levels-with-categories.ts
 */

import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

// Маппинг levels[N] -> ModeEnum (из анализа кода)
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
  12: 'ai_photoshop',
  13: 'ModeEnum.ImageUpscaler',
  14: 'morphing',
  15: 'face_swap',
  16: 'ai_heroes',
  17: 'lip_sync', // Или ModeEnum.Help для техподдержки
  18: 'competitor_monitoring',
  19: 'ai_reels',
  20: 'ModeEnum.Invite',
  22: 'language',
  23: 'ModeEnum.SubscriptionScene',
  24: 'ModeEnum.TopUpBalance',
  25: 'ModeEnum.Balance',
  100: 'ModeEnum.TopUpBalance',
  101: 'ModeEnum.Balance',
  102: 'ModeEnum.Invite',
  103: 'ModeEnum.Help',
  104: 'main_menu', // Специальный случай
  105: 'ModeEnum.SubscriptionScene',
  106: 'language',
  107: 'ModeEnum.ImageUpscaler',
  108: 'ModeEnum.VideoTranscription',
}

const filePath = join(process.cwd(), 'src/hearsHandlers.ts')
let content = readFileSync(filePath, 'utf-8')

// Заменяем все levels[N].title_ru и levels[N].title_en
for (const [level, mode] of Object.entries(levelToModeMap)) {
  const levelNum = parseInt(level)
  
  // Создаем замену для levels[N].title_ru
  const ruPattern = new RegExp(`levels\\[${levelNum}\\]\\.title_ru`, 'g')
  const enPattern = new RegExp(`levels\\[${levelNum}\\]\\.title_en`, 'g')
  
  // Для каждого уровня создаем переменную с текстами
  const varName = `buttonTexts${levelNum}`
  const replacementRu = `${varName}.ru`
  const replacementEn = `${varName}.en`
  
  // Заменяем
  content = content.replace(ruPattern, replacementRu)
  content = content.replace(enPattern, replacementEn)
  
  // Добавляем объявление переменной перед первым использованием
  const firstUsage = content.indexOf(replacementRu)
  if (firstUsage > -1) {
    const beforeUsage = content.substring(0, firstUsage)
    const afterUsage = content.substring(firstUsage)
    
    // Проверяем, не объявлена ли уже переменная
    if (!beforeUsage.includes(`const ${varName} =`)) {
      const importLine = content.indexOf("import { getButtonTextsByMode }")
      const afterImport = content.indexOf('\n', importLine) + 1
      
      // Вставляем объявление после импортов
      const declaration = `  const ${varName} = getButtonTextsByMode(${mode}) || { ru: '', en: '' }\n`
      content = content.slice(0, afterImport) + declaration + content.slice(afterImport)
    }
  }
}

writeFileSync(filePath, content, 'utf-8')
console.log('✅ Замена завершена!')



