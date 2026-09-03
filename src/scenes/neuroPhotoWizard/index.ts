import { MyContext } from '@/interfaces'
import { ModelUrl, UserModel, ModelTraining } from '@/interfaces'
import { supabase } from '@/core/supabase'

import { generateNeuroPhotoHybrid } from '@/services/generateNeuroPhotoHybrid'
import {
  getActiveUserModelsByType,
  getReferalsCountAndUserData,
  getUserData,
  getAspectRatio,
} from '@/core/supabase'
import { logger } from '@/utils/logger'
// ✅ ИМПОРТИРУЕМ НОВУЮ ФУНКЦИЮ ДЛЯ HAIM GROUP MEDIA
import { getActiveUserModelsByTypeForHaim } from '@/core/supabase/getActiveUserModelsByTypeForHaim'
import {
  sendGenericErrorMessage,
  sendPhotoDescriptionRequest,
} from '@/navigation'
import {
  getButtonTextsByMode,
  createMainMenuKeyboard,
  handleHelpCancel,
  getMainMenuText,
} from '@/navigation'
import { Scenes, Markup } from 'telegraf'
import { getUserInfo } from '@/handlers/getUserInfo'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
// import { handleMenu } from '@/handlers' // ❌ REMOVED: handleMenu не экспортируется из handlers/index.ts
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

    // ✅ КРИТИЧНО ИСПРАВЛЕНО: Используем ctx.botInfo?.username для точного определения бота
    const { getBotNameByUsername, getBotNameByToken } = await import(
      '@/core/bot'
    )
    let bot_name: string
    if (ctx.botInfo?.username) {
      const usernameResult = getBotNameByUsername(ctx.botInfo.username)
      bot_name =
        usernameResult.bot_name ||
        getBotNameByToken(ctx.telegram.token).bot_name
    } else {
      bot_name = getBotNameByToken(ctx.telegram.token).bot_name
    }
    console.log(
      `🤖 Определен бот: ${bot_name} для пользователя ${telegramId} (username: ${ctx.botInfo?.username})`
    )

    // ✅ ИСПОЛЬЗУЕМ НОВУЮ ФУНКЦИЮ ДЛЯ HAIM GROUP MEDIA, ИНАЧЕ СТАНДАРТНУЮ
    let userModels: ModelTraining[] | null = null

    if (bot_name === 'HaimGroupMedia_bot') {
      console.log('🎯 Используем расширенную функцию для HaimGroupMedia_bot')
      userModels = await getActiveUserModelsByTypeForHaim(
        Number(telegramId),
        'replicate', // 🔧 ИСПРАВЛЕНО: Получаем только replicate модели
        bot_name
      )
    } else {
      console.log('🔧 Используем стандартную функцию для обычного бота')
      userModels = await getActiveUserModelsByType(
        Number(telegramId),
        'replicate' // 🔧 ИСПРАВЛЕНО: Получаем только replicate модели
      )
    }

    // ✅ ЕСЛИ НЕТ REPLICATE МОДЕЛЕЙ, ПОЛУЧАЕМ ВСЕ ОСТАЛЬНЫЕ (FAL И Т.Д.)
    if (!userModels || userModels.length === 0) {
      console.log('🔍 Нет replicate моделей, проверяем модели других API...')
      // Получаем ВСЕ модели пользователя (включая Fal и другие)
      const { data: allModels, error } = await supabase
        .from('model_trainings')
        .select('*')
        .eq('telegram_id', Number(telegramId))
        .eq('status', 'SUCCESS')
        .neq('api', 'replicate') // Все кроме replicate
        .order('created_at', { ascending: false })

      if (error) {
        console.error('❌ Ошибка при получении моделей:', error)
      } else {
        userModels = allModels as ModelTraining[]
        console.log(
          `✅ Найдено ${userModels?.length || 0} моделей других API (Fal и т.д.)`
        )
      }
    }

    const { subscriptionType } = await getReferalsCountAndUserData(telegramId)

    if (!userModels || userModels.length === 0) {
      // «Моделей нет» — не вся правда, если обучение шло и застряло. У
      // @Ludmila две записи висят в running с июля 2025; она заплатила 1210
      // звёзд и видела только это сообщение. Скажем прямо, что застряло.
      const { getStuckTrainings, stuckTrainingsMessage } = await import(
        '@/core/supabase/getStuckTrainings'
      )
      const stuck = await getStuckTrainings(telegramId)

      await ctx.reply(
        (isRu
          ? '❌ У вас нет обученных моделей для нейрофото.\n\nИспользуйте команду "🤖 Цифровое тело аватара", в главном меню, чтобы создать свою ИИ модель для генерации нейрофото с вашим лицом. '
          : "❌ You don't have any trained models for neurophotos.\n\nUse the '🤖  Digital avatar body' command in the main menu to create your AI model for generating neurophotos with your face.") +
          (stuck.length ? '\n\n' + stuckTrainingsMessage(stuck, isRu) : '')
      )

      // ✅ ИСПРАВЛЕНО: Используем CancelButtonService для правильного показа меню
      const { CancelButtonService } = await import('@/navigation')
      await CancelButtonService.executeMainMenu(ctx)
      return
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
    await sendGenericErrorMessage(ctx, isRu)
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
      // ✅ ИСПРАВЛЕНО: Используем CancelButtonService для правильного показа меню
      const { CancelButtonService } = await import('@/navigation')
      await CancelButtonService.executeMainMenu(ctx)
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
    console.log(
      `🔍 [DEBUG] fullPrompt сформирован: ${fullPrompt.substring(0, 100)}...`
    )

    console.log('🚀 [DEBUG] Начинаем вызов generateNeuroPhotoHybrid')
    const isRu = isRussianFromState(ctx)

    // In-flight guard (same shape as the sibling wizards). This step stays put
    // until the await below resolves, so a second prompt sent during the
    // ~10-30s generation re-entered it and started a second PAID generation —
    // a double charge and two images from one intended request. Reject before
    // set, set synchronously (no await between the check and the set), release
    // in finally. neuroPhotoInProgress was already declared on the session
    // interface but never wired here.
    if (ctx.session.neuroPhotoInProgress) {
      await ctx.reply(
        isRu
          ? '⏳ Уже генерирую нейрофото, подождите немного...'
          : '⏳ Already generating a neurophoto, please wait a moment...'
      )
      return
    }
    ctx.session.neuroPhotoInProgress = true

    try {
      // ГЕНЕРИРУЕМ СРАЗУ 1 ИЗОБРАЖЕНИЕ КАК БЫЛО РАНЬШЕ!
      // ✅ ВОССТАНОВЛЕНО: Получаем aspect ratio пользователя (как в рабочей версии 63eaeb6fc)
      const userAspectRatio = await getAspectRatio(userId || 0)
      console.log(`🔍 [DEBUG] aspectRatio пользователя: ${userAspectRatio}`)

      // ✅ КРИТИЧНО ИСПРАВЛЕНО: Используем ctx.botInfo?.username для точного определения бота
      const { getBotNameByUsername, getBotNameByToken } = await import(
        '@/core/bot'
      )
      let bot_name: string
      if (ctx.botInfo?.username) {
        const usernameResult = getBotNameByUsername(ctx.botInfo.username)
        bot_name =
          usernameResult.bot_name ||
          getBotNameByToken(ctx.telegram.token).bot_name
      } else {
        bot_name = getBotNameByToken(ctx.telegram.token).bot_name
      }
      console.log(
        `🔍 [DEBUG] Определен bot_name: ${bot_name} для username: ${ctx.botInfo?.username}`
      )

      const result = await generateNeuroPhotoHybrid(
        fullPrompt,
        model_url as any,
        1,
        userId?.toString() ?? '',
        ctx,
        bot_name,
        userAspectRatio
      )
      console.log('✅ [DEBUG] generateNeuroPhotoHybrid завершен:', result)

      // ✅ ПРОВЕРЯЕМ РЕЗУЛЬТАТ: Показываем сообщение только если генерация успешна
      if (!result || !result.success) {
        console.log('❌ [DEBUG] Генерация не удалась, результат:', result)
        // Сообщение об ошибке уже отправлено в generateNeuroPhotoHybrid или generateNeuroPhotoDirect
        return ctx.scene.leave()
      }

      // ✅ ТОЛЬКО ЕСЛИ ГЕНЕРАЦИЯ УСПЕШНА: Показываем кнопки для дополнительной генерации
      console.log(
        '🔄 [DEBUG] Генерация успешна, показываем кнопки для дополнительной генерации'
      )

      const additionalGenerationKeyboard = {
        reply_markup: {
          keyboard: [
            [{ text: '1️⃣' }, { text: '2️⃣' }, { text: '3️⃣' }, { text: '4️⃣' }],
            [
              { text: isRu ? '🆕 Новый промпт' : '🆕 New prompt' },
              { text: isRu ? '⬆️ Улучшить промпт' : '⬆️ Improve prompt' },
            ],
            [
              { text: isRu ? '📐 Изменить размер' : '📐 Change size' },
              { text: getMainMenuText(isRu) },
            ],
          ],
          resize_keyboard: true,
          one_time_keyboard: false,
        },
      }

      await ctx.reply(
        isRu
          ? '✨ Нейрофото сгенерировано! Выберите количество дополнительных изображений или используйте другие опции:'
          : '✨ Neurophoto generated! Choose the number of additional images or use other options:',
        additionalGenerationKeyboard
      )

      // Переходим к следующему шагу для обработки кнопок
      ctx.wizard.next()
      return
    } catch (error) {
      console.error('❌ [DEBUG] Ошибка в generateNeuroPhotoHybrid:', error)
      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка при генерации изображения. Попробуйте позже.'
          : '❌ Error occurred during image generation. Please try again later.'
      )
      return ctx.scene.leave()
    } finally {
      ctx.session.neuroPhotoInProgress = false
    }
  }
}

const neuroPhotoButtonStep = async (ctx: MyContext) => {
  console.log('CASE 3: neuroPhotoButtonStep')
  console.log('🔔 [BUTTON STEP] neuroPhotoButtonStep вызван', {
    telegramId: ctx.from?.id,
    hasMessage: !!ctx.message,
    messageType: ctx.message && 'text' in ctx.message ? 'text' : 'other',
  })
  logger.info({
    message: '🔔 [BUTTON STEP] neuroPhotoButtonStep вызван',
    description: 'neuroPhotoButtonStep called',
    telegramId: ctx.from?.id,
    hasMessage: !!ctx.message,
    messageType: ctx.message && 'text' in ctx.message ? 'text' : 'other',
  })

  if (ctx.message && 'text' in ctx.message) {
    const text = ctx.message.text
    console.log(`CASE: Нажата кнопка ${text}`)
    logger.info({
      message: '🔔 [BUTTON STEP] Нажата кнопка',
      description: 'Button pressed',
      text,
      telegramId: ctx.from?.id,
    })
    // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
    const isRu = isRussianFromState(ctx)

    // ✅ КРИТИЧНО: Проверка "Главное меню" ДО всех остальных проверок
    if (text === getMainMenuText(isRu)) {
      console.log('CASE: Главное меню - выход из сцены')
      logger.info({
        message: '🏠 [BUTTON STEP] Главное меню - выход из сцены',
        telegramId: ctx.from?.id,
      })
      await ctx.scene.leave()
      const { showMainMenu } = await import('@/navigation')
      await showMainMenu(ctx)
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

    // ✅ ВОССТАНОВЛЕНО: Обработка кнопок 1️⃣,2️⃣,3️⃣,4️⃣ и чисел 1,2,3,4 (как в рабочей версии 63eaeb6fc)
    if (!['1️⃣', '2️⃣', '3️⃣', '4️⃣', '1', '2', '3', '4'].includes(text)) {
      console.log(
        `⚠️ [DEBUG] Неизвестный ввод в neuroPhotoButtonStep: "${text}"`
      )
      // ✅ ИСПРАВЛЕНО: Используем CancelButtonService для правильного показа меню
      const { CancelButtonService } = await import('@/navigation')
      await CancelButtonService.executeMainMenu(ctx)
      return
    }

    // Определяем количество изображений
    let numImages: number
    if (['1️⃣', '2️⃣', '3️⃣', '4️⃣'].includes(text)) {
      numImages = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'].indexOf(text) + 1
    } else {
      numImages = parseInt(text, 10)
    }

    console.log(
      `🔍 [DEBUG] Парсинг кнопки: text="${text}", numImages=${numImages}`
    )

    // Validate at the boundary: the buttons offer 1-4, so a TYPED value outside
    // that (0, negative, NaN from non-numeric text, or huge) is invalid. This
    // mirrors the sibling neuroCoderScene check; downstream generateNeuroPhotoHybrid
    // also rejects <= 0, but the wizard should not pass a bad count that far.
    const allowedNumImages = [1, 2, 3, 4]
    if (isNaN(numImages) || !allowedNumImages.includes(numImages)) {
      await ctx.reply(
        isRu
          ? '❌ Пожалуйста, выберите число изображений: 1, 2, 3 или 4.'
          : '❌ Please choose the number of images: 1, 2, 3, or 4.'
      )
      return
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
      // ✅ ИСПРАВЛЕНО: Используем CancelButtonService для правильного показа меню
      const { CancelButtonService } = await import('@/navigation')
      await CancelButtonService.executeMainMenu(ctx)
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

      // ✅ ВОССТАНОВЛЕНО: Получаем aspect ratio пользователя (как в рабочей версии 63eaeb6fc)
      const userAspectRatio = await getAspectRatio(userId || 0)
      console.log(`🔍 [DEBUG] aspectRatio пользователя: ${userAspectRatio}`)

      // ✅ КРИТИЧНО ИСПРАВЛЕНО: Используем ctx.botInfo?.username для точного определения бота
      const { getBotNameByUsername, getBotNameByToken } = await import(
        '@/core/bot'
      )
      let bot_name: string
      if (ctx.botInfo?.username) {
        const usernameResult = getBotNameByUsername(ctx.botInfo.username)
        bot_name =
          usernameResult.bot_name ||
          getBotNameByToken(ctx.telegram.token).bot_name
      } else {
        bot_name = getBotNameByToken(ctx.telegram.token).bot_name
      }
      console.log(
        `🔍 [DEBUG] Определен bot_name: ${bot_name} для username: ${ctx.botInfo?.username}`
      )

      console.log(
        '🚀 [DEBUG] Начинаем вызов generateNeuroPhotoHybrid из ButtonStep'
      )
      const result = await generateNeuroPhotoHybrid(
        fullPrompt,
        ctx.session.userModel.model_url as any,
        num,
        userId?.toString() ?? '',
        ctx,
        bot_name,
        userAspectRatio
      )

      console.log(
        '✅ [DEBUG] generateNeuroPhotoHybrid завершен из ButtonStep:',
        result
      )

      logger.info({
        message: '🔔 [BUTTON STEP] generateNeuroPhotoHybrid завершен',
        description: 'generateNeuroPhotoHybrid completed',
        telegramId: ctx.from?.id,
        result: result
          ? {
              success: result.success,
              hasUrls: !!result.urls,
              urlsCount: result.urls?.length,
            }
          : null,
      })

      // ✅ ПРОВЕРЯЕМ РЕЗУЛЬТАТ: Показываем сообщение только если генерация успешна
      if (!result || !result.success) {
        console.log(
          '❌ [DEBUG] Генерация не удалась в ButtonStep, результат:',
          result
        )
        logger.warn({
          message: '❌ [BUTTON STEP] Генерация не удалась',
          description: 'Generation failed',
          telegramId: ctx.from?.id,
          result,
        })
        // Сообщение об ошибке уже отправлено в generateNeuroPhotoHybrid или generateNeuroPhotoDirect
        return
      }

      // ✅ ТОЛЬКО ЕСЛИ ГЕНЕРАЦИЯ УСПЕШНА: Показываем кнопки для дополнительной генерации
      console.log(
        '🔄 [DEBUG] Генерация успешна в ButtonStep, показываем кнопки'
      )

      logger.info({
        message: '🔔 [BUTTON STEP] Генерация успешна, показываем кнопки',
        description: 'Generation successful, showing buttons',
        telegramId: ctx.from?.id,
        urlsCount: result.urls?.length,
      })

      const additionalGenerationKeyboard = {
        reply_markup: {
          keyboard: [
            [
              { text: isRu ? '1️⃣' : '1️⃣' },
              { text: isRu ? '2️⃣' : '2️⃣' },
              { text: isRu ? '3️⃣' : '3️⃣' },
              { text: isRu ? '4️⃣' : '4️⃣' },
            ],
            [
              { text: isRu ? '🆕 Новый промпт' : '🆕 New prompt' },
              { text: getMainMenuText(isRu) },
            ],
          ],
          resize_keyboard: true,
        },
      }

      await ctx.reply(
        isRu
          ? '✨ Нейрофото сгенерировано! Выберите количество дополнительных изображений или используйте другие опции:'
          : '✨ Neurophoto generated! Choose the number of additional images or use other options:',
        additionalGenerationKeyboard
      )
    }

    // ✅ numImages уже проверен выше, просто вызываем генерацию
    // In-flight guard (same shape as the sibling wizards): this step stays put
    // for repeat taps, so a second number tap during a generation charged
    // twice. Reject before set, set synchronously, release in finally.
    if (ctx.session.neuroPhotoInProgress) {
      await ctx.reply(
        isRu
          ? '⏳ Уже генерирую нейрофото, подождите немного...'
          : '⏳ Already generating a neurophoto, please wait a moment...'
      )
      return
    }
    ctx.session.neuroPhotoInProgress = true
    try {
      await generate(numImages)
    } finally {
      ctx.session.neuroPhotoInProgress = false
    }
    // ✅ НЕ ВЫХОДИМ ИЗ СЦЕНЫ - остаемся для дополнительной генерации
    return
  } else {
    console.log(
      'CASE: Нетекстовый или отсутствующий ввод в neuroPhotoButtonStep, показ главного меню и выход из сцены'
    )
    // ✅ ИСПРАВЛЕНО: Используем CancelButtonService для правильного показа меню
    const { CancelButtonService } = await import('@/navigation')
    await CancelButtonService.executeMainMenu(ctx)
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
  console.log('🔄 [CALLBACK] Received callback_query in neuroPhotoWizard')

  if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
    console.log('⚠️ [CALLBACK] Invalid callback_query structure')
    // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
    const isRuLocal = isRussianFromState(ctx)
    const message = isRuLocal
      ? 'Произошла ошибка ответа от кнопки'
      : 'Button callback error'
    return ctx.answerCbQuery(message)
  }

  const callbackData = ctx.callbackQuery.data
  console.log(`🔄 [CALLBACK] Processing callback_data: ${callbackData}`)

  // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
  const isRu = isRussianFromState(ctx)

  await ctx.answerCbQuery()

  // ✅ ОБРАБОТКА КНОПОК РЕЗУЛЬТАТОВ НЕЙРОФОТО
  if (callbackData === 'new_neurophoto_prompt') {
    console.log('🔄 [CALLBACK] Новый промпт - возврат к началу сцены')
    ctx.session.prompt = undefined
    ctx.wizard.selectStep(0)
    return neuroPhotoConversationStep(ctx)
  }

  if (callbackData === 'improve_prompt') {
    console.log('🔄 [CALLBACK] Улучшить промпт')
    await ctx.scene.enter(ModeEnum.ImprovePromptWizard)
    return
  }

  if (callbackData === 'change_size') {
    console.log('🔄 [CALLBACK] Изменить размер')
    await ctx.scene.enter(ModeEnum.SizeWizard)
    return
  }

  if (callbackData === 'go_main_menu') {
    console.log('🔄 [CALLBACK] Главное меню')
    // ✅ ИСПРАВЛЕНО: Используем CancelButtonService для правильного показа меню
    const { CancelButtonService } = await import('@/navigation')
    await CancelButtonService.executeMainMenu(ctx)
    return
  }

  if (callbackData === 'upscale_neurophoto_image') {
    console.log('🔄 [CALLBACK] Увеличить качество')
    // TODO: Добавить обработку upscale
    await ctx.reply(
      isRu
        ? 'Функция увеличения качества будет добавлена в ближайшее время.'
        : 'Upscale feature will be added soon.'
    )
    return
  }

  if (callbackData === 'cancel_neuro_photo') {
    console.log('🔄 [CALLBACK] Отмена - используем CancelButtonService')
    // ✅ ИСПРАВЛЕНО: Используем CancelButtonService для правильного показа меню
    const { CancelButtonService } = await import('@/navigation')
    await CancelButtonService.executeCancel(
      ctx,
      isRu
        ? 'Отменено. Возвращаю в главное меню.'
        : 'Cancelled. Returning to main menu.'
    )
    return
  } else if (callbackData.startsWith('select_neuro_model_')) {
    console.log(`🔄 [CALLBACK] Processing select_neuro_model: ${callbackData}`)
    let modelId = callbackData.replace('select_neuro_model_', '')

    // ✅ ОБРАБАТЫВАЕМ ОБЩИЕ МОДЕЛИ (УБИРАЕМ ПРЕФИКС shared_)
    const isSharedModel = modelId.startsWith('shared_')
    if (isSharedModel) {
      modelId = modelId.replace('shared_', '')
    }

    console.log(`🔍 [CALLBACK] Looking for model with ID: ${modelId}`)
    const userModels = (ctx.scene.state as NeuroPhotoWizardSession).userModels
    console.log(
      `📋 [CALLBACK] Available models in state:`,
      userModels?.map(m => ({ id: m.id, model_name: m.model_name }))
    )

    const selectedModel = userModels?.find(
      model => model.id.toString() === modelId
    )

    if (selectedModel) {
      console.log(
        `✅ [CALLBACK] Model found: ${selectedModel.model_name} (${selectedModel.id})`
      )
      ctx.session.userModel = selectedModel as UserModel
      await sendPhotoDescriptionRequest(ctx, isRu, ModeEnum.NeuroPhoto)
      const isCancel = await handleHelpCancel(ctx)
      if (isCancel) {
        return ctx.scene.leave()
      }
      ctx.wizard.next()
    } else {
      console.log(`❌ [CALLBACK] Model not found for ID: ${modelId}`)
      await ctx.reply(
        isRu
          ? '❌ Модель не найдена. Попробуйте снова.'
          : '❌ Model not found. Please try again.'
      )
    }
  } else {
    console.log(`⚠️ [CALLBACK] Unknown callback_data: ${callbackData}`)
  }
})

// ✅ ОБРАБАТЫВАЕМ УНИВЕРСАЛЬНЫЕ КОМАНДЫ ВОКРУГ СЦЕНЫ (МЕНЮ, HELP И Т.Д.)
neuroPhotoWizard.command('menu', async ctx => {
  // ✅ ИСПРАВЛЕНО: Используем CancelButtonService для правильного показа меню
  const { CancelButtonService } = await import('@/navigation')
  await CancelButtonService.executeMainMenu(ctx)
  return
})

neuroPhotoWizard.command('help', async ctx => {
  // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
  const isRu = isRussianFromState(ctx)
  await ctx.reply(
    isRu
      ? 'Это сцена создания нейрофото. Введите описание на английском языке для генерации.'
      : 'This is the neurophoto creation scene. Enter a description in English to generate.'
  )
})
