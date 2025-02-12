import { ModelUrl, UserModel } from '../../interfaces'

import { generateNeuroImage } from '@/services/generateNeuroImage'
import {
  getLatestUserModel,
  getReferalsCountAndUserData,
} from '@/core/supabase'
import {
  levels,
  mainMenu,
  sendGenericErrorMessage,
  sendPhotoDescriptionRequest,
} from '@/menu'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { WizardScene } from 'telegraf/scenes'
import { generateTextToImage } from '@/services/generateTextToImage'

import { MyWizardContext } from '@/interfaces'
import { getUserInfo } from '@/handlers/getUserInfo'
import { handleMenu } from '@/handlers'

const neuroPhotoConversationStep = async (ctx: MyWizardContext) => {
  const isRu = ctx.from?.language_code === 'ru'
  try {
    console.log('CASE 1: neuroPhotoConversation')

    const { userId, telegramId } = getUserInfo(ctx)
    const userModel = await getLatestUserModel(userId)

    const { count, subscription } = await getReferalsCountAndUserData(
      telegramId
    )

    if (!userModel || !userModel.model_url) {
      await ctx.reply(
        isRu
          ? '❌ У вас нет обученных моделей.\n\nИспользуйте команду "🤖 Цифровое тело аватара", в главном меню, чтобы создать свою ИИ модель для генерации нейрофото в вашим лицом. '
          : "❌ You don't have any trained models.\n\nUse the '🤖  Digital avatar body' command in the main menu to create your AI model for generating neurophotos with your face.",
        {
          reply_markup: {
            keyboard: (
              await mainMenu({ isRu, inviteCount: count, subscription, ctx })
            ).reply_markup.keyboard,
          },
        }
      )

      return ctx.scene.leave()
    }

    ctx.session.userModel = userModel as UserModel

    await sendPhotoDescriptionRequest(ctx, isRu, 'neuro_photo')
    const isCancel = await handleHelpCancel(ctx)
    console.log('isCancel', isCancel)
    if (isCancel) {
      return ctx.scene.leave()
    }
    console.log('CASE: neuroPhotoConversation next')

    return ctx.wizard.next()
  } catch (error) {
    console.error('Error in neuroPhotoConversationStep:', error)
    await sendGenericErrorMessage(ctx, isRu, error)
    throw error
  }
}

const neuroPhotoPromptStep = async (ctx: MyWizardContext) => {
  console.log('CASE 2: neuroPhotoPromptStep')
  const isRu = ctx.from?.language_code === 'ru'
  const promptMsg = ctx.message
  console.log(promptMsg, 'promptMsg')

  if (promptMsg && 'text' in promptMsg) {
    const promptText = promptMsg.text

    const isCancel = await handleHelpCancel(ctx)

    if (isCancel) {
      return ctx.scene.leave()
    } else {
      ctx.session.prompt = promptText
      const model_url = ctx.session.userModel.model_url as ModelUrl
      const trigger_word = ctx.session.userModel.trigger_word as string

      const userId = ctx.from?.id

      if (model_url && trigger_word) {
        const fullPrompt = `Fashionable ${trigger_word}, ${promptText}`
        await generateNeuroImage(
          fullPrompt,
          model_url,
          1,
          userId || 0,
          ctx,
          ctx.botInfo?.username
        )
        ctx.wizard.next()
        return
      } else {
        await ctx.reply(isRu ? '❌ Некорректный промпт' : '❌ Invalid prompt')
        ctx.scene.leave()
      }
    }
  }
}

const neuroPhotoButtonStep = async (ctx: MyWizardContext) => {
  console.log('CASE 3: neuroPhotoButtonStep')
  if (ctx.message && 'text' in ctx.message) {
    const text = ctx.message.text
    console.log(`CASE: Нажата кнопка ${text}`)
    const isRu = ctx.from?.language_code === 'ru'

    // Обработка кнопок "Улучшить промпт" и "Изменить размер"
    if (text === '⬆️ Улучшить промпт' || text === '⬆️ Improve prompt') {
      console.log('CASE: Улучшить промпт')
      await ctx.scene.enter('improvePromptWizard')
      return
    }

    if (text === '📐 Изменить размер' || text === '📐 Change size') {
      console.log('CASE: Изменить размер')
      await ctx.scene.enter('sizeWizard')
      return
    }

    if (text === levels[104].title_ru || text === levels[104].title_en) {
      console.log('CASE: Главное меню')
      await handleMenu(ctx)
      return
    }

    // await handleMenu(ctx)

    // Обработка кнопок с числами
    const numImages = parseInt(text[0])
    const prompt = ctx.session.prompt
    const userId = ctx.from?.id

    const generate = async (num: number) => {
      await generateNeuroImage(
        prompt,
        ctx.session.userModel.model_url,
        num,
        userId,
        ctx,
        ctx.botInfo?.username
      )
    }

    if (numImages >= 1 && numImages <= 4) {
      await generate(numImages)
    } else {
      const { count, subscription } = await getReferalsCountAndUserData(
        ctx.from?.id?.toString() || ''
      )
      await mainMenu({ isRu, inviteCount: count, subscription, ctx })
    }
  }
}

export const neuroPhotoWizard = new WizardScene<MyWizardContext>(
  'neuro_photo',
  neuroPhotoConversationStep,
  neuroPhotoPromptStep,
  neuroPhotoButtonStep
)
