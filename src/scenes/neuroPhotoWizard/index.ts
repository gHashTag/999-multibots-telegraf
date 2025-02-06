import { ModelUrl, MyContext, UserModel } from '../../interfaces'
import {
  imageNeuroGenerationCost,
  sendInsufficientStarsMessage,
  sendBalanceMessage,
} from '@/price/helpers'
import { generateNeuroImage } from '@/services/generateNeuroImage'
import {
  getLatestUserModel,
  getReferalsCountAndUserData,
  getUserBalance,
} from '@/core/supabase'
import { mainMenu, sendPhotoDescriptionRequest } from '@/menu'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { WizardScene } from 'telegraf/scenes'
import { generateTextToImage } from '@/services/generateTextToImage'

const neuroPhotoConversationStep = async (ctx: MyContext) => {
  console.log('CASE: neuroPhotoConversation')
  const isRu = ctx.from?.language_code === 'ru'
  const userId = ctx.from?.id

  if (!userId) {
    await ctx.reply(
      isRu
        ? '❌ Ошибка идентификации пользователя'
        : '❌ User identification error'
    )
    return ctx.scene.leave()
  }

  const currentBalance = await getUserBalance(userId)

  if (currentBalance < imageNeuroGenerationCost) {
    await sendInsufficientStarsMessage(userId, currentBalance, isRu)
    return ctx.scene.leave()
  }

  await sendBalanceMessage(
    userId,
    currentBalance,
    imageNeuroGenerationCost,
    isRu
  )

  const userModel = await getLatestUserModel(userId)

  const telegram_id = ctx.from?.id?.toString() || ''
  const { count, subscription } = await getReferalsCountAndUserData(telegram_id)

  if (!userModel || !userModel.model_url) {
    await ctx.reply(
      isRu
        ? '❌ У вас нет обученных моделей.\n\nИспользуйте команду "🤖 Цифровое тело аватара", в главном меню, чтобы создать свою ИИ модель для генерации нейрофото в вашим лицом. '
        : "❌ You don't have any trained models.\n\nUse the '🤖  Digital avatar body' command in the main menu to create your AI model for generating neurophotos with your face.",
      {
        reply_markup: {
          keyboard: (
            await mainMenu({ isRu, inviteCount: count, subscription })
          ).reply_markup.keyboard,
        },
      }
    )

    return ctx.scene.leave()
  }

  ctx.session.userModel = userModel as UserModel
  ctx.session.mode = 'neuro_photo'

  await sendPhotoDescriptionRequest(ctx, isRu, 'neuro_photo')
  const isCancel = await handleHelpCancel(ctx)
  if (isCancel) {
    return ctx.scene.leave()
  }
  console.log('CASE: neuroPhotoConversation next')
  ctx.wizard.next() // Переход к следующему шагу
}

const neuroPhotoPromptStep = async (ctx: MyContext) => {
  console.log('CASE: neuroPhotoPromptStep')
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
        await generateNeuroImage(fullPrompt, model_url, 1, userId || 0, ctx)
        ctx.wizard.next()
      } else {
        await ctx.reply(isRu ? '❌ Некорректный промпт' : '❌ Invalid prompt')
        ctx.scene.leave()
      }
    }
  }
}

const neuroPhotoButtonStep = async (ctx: MyContext) => {
  console.log('CASE: neuroPhotoButtonStep')
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

    // Обработка кнопок с числами
    const numImages = parseInt(text[0])
    const prompt = ctx.session.prompt
    const userId = ctx.from?.id

    const generate = async (num: number) => {
      if (ctx.session.mode === 'neuro_photo') {
        await generateNeuroImage(
          prompt,
          ctx.session.userModel.model_url,
          num,
          userId,
          ctx
        )
      } else {
        await generateTextToImage(
          prompt,
          ctx.session.selectedModel || '',
          num,
          userId,
          isRu,
          ctx
        )
      }
    }

    if (numImages >= 1 && numImages <= 4) {
      await generate(numImages)
    } else {
      const { count, subscription } = await getReferalsCountAndUserData(
        ctx.from?.id?.toString() || ''
      )
      await mainMenu({ isRu, inviteCount: count, subscription })
    }
  }
}

export const neuroPhotoWizard = new WizardScene(
  'neuroPhotoWizard',
  neuroPhotoConversationStep,
  neuroPhotoPromptStep,
  neuroPhotoButtonStep
)
