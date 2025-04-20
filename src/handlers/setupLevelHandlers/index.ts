import { Telegraf } from 'telegraf'
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
import { ModeEnum } from '@/interfaces/modes'

export function setupLevelHandlers(bot: Telegraf<MyContext>) {
  bot.action('level_1', handleLevel1)
  bot.action('level_2', handleLevel2)
  bot.action('level_3', handleLevel3)
  bot.action('level_4', handleLevel4)
  bot.action('level_5', handleLevel5)
  bot.action('level_6', handleLevel6)
  bot.action('level_7', handleLevel7)
  bot.action('level_8', handleLevel8)
  bot.action('level_9', handleLevel9)
  bot.action('level_10', handleLevel10)
  bot.action('level_11', handleLevel11)
  bot.action('level_complete', handleQuestComplete)

  // --- Добавляем обработчики для кнопок из startScene ---
  bot.action('go_subscribe', async ctx => {
    await ctx.answerCbQuery() // Отвечаем на callback_query, чтобы убрать "часики"
    await ctx.scene.enter(ModeEnum.SubscriptionScene)
  })

  bot.action('go_help', async ctx => {
    await ctx.answerCbQuery()
    await ctx.scene.enter('helpScene')
  })
  // --- Конец добавленных обработчиков ---
}
