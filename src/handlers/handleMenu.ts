import { MyContext } from '@/interfaces'
import { levels } from '@/menu/mainMenu'
import { isRussian } from '@/helpers/language'
import { priceCommand } from '@/commands/priceCommand'
import { handleTechSupport } from '@/commands/handleTechSupport'
import { mainMenuButton } from '@/menu/mainMenu'
import { get100Command } from '@/commands'
import { getStatsCommand } from '@/commands/stats'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { CallbackQuery } from 'telegraf/types'

// Функция, которая обрабатывает логику сцены
export const handleMenu = async (ctx: MyContext) => {
  const callbackQuery = ctx.callbackQuery as CallbackQuery.DataQuery
  const action = callbackQuery?.data

  if (!action) {
    return
  }

  try {
    switch (action) {
      case 'payment':
        ctx.session.subscription = 'stars'
        await ctx.scene.enter(ModeEnum.PaymentScene)
        break
      case 'invite':
        await ctx.scene.enter(ModeEnum.InviteScene)
        break
      case 'help':
        await ctx.scene.enter(ModeEnum.HelpScene)
        break
      case 'main_menu':
        await ctx.scene.enter(ModeEnum.MainMenu)
        break
      case 'start':
        await ctx.scene.enter(ModeEnum.StartScene)
        break
      default:
        await ctx.scene.enter(ModeEnum.MainMenu)
        break
    }
  } catch (error) {
    console.error('Error in handleMenu:', error)
    await ctx.scene.enter(ModeEnum.MainMenu)
  }
}

export default handleMenu
