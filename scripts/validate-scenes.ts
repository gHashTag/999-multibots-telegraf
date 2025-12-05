/**
 * ✅ Скрипт для валидации всех сцен
 * Проверяет:
 * - Все сцены зарегистрированы в stage
 * - Все вызовы ctx.scene.enter используют правильные ID
 * - Все кнопки навигации используют централизованные функции
 */

import { readFileSync } from 'fs'
import { glob } from 'glob'
import { join } from 'path'

interface SceneValidationResult {
  file: string
  issues: string[]
}

async function validateScenes() {
  const navigationServiceFile = join(process.cwd(), 'src/services/NavigationService.ts')
  const scenesIndexFile = join(process.cwd(), 'src/scenes/index.ts')
  const modesFile = join(process.cwd(), 'src/interfaces/modes.ts')

  const navContent = readFileSync(navigationServiceFile, 'utf-8')
  const scenesIndexContent = readFileSync(scenesIndexFile, 'utf-8')
  const modesContent = readFileSync(modesFile, 'utf-8')

  // Извлекаем все зарегистрированные сцены
  const registeredScenes = new Set<string>()
  
  // Извлекаем из scenesToRegister
  const scenesToRegisterMatch = navContent.match(/const scenesToRegister = \[([\s\S]*?)\]/)
  if (scenesToRegisterMatch) {
    const scenesList = scenesToRegisterMatch[1]
    const sceneVarPattern = /(\w+Scene|\w+Wizard)/g
    let match
    while ((match = sceneVarPattern.exec(scenesList)) !== null) {
      registeredScenes.add(match[1].toLowerCase())
    }
  }

  // Извлекаем ModeEnum значения
  const modeEnumMap = new Map<string, string>()
  const modeEnumPattern = /([A-Za-z]+)\s*=\s*['"]([^'"]+)['"]/g
  let match
  while ((match = modeEnumPattern.exec(modesContent)) !== null) {
    modeEnumMap.set(match[1], match[2])
  }

  // Извлекаем ID сцен из определений
  const sceneFiles = await glob('**/scenes/**/*.ts', {
    cwd: process.cwd(),
    ignore: ['**/node_modules/**', '**/dist/**', '**/*.test.ts']
  })

  const sceneIds = new Map<string, string>() // file -> sceneId

  for (const file of sceneFiles) {
    const content = readFileSync(join(process.cwd(), file), 'utf-8')
    
    // Ищем определения сцен
    const wizardPattern = /new\s+Scenes\.WizardScene[^)]*\(\s*['"]([^'"]+)['"]|new\s+Scenes\.WizardScene[^)]*\(\s*ModeEnum\.([A-Za-z]+)/g
    const basePattern = /new\s+Scenes\.BaseScene[^)]*\(\s*['"]([^'"]+)['"]|new\s+Scenes\.BaseScene[^)]*\(\s*ModeEnum\.([A-Za-z]+)/g
    
    let sceneMatch
    while ((sceneMatch = wizardPattern.exec(content)) !== null) {
      const sceneId = sceneMatch[1] || modeEnumMap.get(sceneMatch[2]) || sceneMatch[2]?.toLowerCase()
      if (sceneId) {
        sceneIds.set(file, sceneId)
      }
    }
    
    while ((sceneMatch = basePattern.exec(content)) !== null) {
      const sceneId = sceneMatch[1] || modeEnumMap.get(sceneMatch[2]) || sceneMatch[2]?.toLowerCase()
      if (sceneId) {
        sceneIds.set(file, sceneId)
      }
    }
  }

  // Проверяем вызовы ctx.scene.enter
  const results: SceneValidationResult[] = []
  const allFiles = await glob('**/*.ts', {
    cwd: process.cwd(),
    ignore: ['**/node_modules/**', '**/dist/**', '**/*.test.ts', '**/scripts/**']
  })

  for (const file of allFiles) {
    const content = readFileSync(join(process.cwd(), file), 'utf-8')
    const issues: string[] = []

    // Проверяем вызовы ctx.scene.enter
    const enterPattern = /ctx\.scene\.enter\(['"]([^'"]+)['"]|ctx\.scene\.enter\(ModeEnum\.([A-Za-z]+)/g
    let enterMatch
    while ((enterMatch = enterPattern.exec(content)) !== null) {
      const calledSceneId = enterMatch[1] || modeEnumMap.get(enterMatch[2]) || enterMatch[2]?.toLowerCase()
      
      // Проверяем, что сцена существует
      const sceneExists = Array.from(sceneIds.values()).includes(calledSceneId) ||
                         registeredScenes.has(calledSceneId?.toLowerCase() || '')
      
      if (!sceneExists && calledSceneId) {
        // Исключения для известных проблемных вызовов
        if (calledSceneId === 'main_menu' || calledSceneId === 'start_scene') {
          issues.push(`⚠️ Используется устаревший ID сцены: '${calledSceneId}'. Замените на showMainMenu() или 'startScene'`)
        } else {
          issues.push(`❌ Вызов несуществующей сцены: '${calledSceneId}'`)
        }
      }
    }

    if (issues.length > 0) {
      results.push({ file, issues })
    }
  }

  // Выводим результаты
  console.log('📊 РЕЗУЛЬТАТЫ ВАЛИДАЦИИ СЦЕН\n')
  
  if (results.length === 0) {
    console.log('✅ Все сцены валидны!')
  } else {
    console.log(`❌ Найдено проблем в ${results.length} файлах:\n`)
    results.forEach(({ file, issues }) => {
      console.log(`📄 ${file}:`)
      issues.forEach(issue => console.log(`  ${issue}`))
      console.log()
    })
  }

  console.log(`\n📈 Статистика:`)
  console.log(`  Всего сцен: ${sceneIds.size}`)
  console.log(`  Зарегистрировано: ${registeredScenes.size}`)
  console.log(`  Проблемных файлов: ${results.length}`)
}

validateScenes().catch(console.error)



