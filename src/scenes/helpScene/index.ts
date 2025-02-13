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

export const helpScene = new Scenes.BaseScene<MyContext>('helpScene')

helpScene.enter(async ctx => {
  const mode = ctx.session.mode
  const isRu = isRussian(ctx)
  const telegram_id = ctx.from?.id?.toString() || ''
  const { count, subscription, level } = await getReferalsCountAndUserData(
    telegram_id
  )

  try {
    switch (mode) {
      case 'digital_avatar_body':
        await handleLevel1(ctx)
        await mainMenu({ isRu, inviteCount: count, subscription, ctx, level })
        break
      case 'neuro_photo':
        await handleLevel2(ctx)
        await mainMenu({ isRu, inviteCount: count, subscription, ctx, level })
        break
      case 'image_to_prompt':
        await handleLevel3(ctx)
        await mainMenu({ isRu, inviteCount: count, subscription, ctx, level })
        break
      case 'avatar_brain':
        await handleLevel4(ctx)
        await mainMenu({ isRu, inviteCount: count, subscription, ctx, level })
        break
      case 'chat_with_avatar':
        await handleLevel5(ctx)
        await mainMenu({ isRu, inviteCount: count, subscription, ctx, level })
        break
      case 'select_model':
        await handleLevel6(ctx)
        await mainMenu({ isRu, inviteCount: count, subscription, ctx, level })
        break
      case 'voice':
        await handleLevel7(ctx)
        await mainMenu({ isRu, inviteCount: count, subscription, ctx, level })
        break
      case 'text_to_speech':
        await handleLevel8(ctx)
        await mainMenu({ isRu, inviteCount: count, subscription, ctx, level })
        break
      case 'image_to_video':
        await handleLevel9(ctx)
        await mainMenu({ isRu, inviteCount: count, subscription, ctx, level })
        break
      case 'text_to_image':
        await handleLevel10(ctx)
        await mainMenu({ isRu, inviteCount: count, subscription, ctx, level })
        break
      case 'text_to_video':
        await handleLevel11(ctx)
        await mainMenu({ isRu, inviteCount: count, subscription, ctx, level })
        break
      case 'change_size':
        await handleLevel12(ctx)
        await mainMenu({ isRu, inviteCount: count, subscription, ctx, level })
        break
      case 'invite':
        await handleLevel13(ctx)
        await mainMenu({ isRu, inviteCount: count, subscription, ctx, level })
        break
      case 'help':
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
