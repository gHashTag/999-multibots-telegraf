import { MyContext } from '@/interfaces'
import { ModelUrl, UserModel, ModelTraining } from '@/interfaces'

import { generateNeuroImage } from '@/services/generateNeuroImage'
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
  createHelpCancelKeyboard,
} from '@/menu'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { Scenes } from 'telegraf'
import { handleMenu } from '@/handlers'
import { ModeEnum } from '@/interfaces/modes'
import logger from '@/utils/logger'
// ✅ ИМПОРТИРУЕМ getBotNameByToken ДЛЯ ОПРЕДЕЛЕНИЯ ТЕКУЩЕГО БОТА
import { getBotNameByToken } from '@/core/bot'

interface NeuroPhotoWizardSession extends Scenes.WizardSessionData {
  userModels?: ModelTraining[]
}

const neuroPhotoConversationStep = async (ctx: MyContext) => {
  const telegramId = ctx.from?.id?.toString() || 'unknown'
  logger.debug('Starting neuroPhotoConversationStep', {
    telegramId,
    step: ctx.session.__scenes?.cursor || 0,
    prompt: ctx.session.prompt,
    initialized: ctx.session.neuroPhotoInitialized || false,
  })
  logger.info({
    message: 'Starting conversation step',
    telegramId,
    step: 0,
    action: 'conversation_step',
    sessionStep: ctx.session.__scenes?.cursor || 0,
    sessionState: JSON.stringify({
      prompt: ctx.session.prompt,
      initialized: ctx.session.neuroPhotoInitialized,
    }),
  })

  // Начало конверсации - получаем модели пользователя
  try {
    const isRussian = ctx.from?.language_code === 'ru'

    // ✅ ОПРЕДЕЛЯЕМ ТЕКУЩИЙ БОТ
    const botToken = ctx.telegram.token
    const { bot_name } = getBotNameByToken(botToken)
    logger.debug('Bot determined', { telegramId, botName: bot_name })

    // ✅ ИСПОЛЬЗУЕМ НОВУЮ ФУНКЦИЮ ДЛЯ HAIM GROUP MEDIA, ИНАЧЕ СТАНДАРТНУЮ
    let userModels: ModelTraining[] | null = null

    if (bot_name === 'HaimGroupMedia_bot') {
      logger.debug('Using extended function for HaimGroupMedia_bot', { telegramId })
      userModels = await getActiveUserModelsByTypeForHaim(
        Number(telegramId),
        'replicate',
        bot_name
      )
    } else {
      logger.debug('Using standard function for regular bot', { telegramId })
      userModels = await getActiveUserModelsByType(
        Number(telegramId),
        'replicate'
      )
    }

    logger.info({
      message: 'Models loaded from database',
      telegramId,
      modelsCount: userModels?.length || 0,
      botName: bot_name,
      modelsData: userModels?.map(m => ({ 
        id: m.id, 
        name: m.model_name || 'NO_NAME', 
        created_at: m.created_at,
        status: m.status,
        steps: m.steps
      })) || []
    })

    const { subscriptionType } = await getReferalsCountAndUserData(telegramId)

    if (!userModels || userModels.length === 0) {
      logger.warn('No user models found', { telegramId })
      logger.info({
        message: 'No user models found',
        telegramId,
      })

      await ctx.reply(
        isRussian
          ? `❌ У вас нет обученных моделей для нейрофото.

Используйте команду "🤖 Цифровое тело аватара", в главном меню, чтобы создать свою ИИ модель для генерации нейрофото с вашим лицом.`
          : `❌ You don't have any trained models for neurophotos.

Use the '🤖 Digital avatar body' command in the main menu to create your AI model for generating neurophotos with your face.`,
        { parse_mode: 'HTML' }
      )
      return ctx.scene.leave()
    } else if (userModels.length === 1) {
      // Если модель одна - используем её сразу
      ctx.session.userModel = userModels[0] as any
      logger.debug('Single model selected automatically', { 
        telegramId, 
        modelName: userModels[0].model_name,
        modelId: userModels[0].id,
        modelUrl: userModels[0].model_url,
        triggerWord: userModels[0].trigger_word
      })
      logger.info({
        message: 'Single model found, proceeding directly',
        telegramId,
        modelName: userModels[0].model_name,
        modelId: userModels[0].id
      })
    } else {
      // Если моделей несколько - показываем выбор
      ;(ctx.scene.state as NeuroPhotoWizardSession).userModels = userModels
      
      logger.debug('Multiple models found, showing selection', { 
        telegramId, 
        modelsCount: userModels.length,
        models: userModels.map(m => ({ id: m.id, name: m.model_name, created_at: m.created_at }))
      })
      logger.info({
        message: 'Multiple models found, showing selection interface',
        telegramId,
        modelsCount: userModels.length,
        modelsInfo: userModels.map(m => ({ 
          id: m.id, 
          name: m.model_name || 'no name', 
          created_at: m.created_at 
        }))
      })

      const modelButtons = userModels.map((model, index) => {
        let buttonText = `${index + 1}. `
        const dateString = new Date(model.created_at).toLocaleDateString(
          isRussian ? 'ru-RU' : 'en-US'
        )

        // Если нет имени модели - показываем дату
        let modelDisplayName = ''
        if (model.model_name && model.model_name.trim() !== '') {
          modelDisplayName = model.model_name
        } else {
          modelDisplayName = isRussian ? `Модель ${dateString}` : `Model ${dateString}`
        }

        buttonText += modelDisplayName
        
        // Добавляем количество шагов если есть
        if (model.steps && model.steps > 0) {
          buttonText += isRussian ? `, ${model.steps} шагов` : `, ${model.steps} steps`
        }

        logger.debug('Model button created', {
          telegramId,
          modelId: model.id,
          originalName: model.model_name,
          displayName: modelDisplayName,
          buttonText,
          steps: model.steps
        })

        return [
          { text: buttonText, callback_data: `select_neuro_model_${model.id}` },
        ]
      })

      await ctx.reply(
        isRussian
          ? `🎨 <b>Выберите модель для создания нейрофото:</b>`
          : `🎨 <b>Select a model to create neural photo:</b>`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: modelButtons,
          },
        }
      )
      return // Ждем выбора модели
    }

    // Если есть модель (одна или выбрана) - продолжаем
    if (
      !ctx.session.userModel ||
      !ctx.session.userModel.model_url ||
      !ctx.session.userModel.trigger_word
    ) {
      logger.error('Model data incomplete', { telegramId })
      logger.error({
        message: 'User model incomplete after selection',
        telegramId,
        userModel: ctx.session.userModel ? 'exists_but_incomplete' : 'missing',
      })

      await ctx.reply(
        isRussian
          ? `⚠️ У вас нет доступной модели для нейрофото.
Создайте свою модель или воспользуйтесь другими функциями бота.`
          : `⚠️ You don't have an available model for neural photos.
Create your model or use other bot functions.`,
        { parse_mode: 'HTML' }
      )
      return await ctx.scene.leave()
    }

    // Если модель есть, логируем информацию
    logger.debug('User model found', {
      telegramId,
      modelUrl: ctx.session.userModel.model_url,
      triggerWord: ctx.session.userModel.trigger_word,
    })
    logger.info({
      message: 'User model validation successful',
      telegramId,
      modelUrl: ctx.session.userModel.model_url,
      triggerWord: ctx.session.userModel.trigger_word,
      isInitialized: ctx.session.neuroPhotoInitialized === true,
    })

    // Если уже есть промпт и сцена инициализирована, сразу переходим к шагу промпта
    if (ctx.session.prompt && ctx.session.neuroPhotoInitialized === true) {
      logger.debug('Prompt already exists, proceeding to step 1', {
        telegramId,
        prompt: ctx.session.prompt,
      })
      logger.info({
        message: 'Transitioning to prompt step with existing prompt',
        telegramId,
        prompt: ctx.session.prompt,
        action: 'skip_to_prompt_step',
      })

      ctx.wizard.next()
      return await neuroPhotoPromptStep(ctx)
    }

    // Отмечаем, что сцена инициализирована
    ctx.session.neuroPhotoInitialized = true
    logger.debug('Scene initialization successful', { telegramId })
    logger.info({
      message: 'Scene ready to receive prompt',
      telegramId,
    })

    // Проверяем, есть ли текст в сообщении пользователя
    if (
      ctx.message &&
      'text' in ctx.message &&
      ctx.message.text !== '📸 Нейрофото'
    ) {
      logger.debug('Received text from user', {
        telegramId,
        text: ctx.message.text,
      })
      logger.info({
        message: 'Text received from user',
        telegramId,
        text: ctx.message.text,
      })

      // Сохраняем текст как промпт
      ctx.session.prompt = ctx.message.text
      logger.debug('Prompt saved', {
        telegramId,
        prompt: ctx.session.prompt,
      })
      logger.info({
        message: 'Saving prompt',
        telegramId,
        prompt: ctx.session.prompt,
      })

      // Переходим к шагу промпта
      ctx.wizard.next()
      return await neuroPhotoPromptStep(ctx)
    } else if (
      ctx.message &&
      'text' in ctx.message &&
      ctx.message.text === '📸 Нейрофото'
    ) {
      logger.debug('Menu command received, waiting for next message', {
        telegramId,
        text: ctx.message.text,
      })
      logger.info({
        message: 'Menu command received, awaiting prompt input',
        telegramId,
        text: ctx.message.text,
      })
    }

    // Отправляем сообщение с инструкцией по использованию
    logger.debug('Sending welcome message', { telegramId })
    logger.info({
      message: 'Sending instructions to user',
      telegramId,
      action: 'send_welcome_message',
    })

    await ctx.reply(
      isRussian
        ? `🎨 <b>Создание Hейрофото</b>

Опишите <b>НА АНГЛИЙСКОМ ЯЗЫКЕ</b>, что вы хотите изобразить. Например:
- portrait of a girl in anime style
- man in a space suit
- fantastic landscape with dragons

<i>Нейросеть создаст изображение на основе вашего запроса с использованием вашей персональной модели. Для лучших результатов используйте английский язык!</i>`
        : `🎨 <b>Creating Neural Photo</b>

Describe what you want to depict. For example:
- anime-style portrait of a girl
- cat in a space suit
- fantastic landscape with dragons

<i>The neural network will create an image based on your request using your personal model.</i>`,
      {
        parse_mode: 'HTML',
        reply_markup: createHelpCancelKeyboard(isRussian).reply_markup,
      }
    )

    logger.debug('Waiting for user prompt input', { telegramId })
    logger.info({
      message: 'Waiting for prompt from user',
      telegramId,
      action: 'waiting_for_prompt',
    })

    return
  } catch (error: any) {
    logger.error('Error in neuroPhotoConversationStep', {
      telegramId,
      error: error.message,
      stack: error.stack,
    })
    logger.error({
      message: 'Error in conversation step',
      telegramId,
      error: error.message,
      stack: error.stack,
    })

    const isRussian = ctx.from?.language_code === 'ru'
    await ctx.reply(
      isRussian
        ? `❌ Произошла ошибка при обработке запроса. Пожалуйста, попробуйте позже.`
        : `❌ An error occurred while processing the request. Please try again later.`
    )

    return await ctx.scene.leave()
  }
}

const neuroPhotoPromptStep = async (ctx: MyContext) => {
  const telegramId = ctx.from?.id?.toString() || 'unknown'
  logger.debug('Starting neuroPhotoPromptStep', {
    telegramId,
    step: ctx.session.__scenes?.cursor || 0,
    prompt: ctx.session.prompt,
    initialized: ctx.session.neuroPhotoInitialized || false,
  })
  const isRu = ctx.from?.language_code === 'ru'

  logger.info({
    message: 'Starting neuroPhotoPromptStep scene',
    telegramId,
    currentScene: ModeEnum.NeuroPhoto,
    step: 'prompt',
    sessionData: JSON.stringify(ctx.session || {}),
    currentWizardStep: ctx.session.__scenes?.cursor || 0,
  })

  try {
    // Получаем текст промпта из сообщения или из сессии
    let promptText = ''

    // Если есть текущее сообщение с текстом - берем его
    if (ctx.message && 'text' in ctx.message) {
      // Игнорируем команду меню "📸 Нейрофото"
      if (ctx.message.text === '📸 Нейрофото') {
        logger.warn({
          message: 'Menu command received instead of prompt',
          telegramId,
          text: ctx.message.text,
        })

        await ctx.reply(
          isRu
            ? '⚠️ Пожалуйста, введите текстовый промпт для генерации изображения.'
            : '⚠️ Please enter a text prompt for image generation.'
        )

        return // Ожидаем ввода настоящего промпта
      } else {
        promptText = ctx.message.text
        logger.debug('Text prompt received from message', {
          telegramId,
          promptText,
        })
      }
    }
    // Иначе пробуем взять промпт из сессии (но только если это не команда меню)
    else if (ctx.session.prompt && ctx.session.prompt !== '📸 Нейрофото') {
      promptText = ctx.session.prompt
      logger.debug('Text prompt received from session', {
        telegramId,
        promptText,
      })
    }
    // Если промпта нет вообще или это команда меню
    else {
      logger.warn({
        message: 'No prompt text received',
        telegramId,
        result: 'empty_message',
      })

      await ctx.reply(
        isRu
          ? '⚠️ Пожалуйста, введите текстовый промпт для генерации изображения.'
          : '⚠️ Please enter a text prompt for image generation.'
      )

      return // Ожидаем ввода промпта
    }

    // Проверяем пустой ли промпт
    if (promptText.trim() === '') {
      logger.warn({
        message: 'Empty prompt text received',
        telegramId,
        result: 'empty_prompt',
      })

      await ctx.reply(
        isRu
          ? '❌ Промпт не может быть пустым. Пожалуйста, опишите изображение, которое хотите сгенерировать.'
          : '❌ Prompt cannot be empty. Please describe the image you want to generate.'
      )

      return // Ожидаем повторного ввода
    }

    logger.info({
      message: 'Prompt text received',
      telegramId,
      promptLength: promptText.length,
      promptPreview:
        promptText.substring(0, 50) + (promptText.length > 50 ? '...' : ''),
    })

    // Проверяем на команду отмены
    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      logger.info({
        message: 'Operation cancelled by user',
        telegramId,
        action: 'leaving_scene',
      })
      return ctx.scene.leave()
    }

    // Проверяем наличие модели в сессии
    if (
      !ctx.session.userModel ||
      !ctx.session.userModel.model_url ||
      !ctx.session.userModel.trigger_word
    ) {
      logger.error({
        message: 'Model data missing in session',
        telegramId,
        userModel: ctx.session.userModel ? 'exists_but_incomplete' : 'missing',
        modelUrl: ctx.session.userModel?.model_url || 'missing',
        triggerWord: ctx.session.userModel?.trigger_word || 'missing',
      })

      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка: данные о модели не найдены. Пожалуйста, вернитесь в главное меню и попробуйте снова.'
          : '❌ An error occurred: model data not found. Please return to the main menu and try again.'
      )

      return ctx.scene.leave()
    }

    // Сохраняем промпт в сессии
    ctx.session.prompt = promptText

    const model_url = ctx.session.userModel.model_url as ModelUrl
    const trigger_word = ctx.session.userModel.trigger_word as string

    logger.info({
      message: 'Image generation data prepared',
      telegramId,
      prompt: promptText,
      hasModelUrl: !!model_url,
      hasTriggerWord: !!trigger_word,
    })

    const userId = ctx.from?.id
    if (!userId) {
      logger.error({
        message: 'User ID not found',
        telegramId: 'unknown',
        result: 'missing_user_id',
      })

      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка: не удалось определить ID пользователя.'
          : '❌ An error occurred: could not determine user ID.'
      )

      return ctx.scene.leave()
    }

    // --- Получаем данные пользователя для определения пола ---
    const userData = await getUserData(userId.toString())
    let genderPromptPart = 'person' // Default
    if (userData?.gender === 'female') {
      genderPromptPart = 'female'
    } else if (userData?.gender === 'male') {
      genderPromptPart = 'male'
    }
    logger.info({
      message: 'Gender determined for prompt',
      telegramId: userId.toString(),
      gender: userData?.gender || 'not_set',
      genderPromptPart,
    })

    // Формируем полный промпт с trigger_word и полом
    const fullPrompt = `Fashionable ${trigger_word} ${genderPromptPart}, ${promptText}`
    logger.info({
      message: 'Starting image generation',
      telegramId,
      fullPrompt,
      userId: userId.toString(),
    })

    // Отправляем сообщение о начале генерации
    const processingMessage = await ctx.reply(
      isRu
        ? '⏳ Начинаю генерацию изображения. Это может занять некоторое время...'
        : '⏳ Starting image generation. This may take some time...'
    )

    // Устанавливаем таймер для обновления сообщения о процессе
    const progressInterval = setInterval(async () => {
      try {
        await ctx.telegram.editMessageText(
          ctx.chat?.id,
          processingMessage.message_id,
          undefined,
          isRu
            ? '⏳ Генерация изображения в процессе... Пожалуйста, подождите.'
            : '⏳ Image generation in progress... Please wait.'
        )
      } catch (e) {
        // Игнорируем ошибки обновления статуса
      }
    }, 10000) // Обновляем каждые 10 секунд

    try {
      // Генерация изображения
      await generateNeuroImage(
        fullPrompt,
        model_url as `${string}/${string}:${string}`,
        1,
        userId.toString(),
        ctx,
        ctx.botInfo?.username
      )

      // Останавливаем интервал
      clearInterval(progressInterval)
      if (!ctx.chat?.id) {
        logger.error('Chat ID not found', { telegramId })
        return
      }
      if (!processingMessage.message_id) {
        logger.error('Processing message ID not found', { telegramId })
        return
      }
      // Удаляем сообщение о прогрессе
      try {
        await ctx.telegram.deleteMessage(
          ctx.chat?.id,
          processingMessage.message_id
        )
      } catch (e) {
        // Игнорируем ошибки удаления сообщения
      }

      logger.info({
        message: 'Image generation completed, proceeding to next step',
        telegramId,
        nextStep: 'neuroPhotoButtonStep',
        result: 'success',
      })

      ctx.wizard.next()
      return neuroPhotoButtonStep(ctx)
    } catch (generateError) {
      // Останавливаем интервал в случае ошибки
      clearInterval(progressInterval)
      if (!ctx.chat?.id) {
        logger.error('Chat ID not found', { telegramId })
        return
      }
      if (!processingMessage.message_id) {
        logger.error('Processing message ID not found', { telegramId })
        return
      }
      // Удаляем сообщение о прогрессе
      try {
        await ctx.telegram.deleteMessage(
          ctx.chat?.id,
          processingMessage.message_id
        )
      } catch (e) {
        // Игнорируем ошибки удаления сообщения
      }

      logger.error({
        message: 'Image generation error',
        telegramId,
        error:
          generateError instanceof Error
            ? generateError.message
            : String(generateError),
        stack: generateError instanceof Error ? generateError.stack : undefined,
      })

      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка при генерации изображения. Пожалуйста, попробуйте другой промпт или повторите попытку позже.'
          : '❌ An error occurred during image generation. Please try a different prompt or try again later.'
      )

      // Остаемся на том же шаге, чтобы пользователь мог ввести новый промпт
      return
    }
  } catch (error) {
    // Обработка любых других ошибок
    logger.error({
      message: 'Critical error in neuroPhotoPromptStep',
      telegramId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    await ctx.reply(
      isRu
        ? '❌ Произошла непредвиденная ошибка. Пожалуйста, вернитесь в главное меню и попробуйте снова.'
        : '❌ An unexpected error occurred. Please return to the main menu and try again.'
    )

    return ctx.scene.leave()
  }
}

const neuroPhotoButtonStep = async (ctx: MyContext) => {
  // ---> ДОБАВЛЕНО: Проверка флага
  if (ctx.session.neuroPhotoInProgress) {
    logger.warn({
      message:
        '⏳ [NeuroPhoto] Попытка запустить генерацию, пока предыдущая еще выполняется',
      telegramId: ctx.from?.id?.toString(),
    })
    return // Игнорируем запрос
  }
  // ---<
  const telegramId = ctx.from?.id?.toString() || 'unknown'
  logger.debug('Starting neuroPhotoButtonStep', {
    telegramId,
    step: ctx.session.__scenes?.cursor || 0,
    prompt: ctx.session.prompt,
    initialized: ctx.session.neuroPhotoInitialized || false,
  })
  logger.info({
    message: 'Starting neuroPhotoButtonStep scene',
    telegramId,
    currentScene: ModeEnum.NeuroPhoto,
    step: 'button',
    sessionData: JSON.stringify(ctx.session || {}),
  })

  if (ctx.message && 'text' in ctx.message) {
    const text = ctx.message.text
    logger.info({
      message: `Button pressed: ${text}`,
      telegramId,
      buttonText: text,
    })

    logger.debug('Button pressed', { telegramId, buttonText: text })
    const isRu = ctx.from?.language_code === 'ru'

    if (text === '🆕 Новый промпт' || text === '🆕 New prompt') {
      logger.debug('New prompt button pressed', { telegramId })
      logger.info({
        message: 'Request for new prompt',
        telegramId,
        buttonText: text,
      })
      ctx.session.prompt = undefined
      // Начинаем сначала - сбрасываем состояние
      ctx.session.neuroPhotoInitialized = false
      return neuroPhotoConversationStep(ctx)
    }

    if (text === '⬆️ Улучшить промпт' || text === '⬆️ Improve prompt') {
      logger.debug('Improve prompt button pressed', { telegramId })
      logger.info({
        message: 'Transitioning to improve prompt scene',
        telegramId,
        nextScene: 'improvePromptWizard',
      })
      await ctx.scene.enter('improvePromptWizard', {
        prompt: ctx.session.prompt,
      })
      return
    }

    if (text === '📐 Изменить размер' || text === '📐 Change size') {
      logger.debug('Change size button pressed', { telegramId })
      logger.info({
        message: 'Transitioning to size change scene',
        telegramId,
        nextScene: 'sizeWizard',
      })
      await ctx.scene.enter('sizeWizard')
      return
    }

    if (text === levels[104].title_ru || text === levels[104].title_en) {
      logger.debug('Main menu button pressed', { telegramId })
      logger.info({
        message: 'Request to return to main menu',
        telegramId,
        buttonText: text,
      })
      await handleMenu(ctx)
      return
    }

    const numImages = parseInt(text[0])
    const prompt = ctx.session.prompt
    const userId = ctx.from?.id

    if (!prompt || !ctx.session.userModel || !ctx.session.userModel.model_url) {
      logger.error('Missing generation data', {
        telegramId,
        hasPrompt: !!prompt,
        hasUserModel: !!ctx.session.userModel,
        hasModelUrl: !!ctx.session.userModel?.model_url,
      })
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
      // ---> ДОБАВЛЕНО: Установка флага перед началом
      ctx.session.neuroPhotoInProgress = true
      logger.info({
        message: 'neuroPhotoInProgress flag set to true',
        telegramId: ctx.from?.id?.toString(),
      })
      // ---<
      logger.info({
        message: `Generating ${num} images`,
        telegramId,
        numberOfImages: num,
        prompt: prompt,
      })

      try {
        // Отправляем сообщение о начале генерации
        const processingMessage = await ctx.reply(
          isRu
            ? `⏳ Начинаю генерацию ${num} изображений. Это может занять некоторое время...`
            : `⏳ Starting generation of ${num} images. This may take some time...`
        )
        if (!ctx.chat?.id) {
          logger.error('Chat ID not found', { telegramId })
          return
        }
        if (!ctx.session.userModel.model_url) {
          logger.error('Model URL not found', { telegramId })
          return
        }
        if (!userId) {
          logger.error('User ID not found', { telegramId })
          return
        }

        if (!ctx.botInfo?.username) {
          logger.error('Bot username not found', { telegramId })
          return
        }
        if (!prompt) {
          logger.error('Prompt not found', { telegramId })
          return
        }
        // Генерируем изображения
        await generateNeuroImage(
          prompt,
          ctx.session.userModel.model_url,
          num,
          userId.toString(),
          ctx,
          ctx.botInfo?.username
        )

        // Удаляем сообщение о прогрессе
        try {
          await ctx.telegram.deleteMessage(
            ctx.chat?.id,
            processingMessage.message_id
          )
        } catch (e) {
          // Игнорируем ошибки удаления сообщения
        }

        logger.info({
          message: `Successfully generated ${num} images`,
          telegramId,
          result: 'success',
        })
      } catch (error) {
        logger.error({
          message: `Error generating ${num} images`,
          telegramId,
          error: error instanceof Error ? error.message : String(error),
        })

        await ctx.reply(
          isRu
            ? '❌ Произошла ошибка при генерации изображений. Пожалуйста, попробуйте другой промпт или повторите попытку позже.'
            : '❌ An error occurred during image generation. Please try a different prompt or try again later.'
        )
      } finally {
        // ---> ДОБАВЛЕНО: Сброс флага в finally
        ctx.session.neuroPhotoInProgress = false
        logger.info({
          message: 'neuroPhotoInProgress flag reset to false',
          telegramId: ctx.from?.id?.toString(),
        })
        // ---<
      }
    }

    if (numImages >= 1 && numImages <= 4) {
      logger.info({
        message: `Number of images determined: ${numImages}`,
        telegramId,
        numImages,
      })
      await generate(numImages)
      return ctx.scene.leave()
    } else {
      logger.info({
        message: 'Returning to main menu (unknown command)',
        telegramId,
        buttonText: text,
      })
      const { count, subscriptionType, level } =
        await getReferalsCountAndUserData(ctx.from?.id?.toString() || '')
      await mainMenu({
        isRu,
        subscription: subscriptionType,
        ctx,
      })
    }
  } else {
    logger.info({
      message: 'Non-text input received, returning to main menu',
      telegramId,
    })
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

// Обработчик выбора модели
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
    const telegramId = ctx.from?.id?.toString() || 'unknown'

    try {
      await ctx
        .deleteMessage(ctx.callbackQuery.message?.message_id)
        .catch(e => logger.error('Error deleting message with buttons', { telegramId, error: e }))

      const userModelsFromState = (ctx.scene.state as NeuroPhotoWizardSession)
        .userModels
      if (!userModelsFromState) {
        logger.error('userModels not found in scene state for model selection', { telegramId })
        await ctx.reply(
          isRu
            ? '❌ Произошла ошибка при выборе модели. Попробуйте начать заново.'
            : '❌ An error occurred while selecting the model. Please try again.'
        )
        return ctx.scene.leave()
      }

      // Обрабатываем общие модели (с префиксом shared_)
      let actualModelId = modelId
      if (modelId.startsWith('shared_')) {
        actualModelId = modelId.replace('shared_', '')
      }

      const selectedModel = userModelsFromState?.find(
        m => String(m.id) === String(modelId) || String(m.id) === String(actualModelId)
      )

      if (selectedModel) {
        // Если это общая модель, используем оригинальный ID для запросов к Replicate
        if (modelId.startsWith('shared_')) {
          const originalModel = { ...selectedModel }
          originalModel.id = actualModelId
          ctx.session.userModel = originalModel as any
          logger.info('Using shared model for team member', { 
            telegramId, 
            modelName: selectedModel.model_name,
            originalId: actualModelId 
          })
        } else {
          ctx.session.userModel = selectedModel as any
          logger.info('Model selected by user', { 
            telegramId, 
            modelName: selectedModel.model_name 
          })
        }

        // Переходим к показу инструкций - модель уже выбрана
        return neuroPhotoConversationStep(ctx)
      } else {
        logger.error('Selected model not found', { 
          telegramId, 
          selectedModelId: modelId 
        })
        await ctx.reply(
          isRu
            ? '❌ Выбранная модель не найдена. Попробуйте еще раз.'
            : '❌ Selected model not found. Please try again.'
        )
        return ctx.scene.leave()
      }
    } catch (error) {
      logger.error('Error processing neuro model selection', { 
        telegramId, 
        error: error instanceof Error ? error.message : String(error) 
      })
      await sendGenericErrorMessage(ctx, isRu, error)
      return ctx.scene.leave()
    }
  }
})

// Middleware для всех сообщений - перехватывает и логгирует
neuroPhotoWizard.use(async (ctx, next) => {
  const telegramId = ctx.from?.id?.toString() || 'unknown'
  const step = ctx.session.__scenes?.cursor || 0
  logger.debug('Middleware called', {
    telegramId,
    step,
    sessionState: JSON.stringify(ctx.session),
  })

  // Проверяем, что сообщение является текстовым
  if (ctx.message && 'text' in ctx.message) {
    logger.debug('Middleware received text message', {
      telegramId,
      messageText: ctx.message.text,
      step,
    })
    logger.info({
      message: 'Message received',
      telegramId,
      messageText: ctx.message.text,
      step,
    })

    // Проверяем специальные команды и кнопки
    const isMenuButton = ctx.message.text === '📸 Нейрофото'
    const isCommand = ctx.message.text.startsWith('/')
    const isSceneButton =
      ctx.message.text === '⬆️ Улучшить промпт' ||
      ctx.message.text === '⬆️ Improve prompt' ||
      ctx.message.text === '📐 Изменить размер' ||
      ctx.message.text === '📐 Change size' ||
      ctx.message.text === levels[104].title_ru ||
      ctx.message.text === levels[104].title_en ||
      /^[1-4]/.test(ctx.message.text)

    // Если это первый шаг (0), у пользователя есть модель, и это не кнопка или команда -
    // обрабатываем текст как промпт
    if (
      step === 0 &&
      ctx.session.userModel?.model_url &&
      !isCommand &&
      !isMenuButton &&
      !isSceneButton
    ) {
      logger.debug('Intercepting text as prompt on step 0', {
        telegramId,
        prompt: ctx.message.text,
      })
      logger.info({
        message: 'Intercepting text as prompt on step 0',
        telegramId,
        prompt: ctx.message.text,
        action: 'intercepting_prompt_step_0',
      })

      // Переходим к шагу обработки промпта (шаг 1) - ВАЖНО: используем next для перехода к следующему шагу
      logger.debug('Proceeding to step 1 via next()', { telegramId })
      ctx.wizard.next() // Используем next() вместо selectStep для более надежного перехода
      return await neuroPhotoPromptStep(ctx)
    }

    // Если это не первый шаг или это специальная команда/кнопка - пропускаем к следующему обработчику
    return next()
  }

  return next()
})

// Обработчик входа в сцену
neuroPhotoWizard.enter(async ctx => {
  const telegramId = ctx.from?.id?.toString() || 'unknown'
  logger.debug('Entering neuroPhotoWizard scene', {
    telegramId,
    previousPrompt: ctx.session.prompt,
    previousInitialized: ctx.session.neuroPhotoInitialized || false,
  })
  logger.info({
    message: 'Entering scene',
    telegramId,
    action: 'enter_scene',
    scene: ModeEnum.NeuroPhoto,
    previousSessionState: JSON.stringify({
      prompt: ctx.session.prompt,
      initialized: ctx.session.neuroPhotoInitialized,
      step: ctx.session.__scenes?.cursor,
    }),
  })

  // Сбрасываем состояние сцены при входе
  ctx.session.neuroPhotoInitialized = false
  ctx.session.prompt = undefined

  // Запускаем первый шаг сцены напрямую (wizard контекст еще не инициализирован)
  return await neuroPhotoConversationStep(ctx)
})

// Обработчик для всех текстовых сообщений
neuroPhotoWizard.on('text', async (ctx, next) => {
  const telegramId = ctx.from?.id?.toString() || 'unknown'
  const step = ctx.session.__scenes?.cursor || 0
  logger.debug('Text handler called', {
    telegramId,
    step,
    text: ctx.message.text,
    hasUserModel: !!ctx.session.userModel?.model_url,
  })
  logger.info({
    message: 'Processing text message',
    telegramId,
    text: ctx.message.text,
    step,
    hasUserModel: !!ctx.session.userModel?.model_url,
  })

  // Проверяем специальные команды и кнопки
  const isMenuButton = ctx.message.text === '📸 Нейрофото'
  const isCommand = ctx.message.text.startsWith('/')
  const isSceneButton =
    ctx.message.text === '⬆️ Улучшить промпт' ||
    ctx.message.text === '⬆️ Improve prompt' ||
    ctx.message.text === '📐 Изменить размер' ||
    ctx.message.text === '📐 Change size' ||
    ctx.message.text === levels[104].title_ru ||
    ctx.message.text === levels[104].title_en ||
    /^[1-4]/.test(ctx.message.text)

  // Если это команда меню или специальная кнопка - пропускаем к следующему обработчику
  if (isMenuButton || isCommand || isSceneButton) {
    logger.debug('Command or button received, passing to next handler', {
      telegramId,
      text: ctx.message.text,
    })
    return next()
  }

  // В зависимости от текущего шага сцены
  if (step === 0) {
    // На шаге 0, если у пользователя есть модель - обрабатываем текст как промпт
    if (ctx.session.userModel?.model_url) {
      logger.debug('Processing text as prompt on step 0', {
        telegramId,
        prompt: ctx.message.text,
      })
      logger.info({
        message: 'Processing text as prompt on step 0',
        telegramId,
        prompt: ctx.message.text,
      })

      ctx.session.prompt = ctx.message.text
      ctx.session.neuroPhotoInitialized = true

      // Переходим к шагу обработки промпта через next() для большей надежности
      ctx.wizard.next()
      return await neuroPhotoPromptStep(ctx)
    }
  } else if (step === 1) {
    // На шаге 1 - обрабатываем текст как уточнение/изменение промпта
    logger.debug('Processing text as prompt update on step 1', {
      telegramId,
      prompt: ctx.message.text,
    })
    ctx.session.prompt = ctx.message.text
    return await neuroPhotoPromptStep(ctx)
  }

  // Иначе просто передаем управление дальше
  return next()
})

// Добавляем обработчик выхода из сцены
neuroPhotoWizard.leave(async ctx => {
  const telegramId = ctx.from?.id?.toString() || 'unknown'
  const stackTrace = new Error().stack
  logger.debug('Leaving neuroPhotoWizard scene', {
    telegramId,
    currentScene: ctx.session.__scenes?.current,
    finalSessionState: JSON.stringify(ctx.session),
    stackTrace,
  })

  logger.info({
    message: 'Leaving scene',
    telegramId,
    finalSessionState: JSON.stringify({
      prompt: ctx.session.prompt,
      initialized: ctx.session.neuroPhotoInitialized,
      step: ctx.session.__scenes?.cursor,
    }),
    stackTrace: stackTrace,
    currentScene: ctx.session.__scenes?.current,
  })

  // Очищаем состояние сцены при выходе
  ctx.session.neuroPhotoInitialized = false
  ctx.session.prompt = undefined

  logger.debug('Session state cleared after scene exit', { telegramId })
  return
})

// Добавляем обработчик команды /cancel для экстренного выхода из сцены
neuroPhotoWizard.command('cancel', async ctx => {
  const telegramId = ctx.from?.id?.toString() || 'unknown'
  logger.debug('Cancel command received', { telegramId })
  logger.info({
    message: 'Exiting scene by cancel command',
    telegramId,
  })

  const isRu = ctx.from?.language_code === 'ru'
  await ctx.reply(isRu ? '❌ Операция отменена.' : '❌ Operation canceled.')

  return await ctx.scene.leave()
})