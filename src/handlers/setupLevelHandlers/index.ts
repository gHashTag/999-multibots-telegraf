import { Telegraf } from 'telegraf'
import { MyContext } from '@/types'
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
} from '@/scenes/levelQuestWizard/handlers'

export function setupLevelHandlers(bot: Telegraf<MyContext>) {
  // Приводим типы обработчиков к нужному типу
  const handlers = {
    level_1: handleLevel1,
    level_2: handleLevel2,
    level_3: handleLevel3,
    level_4: handleLevel4,
    level_5: handleLevel5,
    level_6: handleLevel6,
    level_7: handleLevel7,
    level_8: handleLevel8,
    level_9: handleLevel9,
    level_10: handleLevel10,
    level_11: handleLevel11,
    level_complete: handleQuestComplete,
  } as const

  // Регистрируем обработчики
  Object.entries(handlers).forEach(([action, handler]) => {
    bot.action(action, ctx => handler(ctx as MyContext))
  })
}
