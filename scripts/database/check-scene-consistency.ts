/**
 * 🔍 СКРИПТ ПРОВЕРКИ СОГЛАСОВАННОСТИ СЦЕН
 * 
 * Проверяет:
 * 1. Все ли зарегистрированные сцены имеют корректные ID
 * 2. Все ли вызовы ctx.scene.enter() используют существующие сцены
 * 3. Соответствие между ModeEnum и реальными ID сцен
 * 
 * Запуск: npx ts-node scripts/check-scene-consistency.ts
 */

import * as fs from 'fs'
import * as path from 'path'

const SCENES_DIR = path.join(__dirname, '../src/scenes')
const SRC_DIR = path.join(__dirname, '../src')

interface SceneInfo {
  id: string
  file: string
  type: 'WizardScene' | 'BaseScene'
}

interface SceneEnterCall {
  sceneId: string
  file: string
  line: number
  raw: string
}

// Известные ID сцен из ModeEnum
const KNOWN_MODE_ENUM_IDS = [
  'neuro_photo', 'neuro_photo_v2', 'image_to_prompt', 'image_upscaler',
  'text_to_speech', 'voice', 'voice_to_text', 'lip_sync', 'video_transcription',
  'image_to_video', 'text_to_video', 'digital_avatar_body', 'digital_avatar_body_v2',
  'avatar_transform', 'face_swap', 'ai_heroes', 'subscribe', 'top_up_balance',
  'avatar', 'chat_with_avatar', 'video_in_url', 'helpScene', 'main_menu',
  'balance', 'invite', 'support', 'stats', 'price', 'start_scene', 'menuScene',
  'balance_scene', 'invite_scene', 'payment_scene', 'rublePaymentScene',
  'starPaymentScene', 'select_model', 'select_ai_text_model', 'select_model_wizard',
  'select_neuro_photo', 'change_size', 'improve_prompt', 'broadcast_wizard',
  'subscription_check_scene', 'improve_prompt_wizard', 'size_wizard', 'step0',
  'neuro_coder_scene', 'check_balance_scene', 'cancel_predictions_wizard',
  'email_wizard', 'get_ru_bill_wizard', 'subscription_scene', 'create_user_scene',
  'instagram_scraping_wizard', 'instagram_parser_scene', 'instagram_parser_wizard',
  'morphing_wizard', 'ai_photoshop', 'flux_kontext'
]

function findAllScenes(): SceneInfo[] {
  const scenes: SceneInfo[] = []
  
  function walkDir(dir: string) {
    const files = fs.readdirSync(dir)
    for (const file of files) {
      const filePath = path.join(dir, file)
      const stat = fs.statSync(filePath)
      
      if (stat.isDirectory()) {
        walkDir(filePath)
      } else if (file.endsWith('.ts') && !file.endsWith('.test.ts')) {
        const content = fs.readFileSync(filePath, 'utf-8')
        
        // Ищем определения сцен
        const wizardMatches = content.matchAll(/new Scenes\.WizardScene[^(]*\(\s*['"]([^'"]+)['"]/g)
        for (const match of wizardMatches) {
          scenes.push({
            id: match[1],
            file: filePath.replace(SRC_DIR, 'src'),
            type: 'WizardScene'
          })
        }
        
        const baseMatches = content.matchAll(/new Scenes\.BaseScene[^(]*\(\s*['"]([^'"]+)['"]/g)
        for (const match of baseMatches) {
          scenes.push({
            id: match[1],
            file: filePath.replace(SRC_DIR, 'src'),
            type: 'BaseScene'
          })
        }
        
        // Ищем сцены с ModeEnum
        const modeEnumWizard = content.matchAll(/new Scenes\.WizardScene[^(]*\(\s*(ModeEnum\.\w+)/g)
        for (const match of modeEnumWizard) {
          scenes.push({
            id: match[1],
            file: filePath.replace(SRC_DIR, 'src'),
            type: 'WizardScene'
          })
        }
        
        const modeEnumBase = content.matchAll(/new Scenes\.BaseScene[^(]*\(\s*(ModeEnum\.\w+)/g)
        for (const match of modeEnumBase) {
          scenes.push({
            id: match[1],
            file: filePath.replace(SRC_DIR, 'src'),
            type: 'BaseScene'
          })
        }
      }
    }
  }
  
  walkDir(SCENES_DIR)
  return scenes
}

function findAllSceneEnterCalls(): SceneEnterCall[] {
  const calls: SceneEnterCall[] = []
  
  function walkDir(dir: string) {
    const files = fs.readdirSync(dir)
    for (const file of files) {
      const filePath = path.join(dir, file)
      const stat = fs.statSync(filePath)
      
      if (stat.isDirectory() && !filePath.includes('node_modules') && !filePath.includes('__tests__')) {
        walkDir(filePath)
      } else if (file.endsWith('.ts') && !file.endsWith('.test.ts')) {
        const content = fs.readFileSync(filePath, 'utf-8')
        const lines = content.split('\n')
        
        lines.forEach((line, index) => {
          // Ищем вызовы ctx.scene.enter
          const stringMatch = line.match(/ctx\.scene\.enter\s*\(\s*['"]([^'"]+)['"]/);
          if (stringMatch) {
            calls.push({
              sceneId: stringMatch[1],
              file: filePath.replace(SRC_DIR, 'src'),
              line: index + 1,
              raw: line.trim()
            })
          }
          
          const modeEnumMatch = line.match(/ctx\.scene\.enter\s*\(\s*(ModeEnum\.\w+)/);
          if (modeEnumMatch) {
            calls.push({
              sceneId: modeEnumMatch[1],
              file: filePath.replace(SRC_DIR, 'src'),
              line: index + 1,
              raw: line.trim()
            })
          }
        })
      }
    }
  }
  
  walkDir(SRC_DIR)
  return calls
}

function main() {
  console.log('═'.repeat(70))
  console.log('🔍 ПРОВЕРКА СОГЛАСОВАННОСТИ СЦЕН')
  console.log('═'.repeat(70))
  console.log('')
  
  // 1. Находим все зарегистрированные сцены
  const registeredScenes = findAllScenes()
  console.log(`📋 Найдено ${registeredScenes.length} зарегистрированных сцен:`)
  console.log('')
  
  const sceneIds = new Set<string>()
  registeredScenes.forEach(scene => {
    sceneIds.add(scene.id)
  })
  
  // Группируем по ID для поиска дубликатов
  const scenesByIdMap = new Map<string, SceneInfo[]>()
  registeredScenes.forEach(scene => {
    const existing = scenesByIdMap.get(scene.id) || []
    existing.push(scene)
    scenesByIdMap.set(scene.id, existing)
  })
  
  // 2. Проверяем дубликаты ID
  console.log('🔴 ДУБЛИКАТЫ ID СЦЕН:')
  let hasDuplicates = false
  scenesByIdMap.forEach((scenes, id) => {
    if (scenes.length > 1) {
      hasDuplicates = true
      console.log(`  ❌ "${id}" определён ${scenes.length} раз:`)
      scenes.forEach(s => console.log(`     - ${s.file}`))
    }
  })
  if (!hasDuplicates) {
    console.log('  ✅ Дубликатов не найдено')
  }
  console.log('')
  
  // 3. Находим все вызовы ctx.scene.enter
  const enterCalls = findAllSceneEnterCalls()
  console.log(`📞 Найдено ${enterCalls.length} вызовов ctx.scene.enter()`)
  console.log('')
  
  // 4. Проверяем несуществующие сцены
  console.log('🔴 ВЫЗОВЫ НЕСУЩЕСТВУЮЩИХ СЦЕН:')
  let hasInvalidCalls = false
  
  const uniqueCalledIds = new Set<string>()
  enterCalls.forEach(call => uniqueCalledIds.add(call.sceneId))
  
  enterCalls.forEach(call => {
    // Пропускаем ModeEnum (они преобразуются в строки)
    if (call.sceneId.startsWith('ModeEnum.')) {
      return
    }
    
    // Пропускаем динамические ID
    if (call.sceneId.includes('${') || call.sceneId.includes('`')) {
      return
    }
    
    if (!sceneIds.has(call.sceneId)) {
      hasInvalidCalls = true
      console.log(`  ❌ "${call.sceneId}"`)
      console.log(`     📄 ${call.file}:${call.line}`)
      console.log(`     📝 ${call.raw.substring(0, 80)}...`)
    }
  })
  
  if (!hasInvalidCalls) {
    console.log('  ✅ Все вызываемые сцены существуют')
  }
  console.log('')
  
  // 5. Проверяем использование строковых литералов вместо ModeEnum
  console.log('⚠️  СТРОКОВЫЕ ЛИТЕРАЛЫ ВМЕСТО ModeEnum:')
  const stringLiterals: SceneEnterCall[] = []
  enterCalls.forEach(call => {
    if (!call.sceneId.startsWith('ModeEnum.') && !call.sceneId.includes('${')) {
      stringLiterals.push(call)
    }
  })
  
  if (stringLiterals.length > 0) {
    console.log(`  Найдено ${stringLiterals.length} вызовов со строковыми литералами:`)
    stringLiterals.slice(0, 20).forEach(call => {
      console.log(`  ⚠️  "${call.sceneId}" в ${call.file}:${call.line}`)
    })
    if (stringLiterals.length > 20) {
      console.log(`  ... и ещё ${stringLiterals.length - 20} вызовов`)
    }
  } else {
    console.log('  ✅ Все вызовы используют ModeEnum')
  }
  console.log('')
  
  // 6. Список всех уникальных ID сцен
  console.log('📋 ВСЕ ЗАРЕГИСТРИРОВАННЫЕ ID СЦЕН:')
  const sortedIds = Array.from(sceneIds).sort()
  sortedIds.forEach(id => {
    const isModeEnum = id.startsWith('ModeEnum.')
    const icon = isModeEnum ? '🔷' : '📝'
    console.log(`  ${icon} ${id}`)
  })
  console.log('')
  
  // 7. Итог
  console.log('═'.repeat(70))
  console.log('📊 ИТОГ:')
  console.log(`  • Сцен зарегистрировано: ${registeredScenes.length}`)
  console.log(`  • Уникальных ID: ${sceneIds.size}`)
  console.log(`  • Вызовов scene.enter: ${enterCalls.length}`)
  console.log(`  • Строковых литералов: ${stringLiterals.length}`)
  console.log(`  • Ошибок: ${hasInvalidCalls || hasDuplicates ? '❌ ЕСТЬ' : '✅ НЕТ'}`)
  console.log('═'.repeat(70))
}

main()
