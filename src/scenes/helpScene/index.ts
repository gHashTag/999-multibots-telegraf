import { Scenes } from 'telegraf'
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
  handleLevel12,
  handleLevel13,
} from '../../scenes/levelQuestWizard/handlers'
import { mainMenu } from '@/menu'
import { isRussian } from '@/helpers'
import { getReferalsCountAndUserData } from '@/core/supabase'
import { ModeEnum } from '@/price/helpers/modelsCost'

export const helpScene = new Scenes.BaseScene<MyContext>('helpScene')

helpScene.enter(async ctx => {
  const mode = ctx.session.mode
  const isRu = isRussian(ctx)
  const telegram_id = ctx.from?.id?.toString() || ''
  const { count, subscription, level } =
    await getReferalsCountAndUserData(telegram_id)
  const newSub = subscription || 'stars'

  try {
    switch (mode) {
      case ModeEnum.DigitalAvatarBody:
        await handleLevel1(ctx)
        await mainMenu({
          isRu,
          inviteCount: count,
          subscription: newSub,
          ctx,
          level,
        })
        break
      case ModeEnum.DigitalAvatarBodyV2:
        await handleLevel1(ctx)
        await mainMenu({
          isRu,
          inviteCount: count,
          subscription: newSub,
          ctx,
          level,
        })
        break
      case ModeEnum.NeuroPhoto:
        await handleLevel2(ctx)
        await mainMenu({
          isRu,
          inviteCount: count,
          subscription: newSub,
          ctx,
          level,
        })
        break
      case ModeEnum.ImageToPrompt:
        await handleLevel3(ctx)
        await mainMenu({
          isRu,
          inviteCount: count,
          subscription: newSub,
          ctx,
          level,
        })
        break
      case ModeEnum.Avatar:
        await handleLevel4(ctx)
        await mainMenu({
          isRu,
          inviteCount: count,
          subscription: newSub,
          ctx,
          level,
        })
        break
      case ModeEnum.ChatWithAvatar:
        await handleLevel5(ctx)
        await mainMenu({
          isRu,
          inviteCount: count,
          subscription: newSub,
          ctx,
          level,
        })
        break
      case ModeEnum.SelectModel:
        await handleLevel6(ctx)
        await mainMenu({
          isRu,
          inviteCount: count,
          subscription: newSub,
          ctx,
          level,
        })
        break
      case ModeEnum.Voice:
        await handleLevel7(ctx)
        await mainMenu({
          isRu,
          inviteCount: count,
          subscription: newSub,
          ctx,
          level,
        })
        break
      case ModeEnum.TextToSpeech:
        await handleLevel8(ctx)
        await mainMenu({
          isRu,
          inviteCount: count,
          subscription: newSub,
          ctx,
          level,
        })
        break
      case ModeEnum.ImageToVideo:
        await handleLevel9(ctx)
        await mainMenu({
          isRu,
          inviteCount: count,
          subscription: newSub,
          ctx,
          level,
        })
        break
      case ModeEnum.TextToImage:
        await handleLevel10(ctx)
        await mainMenu({
          isRu,
          inviteCount: count,
          subscription: newSub,
          ctx,
          level,
        })
        break
      case ModeEnum.TextToVideo:
        await handleLevel11(ctx)
        await mainMenu({
          isRu,
          inviteCount: count,
          subscription: newSub,
          ctx,
          level,
        })
        break
      case ModeEnum.ChangeSize:
        await handleLevel12(ctx)
        await mainMenu({
          isRu,
          inviteCount: count,
          subscription: newSub,
          ctx,
          level,
        })
        break
      case ModeEnum.Invite:
        await handleLevel13(ctx)
        await mainMenu({
          isRu,
          inviteCount: count,
          subscription: newSub,
          ctx,
          level,
        })
        break
      case ModeEnum.Help:
        ctx.scene.enter('step0')
        break
      default:
        ctx.scene.enter('step0')
        break
    }
  } catch (error) {
    console.error('Error in helpScene:', error)
    await ctx.reply('Произошла ошибка. Пожалуйста, попробуйте снова.')
  }
})
