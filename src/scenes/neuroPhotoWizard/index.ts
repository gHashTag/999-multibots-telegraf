import { MyContext } from '@/interfaces'
import { ModelUrl, UserModel, ModelTraining } from '@/interfaces'

import { generateNeuroPhotoHybrid } from '@/services/generateNeuroPhotoHybrid'
import {
  getActiveUserModelsByType,
  getReferalsCountAndUserData,
  getUserData,
} from '@/core/supabase'
// ✅ ИМПОРТИРУЕМ НОВУЮ ФУНКЦИЮ ДЛЯ HAIM GROUP MEDIA
import { getActiveUserModelsByTypeForHaim } from '@/core/supabase/getActiveUserModelsByTypeForHaim'
import {
  levels,
  mainMenu,
  sendGenericErrorMessage,
  sendPhotoDescriptionRequest,
} from '@/menu'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { Scenes } from 'telegraf'
import { getUserInfo } from '@/handlers/getUserInfo'
import { handleMenu } from '@/handlers'
import { ModeEnum } from '@/interfaces/modes'
// ✅ ИМПОРТИРУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ ЯЗЫКОВ!
import { isRussianFromState } from '@/helpers/centralizedLanguage'
// ✅ ИМПОРТИРУЕМ getBotNameByToken ДЛЯ ОПРЕДЕЛЕНИЯ ТЕКУЩЕГО БОТА
import { getBotNameByToken } from '@/core/bot'

interface NeuroPhotoWizardSession extends Scenes.WizardSessionData {
  userModels?: ModelTraining[]
}

const neuroPhotoConversationStep = async (ctx: MyContext) => {
  // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
  const isRu = isRussianFromState(ctx)
  try {
    console.log('CASE 1: neuroPhotoConversation')

    const { telegramId } = await getUserInfo(ctx)

    // ✅ ОПРЕДЕЛЯЕМ ТЕКУЩИЙ БОТ
    const botToken = ctx.telegram.token
    const { bot_name } = getBotNameByToken(botToken)
    console.log(`🤖 Определен бот: ${bot_name} для пользователя ${telegramId}`)

    // ✅ ИСПОЛЬЗУЕМ НОВУЮ ФУНКЦИЮ ДЛЯ HAIM GROUP MEDIA, ИНАЧЕ СТАНДАРТНУЮ
    let userModels: ModelTraining[] | null = null

    if (bot_name === 'HaimGroupMedia_bot') {
      console.log('🎯 Используем расширенную функцию для HaimGroupMedia_bot')
      userModels = await getActiveUserModelsByTypeForHaim(
        Number(telegramId),
        'replicate',
        bot_name
      )
    } else {
      console.log('🔧 Используем стандартную функцию для обычного бота')
      userModels = await getActiveUserModelsByType(
        Number(telegramId),
        'replicate'
      )
    }

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

        // ✅ ПРОВЕРЯЕМ, ЯВЛЯЕТСЯ ЛИ МОДЕЛЬ ОБЩЕЙ (ИМЕЕТ ПРЕФИКС shared_)
        const isSharedModel = model.id.toString().startsWith('shared_')

        if (isRu) {
          if (isSharedModel) {
            // Для общих моделей используем уже модифицированное название
            buttonText += model.model_name
          } else {
            buttonText += `Модель ${dateString}`
            if (model.steps && model.steps > 0) {
              buttonText += `, ${model.steps} шагов`
            }
          }
        } else {
          if (isSharedModel) {
            // Для общих моделей используем уже модифицированное название
            buttonText += model.model_name.replace(
              '(Общая модель команды)',
              '(Team Shared Model)'
            )
          } else {
            buttonText += `Model ${dateString}`
            if (model.steps && model.steps > 0) {
              buttonText += `, ${model.steps} steps`
            }
          }
        }

        return [
          { text: buttonText, callback_data: `select_neuro_model_${model.id}` },
        ]
      })

      // Добавляем кнопку отмены
      modelButtons.push([
        {
          text: isRu ? 'Отмена' : 'Cancel',
          callback_data: 'cancel_neuro_photo',
        },
      ])

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
  if (ctx.message && 'text' in ctx.message) {
    const promptText = ctx.message.text.trim()
    console.log(`CASE: Введен промпт: ${promptText}`)
    if (promptText.length < 3) {
      // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
      const isRu = isRussianFromState(ctx)
      await ctx.reply(
        isRu
          ? 'Промпт слишком короткий. Пожалуйста, введите более подробное описание (минимум 3 символа).'
          : 'Prompt is too short. Please provide a more detailed description (minimum 3 characters).'
      )
      return
    }

    ctx.session.prompt = promptText
    const userId = ctx.from?.id

    if (!ctx.session.userModel || !ctx.session.userModel.model_url) {
      console.error(
        'Error: userModel not found in session at neuroPhotoPromptStep'
      )
      // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
      const isRu = isRussianFromState(ctx)
      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка: модель не выбрана. Попробуйте начать заново.'
          : '❌ Error: model not selected. Please start over.'
      )
      // handleMenu сам определит язык и подписку
      await handleMenu(ctx)
      return
    }

    const model_url = ctx.session.userModel.model_url
    const trigger_word = ctx.session.userModel.trigger_word as string

    const userData = await getUserData(userId?.toString() ?? '')
    let genderPromptPart = 'person'
    if (userData?.gender === 'female') {
      genderPromptPart = 'female'
    } else if (userData?.gender === 'male') {
      genderPromptPart = 'male'
    }

    console.log(
      `[neuroPhotoWizard PromptStep] Determined gender for prompt: ${genderPromptPart}`
    )

    const detailPrompt = `Cinematic Lighting, ethereal light, intricate details, extremely detailed, incredible details, full colored, complex details, insanely detailed and intricate, hypermaximalist, extremely detailed with rich colors. masterpiece, best quality, aerial view, HDR, UHD, unreal engine, Representative, fair skin, beautiful face, Rich in details High quality, gorgeous, glamorous, 8k, super detail, gorgeous light and shadow, detailed decoration, detailed lines`

    const fullPrompt = `Fashionable ${trigger_word} ${genderPromptPart}, ${promptText}, ${detailPrompt}`
    await generateNeuroPhotoHybrid(
      fullPrompt,
      model_url as any,
      1,
      userId?.toString() ?? '',
      ctx,
      ctx.botInfo?.username
    )
    ctx.wizard.next()
    return
  }
}

const neuroPhotoButtonStep = async (ctx: MyContext) => {
  console.log('CASE 3: neuroPhotoButtonStep')
  if (ctx.message && 'text' in ctx.message) {
    const text = ctx.message.text
    console.log(`CASE: Нажата кнопка ${text}`)
    // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
    const isRu = isRussianFromState(ctx)

    if (text === '🆕 Новый промпт' || text === '🆕 New prompt') {
      console.log('CASE: Новый промпт - возврат к началу сцены')
      ctx.session.prompt = undefined
      ctx.wizard.selectStep(0)
      return neuroPhotoConversationStep(ctx)
    }

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
      // handleMenu сам определит язык и подписку
      await handleMenu(ctx)
      return
    }

    const generate = async (num: number) => {
      // ИСПРАВЛЕНИЕ: Формируем правильный промпт с учетом пола
      const trigger_word = ctx.session.userModel.trigger_word as string

      const userData = await getUserData(userId?.toString() ?? '')
      let genderPromptPart = 'person'
      if (userData?.gender === 'female') {
        genderPromptPart = 'female'
      } else if (userData?.gender === 'male') {
        genderPromptPart = 'male'
      }

      console.log(
        `[neuroPhotoWizard ButtonStep] Determined gender for prompt: ${genderPromptPart}`
      )

      const detailPrompt = `Cinematic Lighting, ethereal light, intricate details, extremely detailed, incredible details, full colored, complex details, insanely detailed and intricate, hypermaximalist, extremely detailed with rich colors. masterpiece, best quality, aerial view, HDR, UHD, unreal engine, Representative, fair skin, beautiful face, Rich in details High quality, gorgeous, glamorous, 8k, super detail, gorgeous light and shadow, detailed decoration, detailed lines`

      const fullPrompt = `Fashionable ${trigger_word} ${genderPromptPart}, ${prompt}, ${detailPrompt}`

      await generateNeuroPhotoHybrid(
        fullPrompt,
        ctx.session.userModel.model_url as any,
        num,
        userId?.toString() ?? '',
        ctx,
        ctx.botInfo?.username
      )
    }

    if (numImages >= 1 && numImages <= 4) {
      await generate(numImages)
      return ctx.scene.leave()
    } else {
      console.log(
        'CASE: Неизвестный ввод в neuroPhotoButtonStep, показ главного меню и выход из сцены'
      )
      // handleMenu сам определит язык и подписку
      await handleMenu(ctx)
      return
    }
  } else {
    console.log(
      'CASE: Нетекстовый или отсутствующий ввод в neuroPhotoButtonStep, показ главного меню и выход из сцены'
    )
    // handleMenu сам определит язык и подписку
    await handleMenu(ctx)
    return
  }
}

export const neuroPhotoWizard = new Scenes.WizardScene<MyContext>(
  ModeEnum.NeuroPhoto,
  neuroPhotoConversationStep,
  neuroPhotoPromptStep,
  neuroPhotoButtonStep
)

neuroPhotoWizard.on('callback_query', async (ctx: MyContext) => {
  if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
    // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
    const isRuLocal = isRussianFromState(ctx)
    const message = isRuLocal
      ? 'Произошла ошибка ответа от кнопки'
      : 'Button callback error'
    return ctx.answerCbQuery(message)
  }
  const callbackData = ctx.callbackQuery.data
  // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
  const isRu = isRussianFromState(ctx)

  await ctx.answerCbQuery()

  if (callbackData === 'cancel_neuro_photo') {
    await ctx.reply(isRu ? 'Отменено' : 'Cancelled')
    return ctx.scene.leave()
  } else if (callbackData.startsWith('select_neuro_model_')) {
    let modelId = callbackData.replace('select_neuro_model_', '')

    // ✅ ОБРАБАТЫВАЕМ ОБЩИЕ МОДЕЛИ (УБИРАЕМ ПРЕФИКС shared_)
    const isSharedModel = modelId.startsWith('shared_')
    if (isSharedModel) {
      modelId = modelId.replace('shared_', '')
      console.log(`🎯 Обрабатываем общую модель с ID: ${modelId}`)
    }

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

      // ✅ ПОИСК МОДЕЛИ С УЧЕТОМ ОБЩИХ МОДЕЛЕЙ
      const selectedModel = userModelsFromState?.find(m => {
        const currentModelId = m.id.toString().startsWith('shared_')
          ? m.id.toString().replace('shared_', '')
          : m.id.toString()
        return currentModelId === String(modelId)
      })

      if (selectedModel) {
        // ✅ ДЛЯ ОБЩИХ МОДЕЛЕЙ СОЗДАЕМ КОПИЮ БЕЗ ПРЕФИКСА В ID
        let modelToUse = selectedModel
        if (isSharedModel) {
          modelToUse = {
            ...selectedModel,
            id: modelId, // Убираем префикс shared_ для использования
          }
          console.log(`✅ Используем общую модель: ${selectedModel.model_name}`)
        }

        ctx.session.userModel = modelToUse as UserModel

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
