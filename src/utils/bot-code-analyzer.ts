import { BotCodeIssue } from '../services/claude-integration.service'

export class BotCodeAnalyzer {
  analyzeFile(filePath: string, content: string): BotCodeIssue[] {
    const issues: BotCodeIssue[] = []
    const lines = content.split('\\n')

    // Определяем тип файла для специфичных проверок
    const isSceneFile =
      filePath.includes('/scenes/') || filePath.includes('Scene')
    const isCommandFile =
      filePath.includes('/commands/') || filePath.includes('Command')
    const isMiddlewareFile =
      filePath.includes('/middleware') || filePath.includes('Middleware')

    lines.forEach((line, index) => {
      const lineNumber = index + 1
      const trimmedLine = line.trim()

      // 1. Проверяем missing async в Telegraf handlers
      if (this.isTelegrafHandler(trimmedLine) && !this.hasAsync(trimmedLine)) {
        issues.push({
          type: 'missing_async',
          line: lineNumber,
          description: 'Telegraf handler should be async',
          severity: 'error',
        })
      }

      // 2. Проверяем missing await в ctx.reply()
      if (this.hasContextReply(trimmedLine) && !this.hasAwait(trimmedLine)) {
        issues.push({
          type: 'missing_await',
          line: lineNumber,
          description: 'ctx.reply() calls should use await',
          severity: 'error',
        })
      }

      // 3. Проверяем scene transitions
      if (
        isSceneFile &&
        this.hasSceneTransition(trimmedLine) &&
        !this.hasAwait(trimmedLine)
      ) {
        issues.push({
          type: 'scene_transition',
          line: lineNumber,
          description: 'Scene transitions should use await',
          severity: 'error',
        })
      }

      // 4. Проверяем context types
      if (this.needsContextType(trimmedLine) && !this.hasContextType(content)) {
        issues.push({
          type: 'context_type',
          line: lineNumber,
          description: 'Handler should use MyContext type',
          severity: 'warning',
        })
      }

      // 5. Проверяем error handling
      if (
        (isSceneFile || isCommandFile) &&
        this.hasApiCall(trimmedLine) &&
        !this.hasErrorHandling(lines, index)
      ) {
        issues.push({
          type: 'error_handling',
          line: lineNumber,
          description: 'Bot API calls should have error handling',
          severity: 'warning',
        })
      }
    })

    // Дополнительные проверки на уровне файла
    this.addFileSpecificIssues(filePath, content, issues)

    console.log(`🔍 [BotAnalyzer] Found ${issues.length} issues in ${filePath}`)
    return issues
  }

  private isTelegrafHandler(line: string): boolean {
    const patterns = [
      /\.(?:action|command|on|hears|use)\(/,
      /scene\.(?:enter|leave|action|command|on|hears)/,
      /wizard\.(?:action|command|on|hears)/,
    ]
    return patterns.some(pattern => pattern.test(line))
  }

  private hasAsync(line: string): boolean {
    return /\basync\b/.test(line)
  }

  private hasAwait(line: string): boolean {
    return /\bawait\b/.test(line)
  }

  private hasContextReply(line: string): boolean {
    return /ctx\.(?:reply|replyWithPhoto|replyWithVideo|replyWithDocument|editMessageText)/.test(
      line
    )
  }

  private hasSceneTransition(line: string): boolean {
    return /ctx\.scene\.(?:enter|leave|reenter)/.test(line)
  }

  private needsContextType(line: string): boolean {
    return this.isTelegrafHandler(line) && /\(\s*ctx\s*[,)]/.test(line)
  }

  private hasContextType(content: string): boolean {
    return /MyContext|Context</.test(content)
  }

  private hasApiCall(line: string): boolean {
    const apiCalls = [
      'ctx.reply',
      'ctx.telegram',
      'bot.telegram',
      'scene.enter',
      'ctx.scene.enter',
    ]
    return apiCalls.some(call => line.includes(call))
  }

  private hasErrorHandling(lines: string[], currentIndex: number): boolean {
    // Проверяем окружающие строки на наличие try-catch
    const searchStart = Math.max(0, currentIndex - 5)
    const searchEnd = Math.min(lines.length, currentIndex + 5)

    for (let i = searchStart; i < searchEnd; i++) {
      const line = lines[i].trim()
      if (line.includes('try {') || line.includes('catch')) {
        return true
      }
    }

    return false
  }

  private addFileSpecificIssues(
    filePath: string,
    content: string,
    issues: BotCodeIssue[]
  ): void {
    // Специфичные проверки для разных типов файлов

    if (filePath.includes('/scenes/')) {
      this.analyzeSceneFile(content, issues)
    }

    if (filePath.includes('/commands/')) {
      this.analyzeCommandFile(content, issues)
    }

    if (filePath.includes('/middleware')) {
      this.analyzeMiddlewareFile(content, issues)
    }
  }

  private analyzeSceneFile(content: string, issues: BotCodeIssue[]): void {
    // Проверяем правильность создания сцен
    if (
      content.includes('new Scenes.BaseScene') &&
      !content.includes('<MyContext>')
    ) {
      issues.push({
        type: 'context_type',
        line: 0,
        description: 'Scene should use BaseScene<MyContext>',
        severity: 'error',
      })
    }

    // Проверяем экспорт сцены
    if (!content.includes('export') || !content.includes('Scene')) {
      issues.push({
        type: 'scene_transition',
        line: 0,
        description: 'Scene file should export the scene',
        severity: 'warning',
      })
    }
  }

  private analyzeCommandFile(content: string, issues: BotCodeIssue[]): void {
    // Проверяем структуру команд
    if (!content.includes('async') && content.includes('bot.command')) {
      issues.push({
        type: 'missing_async',
        line: 0,
        description: 'Command handlers should be async',
        severity: 'error',
      })
    }
  }

  private analyzeMiddlewareFile(content: string, issues: BotCodeIssue[]): void {
    // Проверяем middleware patterns
    if (content.includes('next()') && !content.includes('await next()')) {
      issues.push({
        type: 'missing_await',
        line: 0,
        description: 'Middleware should await next()',
        severity: 'warning',
      })
    }
  }

  // Статические методы для быстрых проверок
  static isBotCode(filePath: string): boolean {
    const botPatterns = [
      '/bot/',
      '/scenes/',
      '/commands/',
      '/middleware/',
      'Scene',
      'Command',
      'Wizard',
      'Handler',
    ]
    return botPatterns.some(pattern => filePath.includes(pattern))
  }

  static getBotComplexity(content: string): 'low' | 'medium' | 'high' {
    const complexityMarkers = [
      content.match(/scene\\.(?:enter|leave|action)/g)?.length || 0,
      content.match(/ctx\\.(?:reply|telegram)/g)?.length || 0,
      content.match(/bot\\.(?:action|command|on|hears)/g)?.length || 0,
      content.match(/wizard\\./g)?.length || 0,
    ]

    const totalComplexity = complexityMarkers.reduce(
      (sum, count) => sum + count,
      0
    )

    if (totalComplexity < 3) return 'low'
    if (totalComplexity < 10) return 'medium'
    return 'high'
  }
}
