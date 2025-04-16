/**
 * ⚠️⚠️⚠️ ВНИМАНИЕ! ⚠️⚠️⚠️
 *
 * Этот файл реализует сцену NeuroPhoto V1 (Flux)!
 *
 * Его нельзя путать со сценой NeuroPhoto V2 (Flux Pro).
 * Файл содержит логику генерации нейрофото с использованием
 * Replicate API для версии Flux.
 */

import { ModelUrl, UserModel } from '@/interfaces'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { generateNeuroImage } from '@/services/generateNeuroImage'
import {
  getLatestUserModel,
  getReferalsCountAndUserData,
} from '@/core/supabase'
import { mainMenuButton, mainMenu } from '@/menu'
import { sendGenericErrorMessage, sendPhotoDescriptionRequest } from '@/menu'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { WizardScene } from 'telegraf/scenes'
import { ModeEnum } from '@/interfaces/modes'
import { MyContext } from '@/interfaces'
import { getUserInfo } from '@/handlers/getUserInfo'
import { handleMenu } from '@/handlers'

import { logger } from '@/utils/logger'

const neuroPhotoConversationStep = async (ctx: MyContext) => {
  const isRu = ctx.from?.language_code === 'ru'
  try {
    console.log('CASE 1: neuroPhotoConversation')

    logger.info({
      message: '🚀 ЗАПУСК neuroPhotoWizard (v1)',
      description: 'Starting neuroPhotoWizard (v1)',
      telegram_id: ctx.from?.id,
      session_data: {
        mode: ctx.session.mode,
        user_model: ctx.session.userModel ? 'exists' : 'not exists',
      },
    })

    const { telegramId } = getUserInfo(ctx)
    if (!telegramId) {
      await ctx.reply(
        isRu
          ? 'Произошла ошибка при обработке вашего профиля 😔'
          : 'An error occurred while processing your profile 😔'
      )
      return ctx.scene.leave()
    }
    const userModel = await getLatestUserModel(telegramId, 'replicate')

    const { count, subscription, level } =
      await getReferalsCountAndUserData(telegramId)

    if (!userModel || !userModel.model_url) {
      await ctx.reply(
        isRu
          ? '❌ У вас нет обученных моделей.\n\nИспользуйте команду "🤖 Цифровое тело аватара", в главном меню, чтобы создать свою ИИ модель для генерации нейрофото в вашим лицом. '
          : "❌ You don't have any trained models.\n\nUse the '🤖  Digital avatar body' command in the main menu to create your AI model for generating neurophotos with your face.",
        {
          reply_markup: {
            keyboard: (
              await mainMenu({
                isRu,
                inviteCount: count,
                subscription:
                  subscription?.type || SubscriptionType.NEUROTESTER,
                ctx,
                level,
              })
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
    ctx.wizard.next()
    return
  } catch (error) {
    console.error('Error in neuroPhotoConversationStep:', error)
    await sendGenericErrorMessage(ctx, isRu, error as Error)
    throw error
  }
}

const neuroPhotoPromptStep = async (ctx: MyContext) => {
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

      const telegramId = ctx.from?.id.toString()
      if (!telegramId) {
        await ctx.reply(
          isRu
            ? 'Произошла ошибка при обработке вашего профиля 😔'
            : 'An error occurred while processing your profile 😔'
        )
        return ctx.scene.leave()
      }
      if (model_url && trigger_word) {
        const fullPrompt = `${trigger_word}, ${promptText}`
        const botUsername = (ctx.botInfo?.username || 'unknown_bot') as string
        await generateNeuroImage(
          fullPrompt,
          model_url,
          1,
          telegramId,
          ctx,
          botUsername
        )
        ctx.wizard.next()
        return
      } else {
        await ctx.reply(isRu ? '❌ Некорректный промпт' : '❌ Invalid prompt')
        ctx.scene.leave()
        return
      }
    }
  }
}

const neuroPhotoButtonStep = async (ctx: MyContext) => {
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

    if (text === mainMenuButton.title_ru || text === mainMenuButton.title_en) {
      console.log('CASE: Главное меню')
      await handleMenu(ctx)
      return
    }

    await handleMenu(ctx)

    // Обработка кнопок с числами
    const numImages = parseInt(text[0])
    const prompt = ctx.session.prompt
    const telegramId = ctx.from?.id.toString()
    if (!telegramId) {
      await ctx.reply(
        isRu
          ? 'Произошла ошибка при обработке вашего профиля 😔'
          : 'An error occurred while processing your profile 😔'
      )
      return ctx.scene.leave()
    }
    const botUsername = (ctx.botInfo?.username || 'neuro_blogger_bot') as string
    const generate = async (num: number) => {
      await generateNeuroImage(
        prompt || '',
        ctx.session.userModel.model_url,
        num,
        telegramId,
        ctx,
        botUsername
      )
    }

    if (numImages >= 1 && numImages <= 4) {
      await generate(numImages)
    } else {
      const { count, subscription, level } = await getReferalsCountAndUserData(
        ctx.from?.id?.toString() || ''
      )
      if (!subscription) {
        await ctx.reply(
          isRu
            ? 'Произошла ошибка при обработке вашего профиля 😔'
            : 'An error occurred while processing your profile 😔'
        )
        return ctx.scene.leave()
      }
      await mainMenu({
        isRu,
        inviteCount: count,
        subscription: subscription?.type || SubscriptionType.NEUROTESTER,
        ctx,
        level,
      })
    }
  }
}

export const neuroPhotoWizard = new WizardScene<MyContext>(
  ModeEnum.NeuroPhoto,
  neuroPhotoConversationStep,
  neuroPhotoPromptStep,
  neuroPhotoButtonStep
)
