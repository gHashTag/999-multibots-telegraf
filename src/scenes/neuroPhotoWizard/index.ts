import { MyContext } from '@/interfaces'
import { ModelUrl, UserModel, ModelTraining } from '@/interfaces'

import { generateNeuroPhotoHybrid } from '@/services/generateNeuroPhotoHybrid'
import {
  getActiveUserModelsByType,
  getReferalsCountAndUserData,
  getUserData,
  getAspectRatio,
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
import { logger } from '@/utils/logger'
// ✅ ИМПОРТИРУЕМ getBotNameByToken ДЛЯ ОПРЕДЕЛЕНИЯ ТЕКУЩЕГО БОТА
import { getBotNameByToken } from '@/core/bot'
// ✅ НОВЫЕ УТИЛИТЫ ДЛЯ БЕЗОПАСНОЙ РАБОТЫ С КНОПКАМИ
import {
  createSafeModelSelectionKeyboard,
  handleModelSelectionCallback,
  ModelButtonOptions
} from '@/utils/modelButtonMapping'
import { handleButtonError } from '@/utils/buttonMapping'

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

    console.log(`🔍 [neuroPhotoConversationStep] Результат getActiveUserModelsByType:`, {
      userModels: userModels?.length || 0,
      hasModels: !!userModels && userModels.length > 0
    })

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

      try {
        // ✅ ИСПОЛЬЗУЕМ НОВУЮ БЕЗОПАСНУЮ СИСТЕМУ КНОПОК
        const buttonOptions: ModelButtonOptions = {
          isRussian: isRu,
          includeSteps: true,
          includeDate: true,
          maxTextLength: 50,
          debug: true
        }

        const keyboardResult = createSafeModelSelectionKeyboard(
          userModels,
          'select_model',
          buttonOptions
        )

        if (!keyboardResult.isValid) {
          console.error('Failed to create model selection keyboard:', keyboardResult.error)
          await sendGenericErrorMessage(ctx, isRu, new Error(keyboardResult.error || 'Keyboard creation failed'))
          return ctx.scene.leave()
        }

        // Заменяем стандартную кнопку отмены на neuro_photo специфическую
        const keyboard = keyboardResult.keyboard.map(row =>
          row.map(button =>
            button.callback_data === 'cancel_model_selection'
              ? { text: button.text, callback_data: 'cancel_neuro_photo' }
              : button
          )
        )

        await ctx.reply(
          isRu
            ? 'Выберите модель для генерации:'
            : 'Select a model for generation:',
          {
            reply_markup: {
              inline_keyboard: keyboard,
            },
          }
        )
        return
      } catch (error) {
        console.error('Error creating model selection keyboard:', error)
        handleButtonError(
          error instanceof Error ? error : new Error(String(error)),
          'neuroPhoto model selection',
          async () => {
            await sendGenericErrorMessage(ctx, isRu, error instanceof Error ? error : new Error('Model selection failed'))
            await ctx.scene.leave()
          }
        )
        return
      }
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

    // УБРАНО: Кнопки 1️⃣, 2️⃣, 3️⃣, 4️⃣ теперь обрабатываются в global hears handlers
    // для генерации соответствующего количества изображений

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

    // Получаем aspect ratio пользователя
    const userAspectRatio = await getAspectRatio(userId || 0)
    console.log(`🔍 [DEBUG] aspectRatio пользователя: ${userAspectRatio}`)

    console.log('🚀 [DEBUG] Начинаем вызов generateNeuroPhotoHybrid')
    try {
      // ГЕНЕРИРУЕМ СРАЗУ 1 ИЗОБРАЖЕНИЕ КАК БЫЛО РАНЬШЕ!
      const result = await generateNeuroPhotoHybrid(
        fullPrompt,
        model_url as any,
        1,
        userId?.toString() ?? '',
        ctx,
        ctx.botInfo?.username,
        userAspectRatio
      )
      console.log('✅ [DEBUG] generateNeuroPhotoHybrid завершен успешно:', result)

      // 🚨 ДОБАВЛЯЕМ REPLY KEYBOARD ВНИЗУ после генерации
      const isRu = isRussianFromState(ctx)
      await ctx.reply(
        isRu
          ? '👇 Выберите действие:'
          : '👇 Choose an action:',
        {
          reply_markup: {
            keyboard: [
              ['1️⃣', '2️⃣', '3️⃣', '4️⃣'],
              [
                isRu ? '⬆️ Улучшить промпт' : '⬆️ Improve prompt',
                isRu ? '📐 Изменить размер' : '📐 Change size',
              ],
              [
                isRu ? '🆕 Новый промпт' : '🆕 New prompt',
                isRu ? '🏠 Главное меню' : '🏠 Main menu',
              ],
            ],
            resize_keyboard: true,
          }
        }
      )
      console.log('✅ [DEBUG] Reply keyboard отправлена внизу')

      // Переходим к шагу обработки кнопок
      ctx.wizard.next()
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
  }
}

const neuroPhotoButtonStep = async (ctx: MyContext) => {
  console.log('CASE 3: neuroPhotoButtonStep')
  if (ctx.message && 'text' in ctx.message) {
    const text = ctx.message.text
    console.log(`CASE: Нажата кнопка ${text}`)
    // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
    const isRu = isRussianFromState(ctx)

    // 🚨 ОБРАБОТКА КНОПОК 1️⃣,2️⃣,3️⃣,4️⃣ И ЧИСЕЛ 1,2,3,4
    if (['1️⃣', '2️⃣', '3️⃣', '4️⃣'].includes(text) || ['1', '2', '3', '4'].includes(text)) {
      console.log(`CASE: Генерация ${text} изображений`)
      let numImages: number
      if (['1️⃣', '2️⃣', '3️⃣', '4️⃣'].includes(text)) {
        numImages = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'].indexOf(text) + 1
      } else {
        numImages = parseInt(text)
      }
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
        await handleMenu(ctx)
        return
      }

      const trigger_word = ctx.session.userModel.trigger_word as string
      const userData = await getUserData(userId?.toString() ?? '')
      let genderPromptPart = 'person'
      if (userData?.gender === 'female') {
        genderPromptPart = 'female'
      } else if (userData?.gender === 'male') {
        genderPromptPart = 'male'
      }

      const detailPrompt = `Cinematic Lighting, ethereal light, intricate details, extremely detailed, incredible details, full colored, complex details, insanely detailed and intricate, hypermaximalist, extremely detailed with rich colors. masterpiece, best quality, aerial view, HDR, UHD, unreal engine, Representative, fair skin, beautiful face, Rich in details High quality, gorgeous, glamorous, 8k, super detail, gorgeous light and shadow, detailed decoration, detailed lines`
      const fullPrompt = `Fashionable ${trigger_word} ${genderPromptPart}, ${prompt}, ${detailPrompt}`
      const userAspectRatio = await getAspectRatio(userId || 0)

      await generateNeuroPhotoHybrid(
        fullPrompt,
        ctx.session.userModel.model_url as any,
        numImages,
        userId?.toString() ?? '',
        ctx,
        ctx.botInfo?.username,
        userAspectRatio
      )
      return
    }

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

    if (text === '🏠 Главное меню' || text === '🏠 Main menu' || text === levels[104].title_ru || text === levels[104].title_en) {
      console.log('CASE: Главное меню')
      await handleMenu(ctx)
      return
    }

    // 🚨 ОБРАБОТКА ТЕКСТОВОГО ПРОМПТА (если пользователь отправил текст вместо кнопки)
    if (text && text.length > 10) {
      console.log('CASE: Получен текстовый промпт в neuroPhotoButtonStep, обрабатываем как промпт')
      // Сохраняем промпт в сессии
      ctx.session.prompt = text
      
      // Переходим к генерации 1 изображения по умолчанию
      const numImages = 1
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
        await handleMenu(ctx)
        return
      }

      const trigger_word = ctx.session.userModel.trigger_word as string
      const userData = await getUserData(userId?.toString() ?? '')
      let genderPromptPart = 'person'
      if (userData?.gender === 'female') {
        genderPromptPart = 'female'
      } else if (userData?.gender === 'male') {
        genderPromptPart = 'male'
      }

      const detailPrompt = `Cinematic Lighting, ethereal light, intricate details, extremely detailed, incredible details, full colored, complex details, insanely detailed and intricate, hypermaximalist, extremely detailed with rich colors. masterpiece, best quality, aerial view, HDR, UHD, unreal engine, Representative, fair skin, beautiful face, Rich in details High quality, gorgeous, glamorous, 8k, super detail, gorgeous light and shadow, detailed decoration, detailed lines`

      const fullPrompt = `Fashionable ${trigger_word} ${genderPromptPart}, ${prompt}, ${detailPrompt}`

      console.log(`[neuroPhotoWizard ButtonStep] Determined gender for prompt: ${genderPromptPart}`)
      console.log(`[neuroPhotoWizard ButtonStep] fullPrompt сформирован: ${fullPrompt.substring(0, 100)}...`)

      const userDataForAspect = await getUserData(userId?.toString() ?? '')
      const aspectRatio = userDataForAspect?.aspectRatio || '9:16'
      console.log(`[neuroPhotoWizard ButtonStep] aspectRatio пользователя: ${aspectRatio}`)

      console.log('🚀 [DEBUG] Начинаем вызов generateNeuroPhotoHybrid')
      console.log('🚀 [HYBRID] generateNeuroPhotoHybrid ВХОД в функцию')
      console.log('🚀 [HYBRID] Параметры:', {
        prompt: fullPrompt.substring(0, 100) + '...',
        model_url: ctx.session.userModel.model_url,
        numImages,
        telegram_id: userId?.toString(),
        botName: 'clip_maker_neuro_bot',
        explicitAspectRatio: aspectRatio,
      })

      try {
        const result = await generateNeuroPhotoHybrid(
          fullPrompt,
          ctx.session.userModel.model_url,
          numImages,
          userId?.toString() ?? '',
          ctx,
          'clip_maker_neuro_bot',
          aspectRatio
        )

        console.log('✅ [DEBUG] generateNeuroPhotoHybrid завершен успешно:', result)

        if (result.success && result.urls && result.urls.length > 0) {
          for (const url of result.urls) {
            await ctx.replyWithPhoto(url)
          }
          
          // Показываем кнопки для дальнейших действий
          await ctx.reply(
            isRu
              ? '✅ Изображения сгенерированы! Выберите действие:'
              : '✅ Images generated! Choose an action:',
            {
              reply_markup: {
                keyboard: [
                  [
                    { text: isRu ? '🆕 Новый промпт' : '🆕 New prompt' },
                    { text: isRu ? '⬆️ Улучшить промпт' : '⬆️ Improve prompt' }
                  ],
                  [
                    { text: isRu ? '📐 Изменить размер' : '📐 Change size' },
                    { text: isRu ? '🏠 Главное меню' : '🏠 Main menu' }
                  ]
                ],
                resize_keyboard: true,
                one_time_keyboard: false,
              },
            }
          )
        } else {
          await ctx.reply(
            isRu
              ? '❌ Ошибка при генерации изображений. Попробуйте снова.'
              : '❌ Error generating images. Please try again.'
          )
        }
      } catch (error) {
        console.error('Error in generateNeuroPhotoHybrid:', error)
        await ctx.reply(
          isRu
            ? '❌ Произошла ошибка при генерации. Попробуйте снова.'
            : '❌ Error occurred during generation. Please try again.'
        )
      }
      
      return
    }

    console.log(
      'CASE: Неизвестный ввод в neuroPhotoButtonStep, показ главного меню и выход из сцены'
    )
    await handleMenu(ctx)
    return
  } else {
    console.log(
      'CASE: Нетекстовый или отсутствующий ввод в neuroPhotoButtonStep, показ главного меню и выход из сцены'
    )
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

  try {
    // 🚨 ОБРАБОТКА INLINE КНОПОК 1️⃣,2️⃣,3️⃣,4️⃣ от AI сервера
    if (callbackData.startsWith('neuro_generate_')) {
      console.log(`🔥 [CALLBACK] Обработка inline кнопки: ${callbackData}`)
      const numImages = parseInt(callbackData.replace('neuro_generate_', ''))

      if (numImages < 1 || numImages > 4) {
        await ctx.reply(isRu ? '❌ Неверное количество изображений' : '❌ Invalid number of images')
        return
      }

      const prompt = ctx.session.prompt
      const userId = ctx.from?.id

      if (!prompt || !ctx.session.userModel || !ctx.session.userModel.model_url) {
        console.error('Error: prompt or userModel not found in session')
        await ctx.reply(
          isRu
            ? '❌ Произошла ошибка: данные для генерации не найдены. Попробуйте начать заново.'
            : '❌ Error: generation data not found. Please start over.'
        )
        await handleMenu(ctx)
        return
      }

      console.log(`🚀 [CALLBACK] Генерация ${numImages} изображений...`)

      const trigger_word = ctx.session.userModel.trigger_word as string
      const userData = await getUserData(userId?.toString() ?? '')
      let genderPromptPart = 'person'
      if (userData?.gender === 'female') {
        genderPromptPart = 'female'
      } else if (userData?.gender === 'male') {
        genderPromptPart = 'male'
      }

      const detailPrompt = `Cinematic Lighting, ethereal light, intricate details, extremely detailed, incredible details, full colored, complex details, insanely detailed and intricate, hypermaximalist, extremely detailed with rich colors. masterpiece, best quality, aerial view, HDR, UHD, unreal engine, Representative, fair skin, beautiful face, Rich in details High quality, gorgeous, glamorous, 8k, super detail, gorgeous light and shadow, detailed decoration, detailed lines`
      const fullPrompt = `Fashionable ${trigger_word} ${genderPromptPart}, ${prompt}, ${detailPrompt}`
      const userAspectRatio = await getAspectRatio(userId || 0)

      await generateNeuroPhotoHybrid(
        fullPrompt,
        ctx.session.userModel.model_url as any,
        numImages,
        userId?.toString() ?? '',
        ctx,
        ctx.botInfo?.username,
        userAspectRatio
      )

      // 🚨 ДОБАВЛЯЕМ REPLY KEYBOARD ВНИЗУ после генерации
      await ctx.reply(
        isRu
          ? '👇 Выберите действие:'
          : '👇 Choose an action:',
        {
          reply_markup: {
            keyboard: [
              ['1️⃣', '2️⃣', '3️⃣', '4️⃣'],
              [
                isRu ? '⬆️ Улучшить промпт' : '⬆️ Improve prompt',
                isRu ? '📐 Изменить размер' : '📐 Change size',
              ],
              [
                isRu ? '🆕 Новый промпт' : '🆕 New prompt',
                isRu ? '🏠 Главное меню' : '🏠 Main menu',
              ],
            ],
            resize_keyboard: true,
          }
        }
      )
      console.log('✅ [CALLBACK] Reply keyboard отправлена внизу')
      return
    }

    if (callbackData === 'new_prompt') {
      console.log('CASE: Новый промпт через callback')
      ctx.session.prompt = undefined
      ctx.wizard.selectStep(0)
      return neuroPhotoConversationStep(ctx)
    }

    if (callbackData === 'improve_prompt') {
      console.log('CASE: Улучшить промпт через callback')
      await ctx.scene.enter(ModeEnum.ImprovePromptWizard)
      return
    }

    if (callbackData === 'change_size') {
      console.log('CASE: Изменить размер через callback')
      await ctx.scene.enter(ModeEnum.SizeWizard)
      return
    }

    if (callbackData === 'main_menu') {
      console.log('CASE: Главное меню через callback')
      await handleMenu(ctx)
      return ctx.scene.leave()
    }

    if (callbackData === 'cancel_neuro_photo') {
      await ctx.reply(isRu ? "Отменено. Возвращаю в главное меню." : "Cancelled. Returning to main menu.")
      await handleMenu(ctx)
      return ctx.scene.leave()
    } else if (callbackData.startsWith('select_model_')) {
      const userModels = (ctx.scene.state as NeuroPhotoWizardSession).userModels

      if (!userModels || userModels.length === 0) {
        console.error('No user models found in session state')
        await ctx.reply(
          isRu
            ? '❌ Произошла ошибка: модели не найдены в сессии.'
            : '❌ Error: models not found in session.'
        )
        return
      }

      // ✅ ИСПОЛЬЗУЕМ НОВУЮ БЕЗОПАСНУЮ СИСТЕМУ ОБРАБОТКИ CALLBACK
      const result = handleModelSelectionCallback(
        userModels,
        callbackData,
        'neuroPhoto wizard',
        { isRussian: isRu, debug: true }
      )

      if (!result.success) {
        console.error('Model selection failed:', result.error)
        await ctx.reply(
          isRu
            ? `❌ Ошибка выбора модели: ${result.error || 'Неизвестная ошибка'}`
            : `❌ Model selection error: ${result.error || 'Unknown error'}`
        )
        return
      }

      if (result.shouldCancel) {
        await ctx.reply(isRu ? "Отменено." : "Cancelled.")
        await handleMenu(ctx)
        return ctx.scene.leave()
      }

      if (result.model) {
        console.log('Successfully selected model:', result.model.id)
        ctx.session.userModel = result.model as UserModel
        await sendPhotoDescriptionRequest(ctx, isRu, ModeEnum.NeuroPhoto)
        const isCancel = await handleHelpCancel(ctx)
        if (isCancel) {
          return ctx.scene.leave()
        }
        ctx.wizard.next()
      }
    }
  } catch (error) {
    console.error('Error in neuroPhoto callback handler:', error)
    handleButtonError(
      error instanceof Error ? error : new Error(String(error)),
      'neuroPhoto callback handling',
      async () => {
        await ctx.reply(
          isRu
            ? '❌ Произошла ошибка при обработке выбора. Попробуйте снова.'
            : '❌ Error processing selection. Please try again.'
        )
      }
    )
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