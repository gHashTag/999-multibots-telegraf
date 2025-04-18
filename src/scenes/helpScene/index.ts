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
} from '../levelQuestWizard/handlers'
import { mainMenu } from '@/menu'
import { isRussian } from '@/helpers'
import { getReferalsCountAndUserData } from '@/core/supabase'

// BaseScene for displaying help information
export const helpScene = new Scenes.BaseScene<MyContext>('helpScene')

/**
 * Handler for scene enter: shows help based on current mode
 */
export async function helpSceneEnterHandler(ctx: MyContext) {
  const mode = ctx.session.mode
  const isRu = isRussian(ctx)
  const telegram_id = ctx.from?.id?.toString() || ''
  try {
    const { count, subscription, level } = await getReferalsCountAndUserData(
      telegram_id
    )
    switch (mode) {
      case 'digital_avatar_body':
        await handleLevel1(ctx)
        break
      case 'neuro_photo':
        await handleLevel2(ctx)
        break
      case 'image_to_prompt':
        await handleLevel3(ctx)
        break
      case 'avatar_brain':
        await handleLevel4(ctx)
        break
      case 'chat_with_avatar':
        await handleLevel5(ctx)
        break
      case 'select_model':
        await handleLevel6(ctx)
        break
      case 'voice':
        await handleLevel7(ctx)
        break
      case 'text_to_speech':
        await handleLevel8(ctx)
        break
      case 'image_to_video':
        await handleLevel9(ctx)
        break
      case 'text_to_image':
        await handleLevel10(ctx)
        break
      case 'text_to_video':
        await handleLevel11(ctx)
        break
      case 'change_size':
        await handleLevel12(ctx)
        break
      case 'invite':
        await handleLevel13(ctx)
        break
      case 'help':
      default:
        return ctx.scene.enter('step0')
    }
    // After specific help, show main menu
    await mainMenu({ isRu, inviteCount: count, subscription, ctx, level })
  } catch (error) {
    console.error('Error in helpScene:', error)
    await ctx.reply('Произошла ошибка. Пожалуйста, попробуйте снова.')
  }
}

// Register the enter handler
helpScene.enter(helpSceneEnterHandler)