import { MyContext } from '@/interfaces'
import { ModelUrl, UserModel, ModelTraining } from '@/interfaces'

import { generateNeuroImage } from '@/services/generateNeuroImage'
import {
  getActiveUserModelsByType,
  getReferalsCountAndUserData,
} from '@/core/supabase'
import {
  levels,
  mainMenu,
  sendGenericErrorMessage,
  sendPhotoDescriptionRequest,
} from '@/menu'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { WizardScene, WizardSessionData } from 'telegraf/scenes'
import { getUserInfo } from '@/handlers/getUserInfo'
import { handleMenu } from '@/handlers'
import { ModeEnum } from '@/interfaces/modes'

interface NeuroPhotoWizardSession extends WizardSessionData {
  userModels?: ModelTraining[]
}

const neuroPhotoConversationStep = async (ctx: MyContext) => {
  const isRu = ctx.from?.language_code === 'ru'
  try {
    console.log('CASE 1: neuroPhotoConversation')

    const { telegramId } = getUserInfo(ctx)
    const userModels = await getActiveUserModelsByType(
      Number(telegramId),
      'replicate'
    )

    const { subscriptionType } = await getReferalsCountAndUserData(telegramId)

    if (!userModels || userModels.length === 0) {
      await ctx.reply(
        isRu
          ? '❌ У вас нет обученных моделей для нейрофото.\n\nИспользуйте команду "🤖 Цифровое тело аватара", в главном меню, чтобы создать свою ИИ модель для генерации нейрофото с вашим лицом. '
          : "❌ You don't have any trained models for neurophotos.\n\nUse the '🤖  Digital avatar body' command in the main menu to create your AI model for generating neurophotos with your face.",
        {
          reply_markup: {
            keyboard: (
              await mainMenu({
                isRu,
                subscription: subscriptionType,
                ctx,
              })
            ).reply_markup.keyboard,
          },
        }
      )
      return ctx.scene.leave()
    } else if (userModels.length === 1) {
      ctx.session.userModel = userModels[0] as UserModel
      await sendPhotoDescriptionRequest(ctx, isRu, 'neuro_photo')
      const isCancel = await handleHelpCancel(ctx)
      if (isCancel) {
        return ctx.scene.leave()
      }
      ctx.wizard.next()
      return
    } else {
      ;(ctx.scene.state as NeuroPhotoWizardSession).userModels = userModels

      const modelButtons = userModels.map((model, index) => {
        let buttonText = `${index + 1}. `
        const dateString = new Date(model.created_at).toLocaleDateString(
          isRu ? 'ru-RU' : 'en-US'
        )

        if (isRu) {
          buttonText += `Модель натренирована ${dateString}`
          if (model.steps && model.steps > 0) {
            buttonText += `, ${model.steps} шагов`
          }
        } else {
          buttonText += `Model trained on ${dateString}`
          if (model.steps && model.steps > 0) {
            buttonText += `, ${model.steps} steps`
          }
        }

        return [
          { text: buttonText, callback_data: `select_neuro_model_${model.id}` },
        ]
      })

      await ctx.reply(
        isRu
          ? 'Выберите модель для генерации:'
          : 'Select a model for generation:',
        {
          reply_markup: {
            inline_keyboard: modelButtons,
          },
        }
      )
      return
    }
  } catch (error) {
    console.error('Error in neuroPhotoConversationStep:', error)
    await sendGenericErrorMessage(ctx, isRu, error)
    return ctx.scene.leave()
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
      if (
        !ctx.session.userModel ||
        !ctx.session.userModel.model_url ||
        !ctx.session.userModel.trigger_word
      ) {
        console.error(
          'Error: userModel not found or incomplete in session at neuroPhotoPromptStep'
        )
        await ctx.reply(
          isRu
            ? '❌ Произошла ошибка: данные модели не найдены. Попробуйте начать заново.'
            : '❌ Error: model data not found. Please start over.'
        )
        return ctx.scene.leave()
      }
      const model_url = ctx.session.userModel.model_url as ModelUrl
      const trigger_word = ctx.session.userModel.trigger_word as string

      const userId = ctx.from?.id

      const fullPrompt = `Fashionable ${trigger_word}, ${promptText}`
      await generateNeuroImage(
        fullPrompt,
        model_url,
        1,
        userId?.toString() ?? '',
        ctx,
        ctx.botInfo?.username
      )
      ctx.wizard.next()
      return
    }
  }
}

const neuroPhotoButtonStep = async (ctx: MyContext) => {
  console.log('CASE 3: neuroPhotoButtonStep')
  if (ctx.message && 'text' in ctx.message) {
    const text = ctx.message.text
    console.log(`CASE: Нажата кнопка ${text}`)
    const isRu = ctx.from?.language_code === 'ru'

    if (text === '⬆️ Улучшить промпт' || text === '⬆️ Improve prompt') {
      console.log('CASE: Улучшить промпт')
      await ctx.scene.enter(ModeEnum.ImprovePromptWizard)
      return
    }

    if (text === '📐 Изменить размер' || text === '📐 Change size') {
      console.log('CASE: Изменить размер')
      await ctx.scene.enter(ModeEnum.SizeWizard)
      return
    }

    if (text === levels[104].title_ru || text === levels[104].title_en) {
      console.log('CASE: Главное меню')
      await handleMenu(ctx)
      return
    }

    const numImages = parseInt(text[0])
    const prompt = ctx.session.prompt
    const userId = ctx.from?.id

    if (!prompt || !ctx.session.userModel || !ctx.session.userModel.model_url) {
      console.error(
        'Error: prompt or userModel not found in session at neuroPhotoButtonStep'
      )
      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка: данные для генерации не найдены. Попробуйте начать заново.'
          : '❌ Error: generation data not found. Please start over.'
      )
      await mainMenu({
        isRu,
        subscription: ctx.session.subscription || null,
        ctx,
      })
      return ctx.scene.leave()
    }

    const generate = async (num: number) => {
      await generateNeuroImage(
        prompt,
        ctx.session.userModel.model_url,
        num,
        userId?.toString() ?? '',
        ctx,
        ctx.botInfo?.username
      )
    }

    if (numImages >= 1 && numImages <= 4) {
      await generate(numImages)
    } else {
      console.log(
        'CASE: Неизвестная команда в neuroPhotoButtonStep, возврат в меню'
      )
      await mainMenu({
        isRu,
        subscription: ctx.session.subscription || null,
        ctx,
      })
      return ctx.scene.leave()
    }
  }
}

export const neuroPhotoWizard = new WizardScene<MyContext>(
  ModeEnum.NeuroPhoto,
  neuroPhotoConversationStep,
  neuroPhotoPromptStep,
  neuroPhotoButtonStep
)

neuroPhotoWizard.on('callback_query', async (ctx: MyContext) => {
  if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
    const message =
      ctx.from?.language_code === 'ru'
        ? 'Произошла ошибка ответа от кнопки'
        : 'Button callback error'
    return ctx.answerCbQuery(message)
  }
  const callbackData = ctx.callbackQuery.data
  const isRu = ctx.from?.language_code === 'ru'

  await ctx.answerCbQuery()

  if (callbackData.startsWith('select_neuro_model_')) {
    const modelId = callbackData.replace('select_neuro_model_', '')

    try {
      await ctx
        .deleteMessage(ctx.callbackQuery.message?.message_id)
        .catch(e => console.error('Error deleting message with buttons:', e))

      const userModelsFromState = (ctx.scene.state as NeuroPhotoWizardSession)
        .userModels
      if (!userModelsFromState) {
        console.error(
          'Error: userModels not found in scene state for model selection.'
        )
        await ctx.reply(
          isRu
            ? '❌ Произошла ошибка при выборе модели. Попробуйте начать заново.'
            : '❌ An error occurred while selecting the model. Please try again.'
        )
        return ctx.scene.leave()
      }

      const selectedModel = userModelsFromState?.find(
        m => String(m.id) === String(modelId)
      )

      if (selectedModel) {
        ctx.session.userModel = selectedModel as UserModel

        await sendPhotoDescriptionRequest(ctx, isRu, 'neuro_photo')
        ctx.wizard.selectStep(1)
        return
      } else {
        console.error(
          `Error: Selected model with id ${modelId} not found in userModelsFromState.`
        )
        await ctx.reply(
          isRu
            ? '❌ Выбранная модель не найдена. Попробуйте еще раз.'
            : '❌ Selected model not found. Please try again.'
        )
        return ctx.scene.leave()
      }
    } catch (error) {
      console.error('Error processing neuro model selection:', error)
      await sendGenericErrorMessage(ctx, isRu, error)
      return ctx.scene.leave()
    }
  }
})
