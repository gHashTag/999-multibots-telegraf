import { Telegraf, Context } from 'telegraf'
import { MyContext } from '../../interfaces'
import {
  handleLevel1,
  handleLevel2,
  handleLevel3,
  handleLevel4,
  handleLevel5,
  handleLevel6,
  handleLevel7,
  handleLevel8,
  handleLevel9,
  handleLevel10,
  handleLevel11,
  handleQuestComplete,
} from '../../scenes/levelQuestWizard/handlers'
import { Update } from 'telegraf/typings/core/types/typegram'

// Создаем обертку для обработчиков
const wrapHandler = (handler: (ctx: MyContext) => Promise<void>) => {
  return async (ctx: Context<Update>) => {
    try {
      await handler(ctx as MyContext)
    } catch (error) {
      console.error('Error in level handler:', error)
      await ctx.reply('Произошла ошибка при обработке команды')
    }
  }
}

export function setupLevelHandlers(bot: Telegraf<MyContext>) {
  // Регистрируем обработчики с обертками
  bot.action('level_1', wrapHandler(handleLevel1))
  bot.action('level_2', wrapHandler(handleLevel2))
  bot.action('level_3', wrapHandler(handleLevel3))
  bot.action('level_4', wrapHandler(handleLevel4))
  bot.action('level_5', wrapHandler(handleLevel5))
  bot.action('level_6', wrapHandler(handleLevel6))
  bot.action('level_7', wrapHandler(handleLevel7))
  bot.action('level_8', wrapHandler(handleLevel8))
  bot.action('level_9', wrapHandler(handleLevel9))
  bot.action('level_10', wrapHandler(handleLevel10))
  bot.action('level_11', wrapHandler(handleLevel11))
  bot.action('level_complete', wrapHandler(handleQuestComplete))
}
