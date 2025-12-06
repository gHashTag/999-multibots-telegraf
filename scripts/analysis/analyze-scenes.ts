/**
 * 🔍 Скрипт для анализа всех сцен
 * Проверяет:
 * - Соответствие ID сцен с вызовами
 * - Регистрацию в stage
 * - Использование кнопок навигации
 */

import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

interface SceneInfo {
  file: string
  id: string
  type: 'WizardScene' | 'BaseScene'
  exported: boolean
  registered: boolean
}

const scenesDir = join(process.cwd(), 'src/scenes')
const navigationServiceFile = join(
  process.cwd(),
  'src/services/NavigationService.ts'
)
const modesFile = join(process.cwd(), 'src/interfaces/modes.ts')

// Читаем файлы
const navigationServiceContent = readFileSync(navigationServiceFile, 'utf-8')
const modesContent = readFileSync(modesFile, 'utf-8')

// Извлекаем все ID сцен из NavigationService
const sceneIdPattern = /['"]([a-z_]+)['"]|ModeEnum\.([A-Za-z]+)/g
const registeredScenes = new Set<string>()
let match

while ((match = sceneIdPattern.exec(navigationServiceContent)) !== null) {
  const sceneId = match[1] || match[2]
  if (sceneId) {
    registeredScenes.add(sceneId.toLowerCase())
  }
}

// Извлекаем ModeEnum значения
const modeEnumPattern = /([A-Za-z]+)\s*=\s*['"]([a-z_]+)['"]/g
const modeEnumMap = new Map<string, string>()
while ((match = modeEnumPattern.exec(modesContent)) !== null) {
  modeEnumMap.set(match[1], match[2])
}

console.log('📊 АНАЛИЗ СЦЕН\n')
console.log(`Найдено зарегистрированных сцен: ${registeredScenes.size}`)
console.log(`Найдено ModeEnum значений: ${modeEnumMap.size}\n`)

// Функция для рекурсивного поиска всех .ts файлов
function findSceneFiles(dir: string, fileList: string[] = []): string[] {
  const files = readdirSync(dir)

  files.forEach(file => {
    const filePath = join(dir, file)
    const stat = statSync(filePath)

    if (stat.isDirectory()) {
      findSceneFiles(filePath, fileList)
    } else if (
      file.endsWith('.ts') &&
      !file.endsWith('.test.ts') &&
      !file.endsWith('.d.ts')
    ) {
      fileList.push(filePath)
    }
  })

  return fileList
}

// Находим все файлы сцен
const sceneFiles = findSceneFiles(scenesDir)
const scenes: SceneInfo[] = []

sceneFiles.forEach(file => {
  const content = readFileSync(file, 'utf-8')

  // Ищем определения сцен
  const wizardScenePattern =
    /new\s+Scenes\.WizardScene<[^>]*>\s*\(\s*['"]([^'"]+)['"]|new\s+Scenes\.WizardScene<[^>]*>\s*\(\s*ModeEnum\.([A-Za-z]+)/g
  const baseScenePattern =
    /new\s+Scenes\.BaseScene<[^>]*>\s*\(\s*['"]([^'"]+)['"]|new\s+Scenes\.BaseScene<[^>]*>\s*\(\s*ModeEnum\.([A-Za-z]+)/g

  let sceneMatch

  // WizardScene
  while ((sceneMatch = wizardScenePattern.exec(content)) !== null) {
    const sceneId = sceneMatch[1] || sceneMatch[2]
    if (sceneId) {
      const actualId =
        sceneMatch[1] ||
        modeEnumMap.get(sceneMatch[2]) ||
        sceneMatch[2].toLowerCase()
      scenes.push({
        file: file.replace(process.cwd(), ''),
        id: actualId,
        type: 'WizardScene',
        exported: content.includes('export'),
        registered:
          registeredScenes.has(actualId.toLowerCase()) ||
          registeredScenes.has(sceneMatch[2]?.toLowerCase() || ''),
      })
    }
  }

  // BaseScene
  while ((sceneMatch = baseScenePattern.exec(content)) !== null) {
    const sceneId = sceneMatch[1] || sceneMatch[2]
    if (sceneId) {
      const actualId =
        sceneMatch[1] ||
        modeEnumMap.get(sceneMatch[2]) ||
        sceneMatch[2].toLowerCase()
      scenes.push({
        file: file.replace(process.cwd(), ''),
        id: actualId,
        type: 'BaseScene',
        exported: content.includes('export'),
        registered:
          registeredScenes.has(actualId.toLowerCase()) ||
          registeredScenes.has(sceneMatch[2]?.toLowerCase() || ''),
      })
    }
  }
})

console.log(`\n📋 НАЙДЕНО СЦЕН: ${scenes.length}\n`)

// Группируем по статусу
const registered = scenes.filter(s => s.registered)
const notRegistered = scenes.filter(s => !s.registered)
const notExported = scenes.filter(s => !s.exported)

console.log('✅ ЗАРЕГИСТРИРОВАННЫЕ СЦЕНЫ:')
registered.forEach(s => {
  console.log(`  ✓ ${s.id} (${s.type}) - ${s.file}`)
})

if (notRegistered.length > 0) {
  console.log('\n❌ НЕ ЗАРЕГИСТРИРОВАННЫЕ СЦЕНЫ:')
  notRegistered.forEach(s => {
    console.log(`  ✗ ${s.id} (${s.type}) - ${s.file}`)
  })
}

if (notExported.length > 0) {
  console.log('\n⚠️ НЕ ЭКСПОРТИРОВАННЫЕ СЦЕНЫ:')
  notExported.forEach(s => {
    console.log(`  ⚠ ${s.id} (${s.type}) - ${s.file}`)
  })
}

// Ищем вызовы ctx.scene.enter
const enterCalls = new Set<string>()
const enterPattern =
  /ctx\.scene\.enter\(['"]([^'"]+)['"]|ctx\.scene\.enter\(ModeEnum\.([A-Za-z]+)/g

sceneFiles.forEach(file => {
  const content = readFileSync(file, 'utf-8')
  let match
  while ((match = enterPattern.exec(content)) !== null) {
    const sceneId = match[1] || match[2]
    if (sceneId) {
      const actualId =
        match[1] || modeEnumMap.get(match[2]) || match[2].toLowerCase()
      enterCalls.add(actualId)
    }
  }
})

// Проверяем, что все вызовы соответствуют зарегистрированным сценам
const missingScenes = Array.from(enterCalls).filter(id => {
  const sceneExists = scenes.some(
    s => s.id === id || s.id.toLowerCase() === id.toLowerCase()
  )
  const registered =
    registeredScenes.has(id.toLowerCase()) ||
    Array.from(modeEnumMap.values()).includes(id)
  return !sceneExists || !registered
})

if (missingScenes.length > 0) {
  console.log('\n🚨 ВЫЗОВЫ НЕСУЩЕСТВУЮЩИХ СЦЕН:')
  missingScenes.forEach(id => {
    console.log(`  ⚠ ${id}`)
  })
}

console.log(`\n📊 СТАТИСТИКА:`)
console.log(`  Всего сцен: ${scenes.length}`)
console.log(`  Зарегистрировано: ${registered.length}`)
console.log(`  Не зарегистрировано: ${notRegistered.length}`)
console.log(`  Вызовов ctx.scene.enter: ${enterCalls.size}`)
console.log(`  Проблемных вызовов: ${missingScenes.length}`)
