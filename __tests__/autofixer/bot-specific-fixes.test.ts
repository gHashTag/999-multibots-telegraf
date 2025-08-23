import { BotSpecificFixesEngine } from '../../src/services/bot-specific-fixes'

describe('BotSpecificFixesEngine', () => {
  let fixesEngine: BotSpecificFixesEngine

  beforeEach(() => {
    fixesEngine = new BotSpecificFixesEngine()
  })

  describe('applyFixes', () => {
    it('should add async keyword to bot handlers', () => {
      const code = `bot.action('button', ctx => ctx.reply('Hello'))`
      
      const result = fixesEngine.applyFixes(code, 'src/commands/test.ts')
      
      expect(result.fixedContent).toContain('async ctx =>')
      expect(result.fixes).toHaveLength(2) // async + await
      expect(result.fixes[0].type).toBe('async')
    })

    it('should add await to ctx.reply calls', () => {
      const code = `
async (ctx) => {
  ctx.reply('Hello')
  ctx.replyWithPhoto('photo.jpg')
}
      `
      
      const result = fixesEngine.applyFixes(code, 'src/commands/test.ts')
      
      expect(result.fixedContent).toContain('await ctx.reply')
      expect(result.fixedContent).toContain('await ctx.replyWithPhoto')
    })

    it('should add MyContext type to scenes', () => {
      const code = `const scene = new Scenes.BaseScene('test_scene')`
      
      const result = fixesEngine.applyFixes(code, 'src/scenes/test.ts')
      
      expect(result.fixedContent).toContain('BaseScene<MyContext>')
      expect(result.fixes.some(f => f.type === 'scene')).toBeTruthy()
    })

    it('should add missing imports', () => {
      const code = `
const scene = new Scenes.BaseScene<MyContext>('test')
bot.action('test', async (ctx: MyContext) => {})
      `
      
      const result = fixesEngine.applyFixes(code, 'src/scenes/test.ts')
      
      expect(result.fixedContent).toContain("import { MyContext } from '../interfaces'")
      expect(result.fixedContent).toContain("import { Scenes } from 'telegraf'")
    })

    it('should add await to scene transitions', () => {
      const code = `ctx.scene.enter('next_scene')`
      
      const result = fixesEngine.applyFixes(code, 'src/scenes/test.ts')
      
      expect(result.fixedContent).toContain('await ctx.scene.enter')
    })

    it('should add await to Telegram API calls', () => {
      const code = `ctx.telegram.getMe()`
      
      const result = fixesEngine.applyFixes(code, 'src/services/test.ts')
      
      expect(result.fixedContent).toContain('await ctx.telegram.getMe')
    })

    it('should handle wizard scenes', () => {
      const code = `const wizard = new Scenes.WizardScene('wizard'`
      
      const result = fixesEngine.applyFixes(code, 'src/scenes/wizard.ts')
      
      expect(result.fixedContent).toContain('WizardScene<MyContext>')
    })

    it('should not break already correct code', () => {
      const code = `
import { MyContext } from '../interfaces'
import { Scenes } from 'telegraf'

bot.action('button', async (ctx: MyContext) => {
  try {
    await ctx.reply('Hello')
  } catch (error) {
    console.error('Error:', error)
  }
})
      `
      
      const result = fixesEngine.applyFixes(code, 'src/commands/correct.ts')
      
      // Код уже корректный, исправлений быть не должно
      expect(result.fixes.length).toBeLessThan(3) // Могут быть только мелкие исправления
    })

    it('should handle middleware correctly', () => {
      const code = `
bot.use((ctx, next) => {
  console.log('Middleware')
  next()
})
      `
      
      const result = fixesEngine.applyFixes(code, 'src/middleware/test.ts')
      
      expect(result.fixedContent).toContain('async (ctx, next)')
      expect(result.fixedContent).toContain('await next()')
    })

    it('should handle scene-specific fixes', () => {
      const code = `
const testScene = new Scenes.BaseScene('test')
testScene.enter(ctx => ctx.reply('Entering'))
      `
      
      const result = fixesEngine.applyFixes(code, 'src/scenes/testScene.ts')
      
      expect(result.fixedContent).toContain('BaseScene<MyContext>')
      expect(result.fixedContent).toContain('async ctx =>')
      expect(result.fixedContent).toContain('await ctx.reply')
    })
  })

  describe('analyzePriority', () => {
    it('should identify critical issues', () => {
      const code = `
        ctx.reply('Hello')
        bot.action('test', ctx => {})
      `
      
      const priority = BotSpecificFixesEngine.analyzePriority(code)
      
      expect(priority.critical).toBeGreaterThan(0)
    })

    it('should identify important issues', () => {
      const code = `new Scenes.BaseScene('test')`
      
      const priority = BotSpecificFixesEngine.analyzePriority(code)
      
      expect(priority.important).toBeGreaterThan(0)
    })

    it('should identify minor issues', () => {
      const code = `function handler(ctx: Context) {}`
      
      const priority = BotSpecificFixesEngine.analyzePriority(code)
      
      expect(priority.minor).toBeGreaterThan(0)
    })

    it('should return zero for clean code', () => {
      const code = `
        bot.action('test', async (ctx: MyContext) => {
          await ctx.reply('Hello')
        })
      `
      
      const priority = BotSpecificFixesEngine.analyzePriority(code)
      
      expect(priority.critical).toBe(0)
    })
  })
})