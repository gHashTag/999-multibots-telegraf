import { MyContext } from '@/interfaces'
import { ModelUrl, UserModel, ModelTraining } from '@/interfaces'

import { generateNeuroPhotoHybrid } from '@/services/generateNeuroPhotoHybrid'
import {
  getActiveUserModelsByType,
  getReferalsCountAndUserData,
  getUserData,
} from '@/core/supabase'
// ✅ ИСПОЛЬЗУЕМ ТОЛЬКО СТАНДАРТНУЮ ФУНКЦИЮ - ЕДИНЫЙ ИСТОЧНИК ПРАВДЫ
import {
  levels,
  mainMenu,
  sendGenericErrorMessage,
  sendPhotoDescriptionRequest,
} from '@/menu'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { Scenes, Markup } from 'telegraf'
import { getUserInfo } from '@/handlers/getUserInfo'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { handleMenu } from '@/handlers'
import { ModeEnum } from '@/interfaces/modes'
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

    // ✅ ЕДИНСТВЕННЫЙ ИСТОЧНИК ПРАВДЫ: только таблица model_trainings
    console.log('🎯 Используем стандартную функцию - единый источник правды из model_trainings')
    userModels = await getActiveUserModelsByType(
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

        // ✅ ЕДИНАЯ ЛОГИКА: Если есть имя модели - показываем его, иначе дату
        if (isRu) {
          if (model.model_name && model.model_name.trim() !== '') {
            buttonText += model.model_name
            if (model.steps && model.steps > 0) {
              buttonText += ` (${model.steps} шагов)`
            }
          } else {
            buttonText += `Модель ${dateString}`
            if (model.steps && model.steps > 0) {
              buttonText += `, ${model.steps} шагов`
            }
          }
        } else {
          if (model.model_name && model.model_name.trim() !== '') {
            buttonText += model.model_name
            if (model.steps && model.steps > 0) {
              buttonText += ` (${model.steps} steps)`
            }
          } else {
            buttonText += `Model ${dateString}`
            if (model.steps && model.steps > 0) {
              buttonText += `, ${model.steps} steps`
            }
          }
        }

        // ✅ ИСПРАВЛЕНИЕ: Укорачиваем callback_data для Telegram (лимит 64 байта)
        let callbackData = `select_model_${model.id}`

        // Если callback_data слишком длинный, используем последние 8 символов ID
        if (callbackData.length > 60) {
          const shortId = model.id.toString().slice(-8)
          callbackData = `select_model_${shortId}`
        }

        return [
          { text: buttonText, callback_data: callbackData },
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

    console.log('🔍 [DEBUG] Проверка длины промпта пройдена')
    ctx.session.prompt = promptText
    const userId = ctx.from?.id
    console.log(`🔍 [DEBUG] UserId: ${userId}`)

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

    console.log('🔍 [DEBUG] userModel найден в сессии')
    const model_url = ctx.session.userModel.model_url as string
    const trigger_word = ctx.session.userModel.trigger_word as string
    console.log(`🔍 [DEBUG] model_url: ${model_url}`)
    console.log(`🔍 [DEBUG] trigger_word: ${trigger_word}`)

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
    console.log(`🔍 [DEBUG] fullPrompt сформирован: ${fullPrompt.substring(0, 100)}...`)
    
    console.log('🚀 [DEBUG] Начинаем вызов generateNeuroPhotoHybrid')
    try {
      // ГЕНЕРИРУЕМ СРАЗУ 1 ИЗОБРАЖЕНИЕ КАК БЫЛО РАНЬШЕ!
      const result = await generateNeuroPhotoHybrid(
        fullPrompt,
        model_url as any,
        1,
        userId?.toString() ?? '',
        ctx,
        ctx.botInfo?.username
      )
      console.log('✅ [DEBUG] generateNeuroPhotoHybrid завершен успешно:', result)
    } catch (error) {
      console.error('❌ [DEBUG] Ошибка в generateNeuroPhotoHybrid:', error)
      const isRu = isRussianFromState(ctx)
      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка при генерации изображения. Попробуйте позже.'
          : '❌ Error occurred during image generation. Please try again later.'
      )
      return
    }
    
    // После генерации переходим к следующему шагу (для обработки кнопок типа "Новый промпт")
    console.log('🔄 [DEBUG] Переходим к следующему шагу wizard')
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
    await ctx.reply(isRu ? "Отменено. Возвращаю в главное меню." : "Cancelled. Returning to main menu.")
    await handleMenu(ctx)
    return ctx.scene.leave()
  } else if (callbackData.startsWith('select_model_')) {
    let modelId = callbackData.replace('select_model_', '')

    // ✅ ЕДИНАЯ ЛОГИКА: обрабатываем только короткие ID (8 символов)

    const userModels = (ctx.scene.state as NeuroPhotoWizardSession).userModels
    let selectedModel = userModels?.find(
      (model) => model.id.toString() === modelId
    )

    // Если не нашли по полному ID, ищем по короткому (последние 8 символов)
    if (!selectedModel && modelId.length === 8) {
      selectedModel = userModels?.find(
        (model) => model.id.toString().endsWith(modelId)
      )
    }

    if (selectedModel) {
      ctx.session.userModel = selectedModel as UserModel
      await sendPhotoDescriptionRequest(ctx, isRu, ModeEnum.NeuroPhoto)
      const isCancel = await handleHelpCancel(ctx)
      if (isCancel) {
        return ctx.scene.leave()
      }
      ctx.wizard.next()
    } else {
      await ctx.reply(
        isRu
          ? '❌ Модель не найдена. Попробуйте снова.'
          : '❌ Model not found. Please try again.'
      )
    }
  }
})

// ✅ ОБРАБАТЫВАЕМ УНИВЕРСАЛЬНЫЕ КОМАНДЫ ВОКРУГ СЦЕНЫ (МЕНЮ, HELP И Т.Д.)
neuroPhotoWizard.command('menu', async (ctx) => {
  // handleMenu сам определит язык и подписку
  await handleMenu(ctx)
  return ctx.scene.leave()
})

neuroPhotoWizard.command('help', async (ctx) => {
  // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
  const isRu = isRussianFromState(ctx)
  await ctx.reply(
    isRu
      ? 'Это сцена создания нейрофото. Введите описание на английском языке для генерации.'
      : 'This is the neurophoto creation scene. Enter a description in English to generate.'
  )
})