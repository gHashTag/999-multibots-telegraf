import { MyContext } from '@/interfaces'
import { ModelUrl } from '@/interfaces'

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
import { handleMenu } from '@/handlers'
import { ModeEnum } from '@/interfaces/modes'
import { logger } from '@/utils/logger'
import { WizardScene } from 'telegraf/scenes'

// Заглушка для функции helpCancelHandler, которая проверяет, не отменил ли пользователь операцию
const helpCancelHandler = async (ctx: MyContext): Promise<boolean> => {
  if (ctx.message && 'text' in ctx.message) {
    const text = ctx.message.text.toLowerCase()
    return text === '/cancel' || text === 'отмена' || text === 'cancel'
  }
  return false
}

const neuroPhotoConversationStep = async (ctx: MyContext) => {
  const telegramId = ctx.from?.id?.toString() || 'unknown'
  console.log(
    `🧙‍♂️ [DEBUG] ВЫЗОВ neuroPhotoConversationStep: Step=${
      ctx.session.__scenes?.cursor || 0
    }, ID=${telegramId}`
  )
  console.log(
    `🧙‍♂️ [DEBUG] Состояние сессии: prompt=${
      ctx.session.prompt || 'нет'
    }, initialized=${ctx.session.neuroPhotoInitialized || false}`
  )
  console.log(
    `🧙‍♂️ [neuroPhotoConversationStep] Шаг 0, TelegramId: ${telegramId}`
  )
  logger.info({
    message: '🔄 [NeuroPhoto] Запуск шага неинициализированной беседы',
    telegramId,
    step: 0,
    action: 'conversation_step',
    sessionStep: ctx.session.__scenes?.cursor || 0,
    sessionState: JSON.stringify({
      prompt: ctx.session.prompt,
      initialized: ctx.session.neuroPhotoInitialized,
    }),
  })

  // Начало конверсации - проверяем модель пользователя
  try {
    // Проверяем, есть ли модель в сессии
    if (
      !ctx.session.userModel ||
      !ctx.session.userModel.model_url ||
      !ctx.session.userModel.trigger_word
    ) {
      console.log(
        `🧙‍♂️ [STEP0] В сессии НЕТ модели пользователя или нужных полей`
      )
      logger.info({
        message: '⚠️ [NeuroPhoto] Отсутствует модель пользователя в сессии',
        telegramId,
        sessionData: JSON.stringify(ctx.session),
      })

      // Если у пользователя нет модели, сообщаем ему и выходим из сцены
      const isRussian = ctx.from?.language_code === 'ru'
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
    console.log(
      `🧙‍♂️ [STEP0] Модель пользователя есть в сессии: ${ctx.session.userModel.model_url}, Триггер: ${ctx.session.userModel.trigger_word}`
    )
    logger.info({
      message: '✅ [NeuroPhoto] Проверка модели пользователя прошла успешно',
      telegramId,
      modelUrl: ctx.session.userModel.model_url,
      triggerWord: ctx.session.userModel.trigger_word,
      isInitialized: ctx.session.neuroPhotoInitialized === true,
    })

    // Если уже есть промпт и сцена инициализирована, сразу переходим к шагу промпта
    if (ctx.session.prompt && ctx.session.neuroPhotoInitialized === true) {
      console.log(
        `🧙‍♂️ [STEP0] Уже есть промпт: ${ctx.session.prompt}, переход к шагу 1`
      )
      logger.info({
        message: '🔄 [NeuroPhoto] Переход к шагу промпта (уже есть промпт)',
        telegramId,
        prompt: ctx.session.prompt,
        action: 'skip_to_prompt_step',
      })

      ctx.wizard.next() // Используем next() вместо selectStep для более надежного перехода
      return await neuroPhotoPromptStep(ctx)
    }

    // Отмечаем, что сцена инициализирована
    ctx.session.neuroPhotoInitialized = true
    console.log('🧙‍♂️ Успешная инициализация! neuroPhotoInitialized = true')
    logger.info({
      message: '✅ [NeuroPhoto] Сцена готова к получению промпта',
      telegramId,
    })
    console.log('🧙‍♂️ Готов к получению промпта')

    // Проверяем, есть ли текст в сообщении пользователя
    if (
      ctx.message &&
      'text' in ctx.message &&
      ctx.message.text !== '📸 Нейрофото'
    ) {
      console.log(`🧙‍♂️ [STEP0] Получен текст: ${ctx.message.text}`)
      logger.info({
        message: '📝 [NeuroPhoto] Получен текст от пользователя',
        telegramId,
        text: ctx.message.text,
      })

      // Сохраняем текст как промпт
      ctx.session.prompt = ctx.message.text
      console.log(`🧙‍♂️ [STEP0] Сохранен промпт: ${ctx.session.prompt}`)
      logger.info({
        message: '💾 [NeuroPhoto] Сохранение промпта',
        telegramId,
        prompt: ctx.session.prompt,
      })

      // Переходим к шагу промпта через next()
      ctx.wizard.next()
      return await neuroPhotoPromptStep(ctx)
    } else if (
      ctx.message &&
      'text' in ctx.message &&
      ctx.message.text === '📸 Нейрофото'
    ) {
      // Это команда меню - не обрабатываем как промпт
      console.log('🧙‍♂️ [STEP0] Это команда меню, ожидаем следующего сообщения')
      logger.info({
        message: '⏳ [NeuroPhoto] Получена команда меню, ожидаем ввода промпта',
        telegramId,
        text: ctx.message.text,
      })
    }

    // Отправляем сообщение с инструкцией по использованию
    console.log(
      '🧙‍♂️ [neuroPhotoConversationStep] Отправка приветственного сообщения'
    )
    logger.info({
      message: '📤 [NeuroPhoto] Отправка инструкции пользователю',
      telegramId,
      action: 'send_welcome_message',
    })

    const isRussian = ctx.from?.language_code === 'ru'
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
      { parse_mode: 'HTML' }
    )

    // Остаемся на том же шаге, ожидая ввод промпта
    console.log(
      '🧙‍♂️ [neuroPhotoConversationStep] Ожидаем ввод промпта от пользователя'
    )
    logger.info({
      message: '⏳ [NeuroPhoto] Ожидание промпта от пользователя',
      telegramId,
      action: 'waiting_for_prompt',
    })

    return
  } catch (error: any) {
    console.error(`🧙‍♂️ [neuroPhotoConversationStep] Ошибка: ${error.message}`)
    logger.error({
      message: '❌ [NeuroPhoto] Ошибка на шаге разговора',
      telegramId,
      error: error.message,
      stack: error.stack,
    })

    const isRussian = ctx.from?.language_code === 'ru'
    await ctx.reply(
      isRussian
        ? `❌ Произошла ошибка. Пожалуйста, попробуйте еще раз позже.`
        : `❌ An error occurred. Please try again later.`
    )
    return await ctx.scene.leave()
  }
}

const neuroPhotoPromptStep = async (ctx: MyContext) => {
  console.log('🧙‍♂️ НАЧАЛО: neuroPhotoPromptStep')
  const telegramId = ctx.from?.id?.toString() || 'unknown'
  console.log(
    `🧙‍♂️ [DEBUG] ВЫЗОВ neuroPhotoPromptStep: Step=${
      ctx.session.__scenes?.cursor || 0
    }, ID=${telegramId}`
  )
  console.log(
    `🧙‍♂️ [DEBUG] Состояние сессии: prompt=${
      ctx.session.prompt || 'нет'
    }, initialized=${ctx.session.neuroPhotoInitialized || false}`
  )
  const isRu = ctx.from?.language_code === 'ru'

  logger.info({
    message: '🚀 [NeuroPhoto] Начало сцены neuroPhotoPromptStep',
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
          message: '⚠️ [NeuroPhoto] Получена команда меню вместо промпта',
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
        console.log('🧙‍♂️ Получен текстовый промпт из сообщения:', promptText)
      }
    }
    // Иначе пробуем взять промпт из сессии (но только если это не команда меню)
    else if (ctx.session.prompt && ctx.session.prompt !== '📸 Нейрофото') {
      promptText = ctx.session.prompt
      console.log('🧙‍♂️ Получен текстовый промпт из сессии:', promptText)
    }
    // Если промпта нет вообще или это команда меню
    else {
      logger.warn({
        message: '⚠️ [NeuroPhoto] Не получен текст промпта',
        telegramId,
        result: 'empty_message',
      })

      await ctx.reply(
        isRu
          ? '❌ Не получен текст промпта. Пожалуйста, введите описание для генерации изображения.'
          : '❌ No prompt text received. Please enter a description for image generation.'
      )

      return // Ожидаем повторного ввода
    }

    // Проверяем пустой ли промпт
    if (promptText.trim() === '') {
      logger.warn({
        message: '⚠️ [NeuroPhoto] Получен пустой текст промпта',
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
      message: '📋 [NeuroPhoto] Текст промпта получен',
      telegramId,
      promptLength: promptText.length,
      promptPreview:
        promptText.substring(0, 50) + (promptText.length > 50 ? '...' : ''),
    })

    // Проверяем на команду отмены
    const isCancel = await helpCancelHandler(ctx)
    if (isCancel) {
      logger.info({
        message: '🛑 [NeuroPhoto] Отмена операции пользователем',
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
        message: '❌ [NeuroPhoto] Отсутствуют данные модели в сессии',
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
      message: '💾 [NeuroPhoto] Данные для генерации изображения подготовлены',
      telegramId,
      prompt: promptText,
      hasModelUrl: !!model_url,
      hasTriggerWord: !!trigger_word,
    })

    const userId = ctx.from?.id
    if (!userId) {
      logger.error({
        message: '❌ [NeuroPhoto] ID пользователя не найден',
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

    // Формируем полный промпт с trigger_word
    const fullPrompt = `Fashionable ${trigger_word}, ${promptText}`
    logger.info({
      message: '🎨 [NeuroPhoto] Начало генерации изображения',
      telegramId,
      fullPrompt,
      userId: userId.toString(),
    })

    console.log('🧙‍♂️ Запуск генерации изображения с промптом:', fullPrompt)

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
        model_url,
        1,
        userId.toString(),
        ctx,
        ctx.botInfo?.username
      )

      // Останавливаем интервал
      clearInterval(progressInterval)
      if (!ctx.chat?.id) {
        console.error('❌ Chat ID не найден')
        return
      }
      if (!processingMessage.message_id) {
        console.error('❌ Processing message ID не найден')
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
        message:
          '✅ [NeuroPhoto] Генерация изображения завершена, переход к следующему шагу',
        telegramId,
        nextStep: 'neuroPhotoButtonStep',
        result: 'success',
      })

      console.log('🧙‍♂️ Генерация изображения успешно завершена!')

      ctx.wizard.next()
      return neuroPhotoButtonStep(ctx)
    } catch (generateError) {
      // Останавливаем интервал в случае ошибки
      clearInterval(progressInterval)
      if (!ctx.chat?.id) {
        console.error('❌ Chat ID не найден')
        return
      }
      if (!processingMessage.message_id) {
        console.error('❌ Processing message ID не найден')
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
        message: '❌ [NeuroPhoto] Ошибка генерации изображения',
        telegramId,
        error:
          generateError instanceof Error
            ? generateError.message
            : String(generateError),
        stack: generateError instanceof Error ? generateError.stack : undefined,
      })

      console.error('🧙‍♂️ Ошибка генерации:', generateError)

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
      message: '❌ [NeuroPhoto] Критическая ошибка в neuroPhotoPromptStep',
      telegramId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    console.error('🧙‍♂️ Критическая ошибка:', error)

    await ctx.reply(
      isRu
        ? '❌ Произошла непредвиденная ошибка. Пожалуйста, вернитесь в главное меню и попробуйте снова.'
        : '❌ An unexpected error occurred. Please return to the main menu and try again.'
    )

    return ctx.scene.leave()
  }
}

const neuroPhotoButtonStep = async (ctx: MyContext) => {
  console.log('CASE 3: neuroPhotoButtonStep')
  const telegramId = ctx.from?.id?.toString() || 'unknown'
  console.log(
    `🧙‍♂️ [DEBUG] ВЫЗОВ neuroPhotoButtonStep: Step=${
      ctx.session.__scenes?.cursor || 0
    }, ID=${telegramId}`
  )
  console.log(
    `🧙‍♂️ [DEBUG] Состояние сессии: prompt=${
      ctx.session.prompt || 'нет'
    }, initialized=${ctx.session.neuroPhotoInitialized || false}`
  )
  logger.info({
    message: '🚀 [NeuroPhoto] Начало сцены neuroPhotoButtonStep',
    telegramId,
    currentScene: ModeEnum.NeuroPhoto,
    step: 'button',
    sessionData: JSON.stringify(ctx.session || {}),
  })

  if (ctx.message && 'text' in ctx.message) {
    const text = ctx.message.text
    logger.info({
      message: `🔘 [NeuroPhoto] Нажата кнопка: "${text}"`,
      telegramId,
      buttonText: text,
    })

    console.log(`CASE: Нажата кнопка ${text}`)
    const isRu = ctx.from?.language_code === 'ru'

    // Обработка кнопок "Улучшить промпт" и "Изменить размер"
    if (text === '⬆️ Улучшить промпт' || text === '⬆️ Improve prompt') {
      console.log('CASE: Улучшить промпт')
      logger.info({
        message: '🔄 [NeuroPhoto] Переход к сцене улучшения промпта',
        telegramId,
        nextScene: 'improvePromptWizard',
      })
      await ctx.scene.enter('improvePromptWizard')
      return
    }

    if (text === '📐 Изменить размер' || text === '📐 Change size') {
      console.log('CASE: Изменить размер')
      logger.info({
        message: '🔄 [NeuroPhoto] Переход к сцене изменения размера',
        telegramId,
        nextScene: 'sizeWizard',
      })
      await ctx.scene.enter('sizeWizard')
      return
    }

    if (text === levels[104].title_ru || text === levels[104].title_en) {
      console.log('CASE: Главное меню')
      logger.info({
        message: '🏠 [NeuroPhoto] Запрос на возврат в главное меню',
        telegramId,
        buttonText: text,
      })
      await handleMenu(ctx)
      return
    }

    await handleMenu(ctx)

    // Обработка кнопок с числами
    const numImages = parseInt(text[0])
    const prompt = ctx.session.prompt
    const userId = ctx.from?.id

    const generate = async (num: number) => {
      logger.info({
        message: `🖼️ [NeuroPhoto] Генерация ${num} изображений`,
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
          console.error('❌ Chat ID не найден')
          return
        }
        if (!ctx.session.userModel.model_url) {
          console.error('❌ Model URL не найден')
          return
        }
        if (!userId) {
          console.error('❌ User ID не найден')
          return
        }

        if (!ctx.botInfo?.username) {
          console.error('❌ Bot username не найден')
          return
        }
        if (!prompt) {
          console.error('❌ Prompt не найден')
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
          message: `✅ [NeuroPhoto] Успешно сгенерировано ${num} изображений`,
          telegramId,
          result: 'success',
        })
      } catch (error) {
        logger.error({
          message: `❌ [NeuroPhoto] Ошибка при генерации ${num} изображений`,
          telegramId,
          error: error instanceof Error ? error.message : String(error),
        })

        await ctx.reply(
          isRu
            ? '❌ Произошла ошибка при генерации изображений. Пожалуйста, попробуйте другой промпт или повторите попытку позже.'
            : '❌ An error occurred during image generation. Please try a different prompt or try again later.'
        )
      }
    }

    if (numImages >= 1 && numImages <= 4) {
      logger.info({
        message: `🔢 [NeuroPhoto] Определено количество изображений: ${numImages}`,
        telegramId,
        numImages,
      })
      await generate(numImages)
    } else {
      logger.info({
        message: '🔄 [NeuroPhoto] Возврат в главное меню (неизвестная команда)',
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
  }
}

export const neuroPhotoWizard = new WizardScene<MyContext>(
  ModeEnum.NeuroPhoto,
  neuroPhotoConversationStep,
  neuroPhotoPromptStep,
  neuroPhotoButtonStep
)

// УЛУЧШЕННЫЕ ОБРАБОТЧИКИ СООБЩЕНИЙ

// Middleware для всех сообщений - перехватывает и логгирует
neuroPhotoWizard.use(async (ctx, next) => {
  const telegramId = ctx.from?.id?.toString() || 'unknown'
  const step = ctx.session.__scenes?.cursor || 0
  console.log(`🧙‍♂️ [DEBUG] MIDDLEWARE ВЫЗВАН: Step=${step}, ID=${telegramId}`)
  console.log(`🧙‍♂️ [MIDDLEWARE] Шаг: ${step}, TelegramID: ${telegramId}`)

  // Вывод полного состояния сессии для отладки
  console.log(
    `🧙‍♂️ [DEBUG] Полное состояние сессии:`,
    JSON.stringify(ctx.session, null, 2)
  )

  // Проверяем, что сообщение является текстовым
  if (ctx.message && 'text' in ctx.message) {
    console.log(`🧙‍♂️ [MIDDLEWARE] Текст: ${ctx.message.text}`)
    logger.info({
      message: '📩 [NeuroPhoto] Получено сообщение',
      telegramId,
      messageText: ctx.message.text,
      step,
    })

    // Пропускаем обработку специальных команд и кнопок меню
    const isCommand = ctx.message.text.startsWith('/')
    const isMenuButton = ctx.message.text === '📸 Нейрофото'
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
      console.log(
        `🧙‍♂️ [MIDDLEWARE] Перехват текста как промпта на шаге 0: ${ctx.message.text}`
      )
      logger.info({
        message: '🎯 [NeuroPhoto] Перехват текста как промпта на шаге 0',
        telegramId,
        prompt: ctx.message.text,
        action: 'intercepting_prompt_step_0',
      })

      // Сохраняем промпт в сессии
      ctx.session.prompt = ctx.message.text

      // Устанавливаем флаг инициализации
      ctx.session.neuroPhotoInitialized = true

      // Переходим к шагу обработки промпта (шаг 1) - ВАЖНО: используем next для перехода к следующему шагу
      console.log('🧙‍♂️ [MIDDLEWARE] Переход к шагу 1 через next()')
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
  console.log(`🧙‍♂️ [DEBUG] ENTER ВЫЗВАН: ID=${telegramId}`)
  console.log(
    `🧙‍♂️ [DEBUG] Предыдущее состояние сессии: prompt=${
      ctx.session.prompt || 'нет'
    }, initialized=${ctx.session.neuroPhotoInitialized || false}`
  )
  console.log('🧙‍♂️ [ENTER] Вход в сцену neuroPhotoWizard')
  logger.info({
    message: '🚪 [NeuroPhoto] Вход в сцену',
    telegramId,
    action: 'enter_scene',
    scene: ModeEnum.NeuroPhoto,
    previousSessionState: JSON.stringify({
      prompt: ctx.session.prompt,
      initialized: ctx.session.neuroPhotoInitialized,
      step: ctx.session.__scenes?.cursor,
    }),
  })

  // Явно устанавливаем шаг 0 в сцене - это критично для правильной работы
  ctx.wizard.selectStep(0)

  // Сбрасываем состояние сцены при входе
  ctx.session.neuroPhotoInitialized = false
  ctx.session.prompt = undefined

  // Загружаем модель пользователя из базы данных - это КРИТИЧНО для работы сцены
  try {
    if (!ctx.from?.id) {
      throw new Error('ID пользователя не найден')
    }

    const userId = ctx.from.id
    console.log(`🧙‍♂️ [ENTER] Загрузка модели из БД для пользователя ${userId}`)

    // Получаем модель из базы данных
    const userModel = await getLatestUserModel(Number(userId), 'replicate')
    console.log(
      `🧙‍♂️ [ENTER] Модель для пользователя ${userId} из базы данных:`,
      JSON.stringify(userModel, null, 2)
    )

    if (!userModel) {
      console.log(
        `🧙‍♂️ [ENTER] Модель для пользователя ${userId} НЕ НАЙДЕНА в базе данных`
      )
      logger.warn({
        message: '⚠️ [NeuroPhoto] Модель пользователя не найдена в базе данных',
        telegramId,
      })

      const isRussian = ctx.from.language_code === 'ru'
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

    console.log(`🧙‍♂️ [ENTER] Модель из БД:`, JSON.stringify(userModel, null, 2))

    // Сохраняем модель в сессии - без этого ничего не будет работать
    ctx.session.userModel = userModel as any

    console.log(
      `🧙‍♂️ [ENTER] Модель сохранена в сессии. URL: ${userModel.model_url}, Триггер: ${userModel.trigger_word}`
    )
    logger.info({
      message: '✅ [NeuroPhoto] Модель пользователя загружена из БД',
      telegramId,
      modelData: JSON.stringify(userModel),
    })

    // Запускаем первый шаг сцены
    return await neuroPhotoConversationStep(ctx)
  } catch (error) {
    console.error(`🧙‍♂️ [ENTER] Критическая ошибка загрузки модели:`, error)
    logger.error({
      message: '❌ [NeuroPhoto] Критическая ошибка при загрузке модели',
      telegramId,
      error: error instanceof Error ? error.message : String(error),
    })

    const isRussian = ctx.from?.language_code === 'ru'
    await ctx.reply(
      isRussian
        ? `❌ Произошла ошибка при загрузке вашей модели. Пожалуйста, попробуйте позже.`
        : `❌ An error occurred while loading your model. Please try again later.`
    )

    return await ctx.scene.leave()
  }
})

// Обработчик для всех текстовых сообщений
neuroPhotoWizard.on('text', async (ctx, next) => {
  const telegramId = ctx.from?.id?.toString() || 'unknown'
  const step = ctx.session.__scenes?.cursor || 0
  console.log(
    `🧙‍♂️ [DEBUG] TEXT HANDLER ВЫЗВАН: Step=${step}, ID=${telegramId}, Text="${ctx.message.text}"`
  )
  console.log(
    `🧙‍♂️ [TEXT] Текстовое сообщение на шаге ${step}: "${ctx.message.text}"`
  )
  logger.info({
    message: '📄 [NeuroPhoto] Обработка текстового сообщения',
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
    console.log('🧙‍♂️ [TEXT] Получена команда или кнопка, передаем дальше')
    return next()
  }

  // В зависимости от текущего шага сцены
  if (step === 0) {
    // На шаге 0, если у пользователя есть модель - обрабатываем текст как промпт
    if (ctx.session.userModel?.model_url) {
      console.log('🧙‍♂️ [TEXT] Обрабатываем текст как промпт на шаге 0')
      logger.info({
        message: '📝 [NeuroPhoto] Обработка текста как промпта на шаге 0',
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
    console.log('🧙‍♂️ [TEXT] Обрабатываем текст как обновление промпта на шаге 1')
    ctx.session.prompt = ctx.message.text
    return await neuroPhotoPromptStep(ctx)
  }

  // Иначе просто передаем управление дальше
  return next()
})

// Добавляем обработчик выхода из сцены
neuroPhotoWizard.leave(async ctx => {
  const telegramId = ctx.from?.id?.toString() || 'unknown'
  console.log(`🧙‍♂️ [DEBUG] LEAVE ВЫЗВАН: ID=${telegramId}`)

  // Добавляем трассировку стека для анализа, откуда был вызван leave
  const stackTrace = new Error().stack
  console.log(`🧙‍♂️ [DEBUG] ВАЖНО! ТРАССИРОВКА СТЕКА LEAVE:`, stackTrace)
  console.log(`🧙‍♂️ [DEBUG] Сцена текущая: ${ctx.session.__scenes?.current}`)
  console.log(
    `🧙‍♂️ [DEBUG] Состояние сцены при выходе:`,
    JSON.stringify(ctx.session, null, 2)
  )

  logger.info({
    message: '👋 [NeuroPhoto] Выход из сцены',
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

  console.log(`🧙‍♂️ [DEBUG] Состояние сессии после выхода очищено`)
  return
})

// Добавляем обработчик команды /cancel для экстренного выхода из сцены
neuroPhotoWizard.command('cancel', async ctx => {
  const telegramId = ctx.from?.id?.toString() || 'unknown'
  console.log(`🧙‍♂️ [DEBUG] COMMAND CANCEL ВЫЗВАН: ID=${telegramId}`)
  logger.info({
    message: '🚫 [NeuroPhoto] Выход из сцены по команде отмены',
    telegramId,
  })

  const isRu = ctx.from?.language_code === 'ru'
  await ctx.reply(isRu ? '❌ Операция отменена.' : '❌ Operation canceled.')

  return await ctx.scene.leave()
})
