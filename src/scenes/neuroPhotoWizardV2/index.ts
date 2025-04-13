/**
 * ⚠️⚠️⚠️ ВНИМАНИЕ! ⚠️⚠️⚠️
 *
 * Этот файл реализует сцену NeuroPhoto V2 (Flux Pro)!
 *
 * Его нельзя путать с обычной сценой NeuroPhoto (Flux).
 * Файл содержит логику генерации нейрофото с использованием
 * API BFL для версии Flux Pro.
 */

import { UserModel } from '../../interfaces'
import { mainMenuButton } from '@/menu'
import { generateNeuroImageV2 } from '@/services/generateNeuroImageV2'
import {
  getLatestUserModel,
  getReferalsCountAndUserData,
} from '@/core/supabase'
import {
  mainMenu,
  sendGenericErrorMessage,
  sendPhotoDescriptionRequest,
} from '@/menu'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { WizardScene } from 'telegraf/scenes'

import { MyContext } from '@/interfaces'
import { getUserInfo } from '@/handlers/getUserInfo'
import { handleMenu } from '@/handlers'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { logger } from '@/utils/logger'
const neuroPhotoConversationStep = async (ctx: MyContext) => {
  const isRu = ctx.from?.language_code === 'ru'
  try {
    console.log('CASE 1: neuroPhotoConversationV2')

    
    logger.info({
      message: '🚀 ЗАПУСК neuroPhotoWizardV2 (v2)',
      description: 'Starting neuroPhotoWizardV2 (v2)',
      telegram_id: ctx.from?.id,
      session_data: {
        mode: ctx.session.mode,
        user_model: ctx.session.userModel ? 'exists' : 'not exists',
      },
    })

    const { telegramId } = getUserInfo(ctx)
    const userModel = await getLatestUserModel(telegramId, 'bfl')
    console.log('userModel', userModel)

    const { count, subscription, level } =
      await getReferalsCountAndUserData(telegramId)

    if (!userModel || !userModel.finetune_id || !subscription) {
      await ctx.reply(
        isRu
          ? '❌ У вас нет обученных моделей.\n\nИспользуйте команду "🤖 Цифровое тело аватара", в главном меню, чтобы создать свою ИИ модель для генерации нейрофото в вашим лицом. '
          : "❌ You don't have any trained models.\n\nUse the '🤖  Digital avatar body' command in the main menu to create your AI model for generating neurophotos with your face.",
        {
          reply_markup: mainMenu({
            isRu,
            inviteCount: count,
            subscription: subscription || 'stars',
            ctx,
            level,
          }).reply_markup
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

      const trigger_word = ctx.session.userModel.trigger_word as string

      if (trigger_word) {
        const fullPrompt = `${trigger_word}, ${promptText}`
        const telegramId = ctx.from?.id.toString()
        if (!telegramId) {
          await ctx.reply(
            isRu
              ? '❌ Ошибка: не удалось получить ID пользователя'
              : '❌ Error: User ID not found'
          )
          return ctx.scene.leave()
        }
        const result = await generateNeuroImageV2(
          fullPrompt,
          1,
          telegramId,
          ctx,
          ctx.botInfo?.username
        )

        if (result === null) {
          return
        }

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

    const trigger_word = ctx.session.userModel.trigger_word as string
    const fullPrompt = `${trigger_word}, ${prompt}`
    const generate = async (num: number) => {
      const telegramId = ctx.from?.id.toString()
      if (!telegramId) {
        await ctx.reply(
          isRu
            ? '❌ Ошибка: не удалось получить ID пользователя'
            : '❌ Error: User ID not found'
        )
        return ctx.scene.leave()
      }
      const result = await generateNeuroImageV2(
        fullPrompt,
        num,
        telegramId,
        ctx,
        ctx.botInfo?.username
      )

      return result !== null
    }

    if (numImages >= 1 && numImages <= 4) {
      await generate(numImages)
    } else {
      const { count, subscription, level } = await getReferalsCountAndUserData(
        ctx.from?.id?.toString() || ''
      )
      const telegramId = ctx.from?.id.toString()
      if (!telegramId) {
        await ctx.reply(
          isRu
            ? '❌ Ошибка: не удалось получить ID пользователя'
            : '❌ Error: User ID not found'
        )
        return ctx.scene.leave()
      }

      const keyboard = mainMenu({
        isRu,
        inviteCount: count,
        subscription: subscription || 'stars',
        ctx,
        level,
      })
      
      await ctx.reply(
        isRu 
          ? '❌ Пожалуйста, выберите от 1 до 4 изображений'
          : '❌ Please select between 1 and 4 images',
        { reply_markup: keyboard.reply_markup }
      )
    }
  }
}

export const neuroPhotoWizardV2 = new WizardScene<MyContext>(
  ModeEnum.NeuroPhotoV2,
  neuroPhotoConversationStep,
  neuroPhotoPromptStep,
  neuroPhotoButtonStep
)
