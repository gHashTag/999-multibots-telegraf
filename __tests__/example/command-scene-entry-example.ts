import { Telegraf } from 'telegraf'
import type { SceneContext, SceneSessionData } from 'telegraf/typings/scenes'

// Определяем интерфейс локально для примера
interface MyExampleContext extends Context {
  scene: SceneContext<SceneSessionData>
}

// ID сцены для примера (в реальном коде это был бы Enum)
const TARGET_SCENE_ID = 'TARGET_SCENE'

/**
 * Минимальный пример регистрации команды, которая входит в сцену.
 */
export function registerExampleCommand(bot: Telegraf<MyExampleContext>) {
  bot.command('example', async ctx => {
    try {
      // Логика, аналогичная реальной команде /start или другой
      console.log('Leaving current scene (if any)...')
      await ctx.scene.leave() // Сначала выходим из текущей сцены

      console.log(`Entering scene: ${TARGET_SCENE_ID}`)
      await ctx.scene.enter(TARGET_SCENE_ID)

      // Здесь могла бы быть логика сброса сессии, но для примера это не нужно
      // ctx.session = defaultSession;
    } catch (error) {
      console.error('Error in example command:', error)
      // В реальном коде здесь был бы вызов ctx.reply или логгера
    }
  })
}
