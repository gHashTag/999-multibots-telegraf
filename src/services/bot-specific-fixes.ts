import { FixResult } from '../webhooks/github-autofixer.service'
import { logger } from '@/utils/enhancedLogger'

export interface BotSpecificFix {
  pattern: RegExp
  replacement: string | ((match: string, ...groups: string[]) => string)
  description: string
  type: 'async' | 'telegraf' | 'scene' | 'typescript' | 'eslint'
  severity: 'error' | 'warning' | 'info'
}

export class BotSpecificFixesEngine {
  
  private readonly fixes: BotSpecificFix[] = [
    // === ASYNC/AWAIT FIXES ===
    {
      pattern: /(bot\.(action|command|on|hears)\([^,]+,\s*)([a-zA-Z_$][a-zA-Z0-9_$]*\s*=>)/g,
      replacement: '$1async $3',
      description: 'Add async keyword to bot handler',
      type: 'async',
      severity: 'error'
    },
    {
      pattern: /(scene\.(enter|action|command|on|hears)\([^,]+,\s*)([a-zA-Z_$][a-zA-Z0-9_$]*\s*=>)/g,
      replacement: '$1async $3',
      description: 'Add async keyword to scene handler',
      type: 'async',
      severity: 'error'
    },
    {
      pattern: /(?<!await\s+)(ctx\.(?:reply|replyWithPhoto|replyWithVideo|replyWithDocument|replyWithAnimation|editMessageText)\([^)]+\))/g,
      replacement: 'await $1',
      description: 'Add await to ctx.reply methods',
      type: 'async',
      severity: 'error'
    },
    {
      pattern: /(?<!await\s+)(ctx\.scene\.(?:enter|leave|reenter)\([^)]+\))/g,
      replacement: 'await $1',
      description: 'Add await to scene transitions',
      type: 'async',
      severity: 'error'
    },
    {
      pattern: /(?<!await\s+)(ctx\.telegram\.[a-zA-Z]+\([^)]+\))/g,
      replacement: 'await $1',
      description: 'Add await to Telegram API calls',
      type: 'async',
      severity: 'error'
    },

    // === SCENE FIXES ===
    {
      pattern: /new Scenes\.BaseScene\('([^']+)'\)/g,
      replacement: "new Scenes.BaseScene<MyContext>('$1')",
      description: 'Add MyContext type to BaseScene',
      type: 'scene',
      severity: 'error'
    },
    {
      pattern: /new Scenes\.WizardScene\('([^']+)'/g,
      replacement: "new Scenes.WizardScene<MyContext>('$1'",
      description: 'Add MyContext type to WizardScene',
      type: 'scene',
      severity: 'error'
    },
    {
      pattern: /(wizard\.step\(\s*)([^,]+,\s*)(\([^)]*\)\s*=>\s*\{)/g,
      replacement: '$1$2async $3',
      description: 'Add async to wizard steps',
      type: 'scene',
      severity: 'error'
    },

    // === TELEGRAF FIXES ===
    {
      pattern: /(bot\.use\([^)]+\)),(\s*\([^)]*\)\s*=>\s*\{)/g,
      replacement: '$1, async$2',
      description: 'Add async to middleware',
      type: 'telegraf',
      severity: 'warning'
    },
    {
      pattern: /(\([^)]*ctx[^)]*,\s*next[^)]*\)\s*=>\s*\{[^}]*?)(\bnext\(\))/g,
      replacement: '$1await $2',
      description: 'Add await to next() in middleware',
      type: 'telegraf',
      severity: 'warning'
    },
    {
      pattern: /ctx\.answerInlineQuery\(/g,
      replacement: 'await ctx.answerInlineQuery(',
      description: 'Add await to answerInlineQuery',
      type: 'telegraf',
      severity: 'error'
    },
    {
      pattern: /ctx\.answerCbQuery\(/g,
      replacement: 'await ctx.answerCbQuery(',
      description: 'Add await to answerCbQuery',
      type: 'telegraf',
      severity: 'error'
    },

    // === TYPESCRIPT FIXES ===
    {
      pattern: /(\w+):\s*Context(?!<)/g,
      replacement: '$1: MyContext',
      description: 'Replace Context with MyContext',
      type: 'typescript',
      severity: 'warning'
    },
    {
      pattern: /Telegraf\(/g,
      replacement: 'Telegraf<MyContext>(',
      description: 'Add MyContext type to Telegraf',
      type: 'typescript',
      severity: 'warning'
    },

    // === ERROR HANDLING FIXES ===
    {
      pattern: /(async\s*\([^)]*\)\s*=>\s*\{)(\s*)([\s\S]*?)(\s*\})/g,
      replacement: (match, start, indent, body, end) => {
        if (body.includes('try {')) return match
        return `${start}${indent}try {${indent}  ${body.trim()}${indent}} catch (error) {${indent}  logger.error('Bot error:', error)${indent}  await ctx.reply('Произошла ошибка. Попробуйте позже.')${indent}}${end}`
      },
      description: 'Add error handling to async handlers',
      type: 'telegraf',
      severity: 'warning'
    }
  ]

  private readonly importFixes: Array<{
    condition: (content: string) => boolean
    fix: string
    description: string
  }> = [
    {
      condition: (content) => content.includes('MyContext') && !content.includes("import { MyContext }"),
      fix: "import { MyContext } from '../interfaces'",
      description: 'Add missing MyContext import'
    },
    {
      condition: (content) => content.includes('Scenes.') && !content.includes("import { Scenes }"),
      fix: "import { Scenes } from 'telegraf'",
      description: 'Add missing Scenes import'
    },
    {
      condition: (content) => content.includes('Composer') && !content.includes("import { Composer }"),
      fix: "import { Composer } from 'telegraf'",
      description: 'Add missing Composer import'
    },
    {
      condition: (content) => content.includes('session') && !content.includes("import { session }"),
      fix: "import { session } from 'telegraf'",
      description: 'Add missing session import'
    }
  ]

  applyFixes(content: string, filePath: string): { fixedContent: string, fixes: FixResult[] } {
    let fixedContent = content
    const appliedFixes: FixResult[] = []

    // 1. Применяем импорты в начало файла
    const importFixes = this.applyImportFixes(fixedContent)
    fixedContent = importFixes.content
    appliedFixes.push(...importFixes.fixes.map(fix => ({
      type: 'typescript' as const,
      description: fix.description,
      filePath
    })))

    // 2. Применяем основные исправления
    for (const fix of this.fixes) {
      const matches = [...fixedContent.matchAll(fix.pattern)]
      
      if (matches.length > 0) {
        // Определяем номера строк для каждого исправления
        const lineNumbers = matches.map(match => {
          const beforeMatch = fixedContent.substring(0, match.index || 0)
          return beforeMatch.split('\n').length
        })

        if (typeof fix.replacement === 'function') {
          fixedContent = fixedContent.replace(fix.pattern, fix.replacement)
        } else {
          fixedContent = fixedContent.replace(fix.pattern, fix.replacement)
        }

        appliedFixes.push({
          type: fix.type,
          description: fix.description,
          filePath,
          lineNumber: lineNumbers[0] // Берем первое совпадение для номера строки
        })

        logger.debug(`✅ [BotFixer] Applied ${fix.description} (${matches.length} occurrences)`)
      }
    }

    // 3. Применяем специфичные для файла исправления
    const fileSpecificFixes = this.applyFileSpecificFixes(fixedContent, filePath)
    fixedContent = fileSpecificFixes.content
    appliedFixes.push(...fileSpecificFixes.fixes)

    return { fixedContent, fixes: appliedFixes }
  }

  private applyImportFixes(content: string): { content: string, fixes: Array<{ description: string }> } {
    let fixedContent = content
    const appliedFixes: Array<{ description: string }> = []

    for (const importFix of this.importFixes) {
      if (importFix.condition(content)) {
        // Добавляем импорт в начало файла, после существующих импортов
        const lines = fixedContent.split('\n')
        let insertIndex = 0

        // Ищем последний импорт
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].startsWith('import ')) {
            insertIndex = i + 1
          } else if (lines[i].trim() === '' && insertIndex > 0) {
            // Пустая строка после импортов
            insertIndex = i
            break
          }
        }

        lines.splice(insertIndex, 0, importFix.fix)
        fixedContent = lines.join('\n')
        appliedFixes.push({ description: importFix.description })

        logger.debug(`✅ [BotFixer] ${importFix.description}`)
      }
    }

    return { content: fixedContent, fixes: appliedFixes }
  }

  private applyFileSpecificFixes(content: string, filePath: string): { content: string, fixes: FixResult[] } {
    const fixes: FixResult[] = []
    let fixedContent = content

    // Специфичные исправления для сцен
    if (filePath.includes('/scenes/')) {
      const sceneSpecificFixes = this.applySceneSpecificFixes(fixedContent, filePath)
      fixedContent = sceneSpecificFixes.content
      fixes.push(...sceneSpecificFixes.fixes)
    }

    // Специфичные исправления для команд
    if (filePath.includes('/commands/')) {
      const commandSpecificFixes = this.applyCommandSpecificFixes(fixedContent, filePath)
      fixedContent = commandSpecificFixes.content
      fixes.push(...commandSpecificFixes.fixes)
    }

    // Специфичные исправления для middleware
    if (filePath.includes('/middleware')) {
      const middlewareSpecificFixes = this.applyMiddlewareSpecificFixes(fixedContent, filePath)
      fixedContent = middlewareSpecificFixes.content
      fixes.push(...middlewareSpecificFixes.fixes)
    }

    return { content: fixedContent, fixes }
  }

  private applySceneSpecificFixes(content: string, filePath: string): { content: string, fixes: FixResult[] } {
    const fixes: FixResult[] = []
    let fixedContent = content

    // Проверяем экспорт сцены
    if (!content.includes('export') && content.includes('Scene')) {
      const sceneName = this.extractSceneName(content)
      if (sceneName) {
        fixedContent += `\n\nexport { ${sceneName} }`
        fixes.push({
          type: 'scene',
          description: `Export scene ${sceneName}`,
          filePath
        })
      }
    }

    // Исправляем обработчики wizard шагов
    fixedContent = fixedContent.replace(
      /wizard\.step\(([^,]+),\s*(\([^)]*\)\s*=>\s*\{)/g,
      'wizard.step($1, async $2'
    )

    if (content.includes('wizard.step') && !content.match(/wizard\.step\([^,]+,\s*async/)) {
      fixes.push({
        type: 'scene',
        description: 'Add async to wizard steps',
        filePath
      })
    }

    return { content: fixedContent, fixes }
  }

  private applyCommandSpecificFixes(content: string, filePath: string): { content: string, fixes: FixResult[] } {
    const fixes: FixResult[] = []
    let fixedContent = content

    // Добавляем валидацию параметров команд
    if (content.includes('ctx.message.text.split')) {
      const validationCode = `
  const args = ctx.message.text.split(' ')
  if (args.length < 2) {
    await ctx.reply('❌ Недостаточно параметров')
    return
  }`

      if (!content.includes('args.length')) {
        fixedContent = fixedContent.replace(
          /(bot\.command\([^,]+,\s*async[^{]+\{)/,
          `$1\n${validationCode}`
        )
        
        fixes.push({
          type: 'telegraf',
          description: 'Add command parameter validation',
          filePath
        })
      }
    }

    return { content: fixedContent, fixes }
  }

  private applyMiddlewareSpecificFixes(content: string, filePath: string): { content: string, fixes: FixResult[] } {
    const fixes: FixResult[] = []
    let fixedContent = content

    // Исправляем middleware без await next()
    if (content.includes('next()') && !content.includes('await next()')) {
      fixedContent = fixedContent.replace(/\bnext\(\)/g, 'await next()')
      fixes.push({
        type: 'telegraf',
        description: 'Add await to next() calls in middleware',
        filePath
      })
    }

    return { content: fixedContent, fixes }
  }

  private extractSceneName(content: string): string | null {
    const match = content.match(/const\s+(\w+Scene)\s*=\s*new\s+Scenes/)
    return match ? match[1] : null
  }

  // Статический анализ для определения приоритета исправлений
  static analyzePriority(content: string): { 
    critical: number, 
    important: number, 
    minor: number 
  } {
    let critical = 0
    let important = 0
    let minor = 0

    // Критичные проблемы
    if (content.includes('ctx.reply(') && !content.includes('await ctx.reply(')) {
      critical += (content.match(/ctx\.reply\(/g) || []).length
    }
    
    if (content.includes('bot.action(') && !content.includes('async')) {
      critical += (content.match(/bot\.action\(/g) || []).length
    }

    // Важные проблемы
    if (content.includes('new Scenes.BaseScene(') && !content.includes('<MyContext>')) {
      important += (content.match(/new Scenes\.BaseScene\(/g) || []).length
    }

    // Мелкие проблемы
    if (content.includes('Context') && !content.includes('MyContext')) {
      minor += (content.match(/:\s*Context/g) || []).length
    }

    return { critical, important, minor }
  }
}