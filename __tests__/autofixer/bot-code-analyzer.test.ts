import { BotCodeAnalyzer } from '../../src/utils/bot-code-analyzer'

describe('BotCodeAnalyzer', () => {
  let analyzer: BotCodeAnalyzer

  beforeEach(() => {
    analyzer = new BotCodeAnalyzer()
  })

  describe('analyzeFile', () => {
    it('should detect missing async in Telegraf handlers', () => {
      const code = `
bot.action('button', ctx => ctx.reply('Hello'))
bot.command('start', ctx => {
  ctx.reply('Welcome')
})
      `
      
      const issues = analyzer.analyzeFile('src/commands/test.ts', code)
      
      expect(issues).toHaveLength(2)
      expect(issues[0].type).toBe('missing_async')
      expect(issues[0].description).toBe('Telegraf handler should be async')
      expect(issues[1].type).toBe('missing_async')
    })

    it('should detect missing await in ctx.reply calls', () => {
      const code = `
bot.action('button', async (ctx) => {
  ctx.reply('Hello')
  ctx.replyWithPhoto('photo.jpg')
})
      `
      
      const issues = analyzer.analyzeFile('src/commands/test.ts', code)
      
      expect(issues.some(issue => issue.type === 'missing_await')).toBeTruthy()
      expect(issues.some(issue => issue.description === 'ctx.reply() calls should use await')).toBeTruthy()
    })

    it('should detect scene transition issues', () => {
      const code = `
scene.enter(ctx => {
  ctx.scene.enter('next_scene')
})
      `
      
      const issues = analyzer.analyzeFile('src/scenes/testScene.ts', code)
      
      expect(issues.some(issue => issue.type === 'scene_transition')).toBeTruthy()
    })

    it('should detect missing context types', () => {
      const code = `
bot.command('test', (ctx) => {
  // handler code
})
      `
      
      const issues = analyzer.analyzeFile('src/commands/test.ts', code)
      
      expect(issues.some(issue => issue.type === 'context_type')).toBeTruthy()
    })

    it('should detect missing error handling', () => {
      const code = `
bot.command('api_call', async (ctx) => {
  const result = await fetch('/api/data')
  ctx.reply(result.data)
})
      `
      
      const issues = analyzer.analyzeFile('src/commands/api.ts', code)
      
      expect(issues.some(issue => issue.type === 'error_handling')).toBeTruthy()
    })

    it('should handle empty files', () => {
      const issues = analyzer.analyzeFile('src/empty.ts', '')
      expect(issues).toHaveLength(0)
    })

    it('should handle files with correct patterns', () => {
      const code = `
bot.action('button', async (ctx) => {
  try {
    await ctx.reply('Hello')
  } catch (error) {
    console.error('Error:', error)
  }
})
      `
      
      const issues = analyzer.analyzeFile('src/commands/correct.ts', code)
      expect(issues).toHaveLength(0)
    })
  })

  describe('static methods', () => {
    it('should identify bot code files', () => {
      expect(BotCodeAnalyzer.isBotCode('src/scenes/testScene.ts')).toBeTruthy()
      expect(BotCodeAnalyzer.isBotCode('src/commands/testCommand.ts')).toBeTruthy()
      expect(BotCodeAnalyzer.isBotCode('src/middleware/auth.ts')).toBeTruthy()
      expect(BotCodeAnalyzer.isBotCode('src/utils/helper.ts')).toBeFalsy()
    })

    it('should calculate bot complexity', () => {
      const simpleCode = `bot.command('start', async (ctx) => ctx.reply('Hello'))`
      const complexCode = `
        scene.enter(async (ctx) => await ctx.reply('Enter'))
        scene.action('btn1', async (ctx) => await ctx.reply('Btn1'))
        scene.action('btn2', async (ctx) => await ctx.reply('Btn2'))
        wizard.step(0, async (ctx) => await ctx.reply('Step 1'))
        wizard.step(1, async (ctx) => await ctx.reply('Step 2'))
      `

      expect(BotCodeAnalyzer.getBotComplexity(simpleCode)).toBe('low')
      expect(BotCodeAnalyzer.getBotComplexity(complexCode)).toBe('medium')
    })
  })
})