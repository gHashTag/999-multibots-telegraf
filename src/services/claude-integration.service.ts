import { FixResult } from '../webhooks/github-autofixer.service'

export interface BotCodeIssue {
  type: 'missing_async' | 'missing_await' | 'scene_transition' | 'context_type' | 'error_handling'
  line: number
  description: string
  severity: 'error' | 'warning' | 'info'
}

export interface ClaudeAnalysisRequest {
  filePath: string
  content: string
  patch: string
  knownIssues: BotCodeIssue[]
}

export class ClaudeIntegrationService {
  private readonly claudeApiKey: string

  constructor() {
    this.claudeApiKey = process.env.CLAUDE_API_KEY || ''
  }

  async analyzeBotCode(request: ClaudeAnalysisRequest): Promise<FixResult[]> {
    if (!this.claudeApiKey) {
      console.warn('⚠️ [Claude] API key not configured, skipping analysis')
      return []
    }

    try {
      const prompt = this.buildBotSpecificPrompt(request)

      console.log(`🧠 [Claude] Analyzing ${request.filePath}...`)

      // Здесь будет реальная интеграция с Claude API
      // Пока возвращаем моковые результаты на основе известных проблем
      const fixes = this.generateMockFixes(request)

      console.log(`✅ [Claude] Found ${fixes.length} fixes for ${request.filePath}`)
      return fixes

    } catch (error) {
      console.error('❌ [Claude] Analysis error:', error)
      return []
    }
  }

  async applyFixes(content: string, fixes: FixResult[]): Promise<string> {
    let fixedContent = content

    // Применяем исправления по типам
    for (const fix of fixes) {
      switch (fix.type) {
        case 'async':
          fixedContent = this.fixAsyncAwait(fixedContent, fix)
          break
        case 'telegraf':
          fixedContent = this.fixTelegrafIssues(fixedContent, fix)
          break
        case 'scene':
          fixedContent = this.fixSceneIssues(fixedContent, fix)
          break
        case 'typescript':
          fixedContent = this.fixTypeScriptIssues(fixedContent, fix)
          break
        case 'eslint':
          fixedContent = this.fixESLintIssues(fixedContent, fix)
          break
      }
    }

    return fixedContent
  }

  private buildBotSpecificPrompt(request: ClaudeAnalysisRequest): string {
    return `
Analyze this Telegram Bot code and suggest fixes for common Bot-specific issues:

File: ${request.filePath}
Known Issues: ${JSON.stringify(request.knownIssues, null, 2)}

Code:
\`\`\`typescript
${request.content}
\`\`\`

Git Patch:
\`\`\`diff
${request.patch}
\`\`\`

Focus on these Bot-specific patterns:

1. **Telegraf Async/Await Issues**:
   - Missing async/await in scene handlers
   - Missing async/await in bot.action() callbacks
   - Missing async/await in ctx.reply() calls

2. **Scene Management**:
   - Proper scene.enter() with async/await
   - Correct scene transitions with ctx.scene.enter()
   - Missing error handling in wizards

3. **Context Types**:
   - Proper MyContext type usage
   - Missing types for scene context
   - Incorrect Telegraf imports

4. **Bot API Patterns**:
   - Using ctx.reply() instead of deprecated methods
   - Proper error handling for API calls
   - Correct middleware order

5. **Common TypeScript Issues**:
   - Missing imports
   - Type assertion issues
   - Interface implementations

Return only fixes that are specific to Telegram Bot development with Telegraf framework.
`
  }

  private generateMockFixes(request: ClaudeAnalysisRequest): FixResult[] {
    const fixes: FixResult[] = []

    // Анализируем на основе известных проблем
    for (const issue of request.knownIssues) {
      switch (issue.type) {
        case 'missing_async':
          fixes.push({
            type: 'async',
            description: 'Add missing async/await to Telegraf handler',
            filePath: request.filePath,
            lineNumber: issue.line
          })
          break
          
        case 'scene_transition':
          fixes.push({
            type: 'scene',
            description: 'Fix scene transition with proper async handling',
            filePath: request.filePath,
            lineNumber: issue.line
          })
          break
          
        case 'context_type':
          fixes.push({
            type: 'typescript',
            description: 'Add proper MyContext type to handler',
            filePath: request.filePath,
            lineNumber: issue.line
          })
          break
          
        case 'error_handling':
          fixes.push({
            type: 'telegraf',
            description: 'Add try-catch block for Bot API calls',
            filePath: request.filePath,
            lineNumber: issue.line
          })
          break
      }
    }

    // Дополнительные проверки на основе содержимого
    const content = request.content.toLowerCase()

    if (content.includes('.action(') && !content.includes('async')) {
      fixes.push({
        type: 'async',
        description: 'Add async keyword to bot.action handler',
        filePath: request.filePath
      })
    }

    if (content.includes('ctx.reply(') && !content.includes('await')) {
      fixes.push({
        type: 'async',
        description: 'Add await to ctx.reply() calls',
        filePath: request.filePath
      })
    }

    if (content.includes('scene.enter') && !content.includes('async')) {
      fixes.push({
        type: 'scene',
        description: 'Add async to scene.enter handler',
        filePath: request.filePath
      })
    }

    return fixes
  }

  private fixAsyncAwait(content: string, fix: FixResult): string {
    // Простые regex замены для async/await
    let fixedContent = content

    // Добавляем async к обработчикам
    fixedContent = fixedContent.replace(
      /(\\.(?:action|command|on|hears)\\([^)]+\\),\\s*)(\\w+\\s*=>)/g,
      '$1async $2'
    )

    // Добавляем await к ctx.reply
    fixedContent = fixedContent.replace(
      /(ctx\\.reply\\([^)]+\\))/g,
      'await $1'
    )

    return fixedContent
  }

  private fixTelegrafIssues(content: string, fix: FixResult): string {
    let fixedContent = content

    // Добавляем обработку ошибок
    if (!fixedContent.includes('try {')) {
      fixedContent = fixedContent.replace(
        /(async \\([^)]+\\) => \\{)/g,
        '$1\n  try {'
      )
      fixedContent = fixedContent.replace(
        /(\\}\\s*)$/,
        '  } catch (error) {\n    console.error("Bot error:", error)\n    await ctx.reply("Произошла ошибка. Попробуйте позже.")\n  }\n$1'
      )
    }

    return fixedContent
  }

  private fixSceneIssues(content: string, fix: FixResult): string {
    let fixedContent = content

    // Добавляем правильные типы для сцен
    fixedContent = fixedContent.replace(
      /new Scenes\\.BaseScene\\('([^']+)'\\)/g,
      "new Scenes.BaseScene<MyContext>('$1')"
    )

    return fixedContent
  }

  private fixTypeScriptIssues(content: string, fix: FixResult): string {
    let fixedContent = content

    // Добавляем недостающие импорты
    if (!fixedContent.includes("import { MyContext }") && fixedContent.includes('MyContext')) {
      fixedContent = `import { MyContext } from '../interfaces'\n` + fixedContent
    }

    return fixedContent
  }

  private fixESLintIssues(content: string, fix: FixResult): string {
    let fixedContent = content

    // Удаляем неиспользуемые переменные (простые случаи)
    fixedContent = fixedContent.replace(/const \\w+ = [^\\n]+\\n(?!.*\\1)/g, '')

    return fixedContent
  }
}