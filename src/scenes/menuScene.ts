import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { ModeEnum } from '@/price/helpers/modelsCost'

export const menuCommandStep = async (ctx: MyContext) => {
  await ctx.scene.enter(ModeEnum.MainMenu)
} 