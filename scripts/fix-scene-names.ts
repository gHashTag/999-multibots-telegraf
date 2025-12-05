/**
 * 🔧 Скрипт для исправления несоответствий имен сцен
 * Заменяет:
 * - 'main_menu' -> showMainMenu() или ModeEnum.MainMenu
 * - 'start_scene' -> 'startScene'
 * - 'menuscene' -> ModeEnum.MenuScene
 */

import { readFileSync, writeFileSync } from 'fs'
import { glob } from 'glob'
import { join } from 'path'

const scenesDir = join(process.cwd(), 'src/scenes')
const servicesDir = join(process.cwd(), 'src/services')
const componentsDir = join(process.cwd(), 'src/components')

// Паттерны для замены
const replacements = [
  {
    pattern: /ctx\.scene\.enter\(['"]main_menu['"]\)/g,
    replacement: `await ctx.scene.leave()\n        const { showMainMenu } = await import('@/services/NavigationService')\n        await showMainMenu(ctx)`,
    description: "Замена 'main_menu' на showMainMenu()"
  },
  {
    pattern: /ctx\.scene\.enter\(['"]start_scene['"]\)/g,
    replacement: `ctx.scene.enter('startScene')`,
    description: "Замена 'start_scene' на 'startScene'"
  },
  {
    pattern: /ctx\.scene\.enter\(['"]menuscene['"]\)/g,
    replacement: `ctx.scene.enter(ModeEnum.MenuScene)`,
    description: "Замена 'menuscene' на ModeEnum.MenuScene"
  },
]

async function fixSceneNames() {
  const files = await glob('**/*.ts', {
    cwd: process.cwd(),
    ignore: ['**/node_modules/**', '**/dist/**', '**/*.test.ts', '**/scripts/**']
  })

  let totalReplacements = 0

  for (const file of files) {
    const filePath = join(process.cwd(), file)
    let content = readFileSync(filePath, 'utf-8')
    let fileReplacements = 0

    for (const { pattern, replacement, description } of replacements) {
      const matches = content.match(pattern)
      if (matches) {
        console.log(`📝 ${file}: ${description} (${matches.length} замен)`)
        content = content.replace(pattern, replacement)
        fileReplacements += matches.length
      }
    }

    if (fileReplacements > 0) {
      writeFileSync(filePath, content, 'utf-8')
      totalReplacements += fileReplacements
      console.log(`✅ Исправлено ${fileReplacements} замен в ${file}\n`)
    }
  }

  console.log(`\n🎉 Всего исправлено: ${totalReplacements} замен`)
}

fixSceneNames().catch(console.error)



