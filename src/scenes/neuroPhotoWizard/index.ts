import { MyContext } from '@/interfaces'
import { ModelUrl, UserModel } from '../../interfaces'

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
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { WizardScene } from 'telegraf/scenes'
import { getUserInfo } from '@/handlers/getUserInfo'
import { handleMenu } from '@/handlers'
import { ModeEnum } from '@/interfaces/modes'
import { logger } from '@/utils/logger'

const neuroPhotoConversationStep = async (ctx: MyContext) => {
  const isRu = ctx.from?.language_code === 'ru'
  const telegramId = ctx.from?.id?.toString() || 'unknown'
  logger.info({
    message: '🚀 [NeuroPhoto] Начало сцены neuroPhotoConversationStep',
    telegramId,
    currentScene: ModeEnum.NeuroPhoto,
    step: 'conversation',
    sessionData: JSON.stringify(ctx.session || {}),
  })

  try {
    console.log('CASE 1: neuroPhotoConversation')

    const { telegramId } = getUserInfo(ctx)
    logger.info({
      message: '🔍 [NeuroPhoto] Получение модели пользователя',
      telegramId,
      step: 'getting_user_model',
    })

    const userModel = await getLatestUserModel(Number(telegramId), 'replicate')
    logger.info({
      message: '📋 [NeuroPhoto] Получение данных о рефералах и пользователе',
      telegramId,
      hasUserModel: !!userModel,
      modelUrl: userModel?.model_url || 'none',
    })

    const { count, subscriptionType, level } =
      await getReferalsCountAndUserData(telegramId)

    logger.info({
      message: '📊 [NeuroPhoto] Данные пользователя получены',
      telegramId,
      referralCount: count,
      subscriptionType,
      level,
    })

    if (!userModel || !userModel.model_url) {
      logger.warn({
        message: '❌ [NeuroPhoto] У пользователя нет обученных моделей',
        telegramId,
      })

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
                subscription: subscriptionType,
                ctx,
                level,
              })
            ).reply_markup.keyboard,
          },
        }
      )

      logger.info({
        message: '🔄 [NeuroPhoto] Возврат в главное меню (нет моделей)',
        telegramId,
        action: 'leaving_scene',
      })

      return ctx.scene.leave()
    }

    ctx.session.userModel = userModel as UserModel
    logger.info({
      message: '💾 [NeuroPhoto] Модель пользователя сохранена в сессии',
      telegramId,
      modelUrl: userModel.model_url,
      triggerWord: userModel.trigger_word,
    })

    await sendPhotoDescriptionRequest(ctx, isRu, ModeEnum.NeuroPhoto)
    const isCancel = await handleHelpCancel(ctx)
    logger.info({
      message: `🔄 [NeuroPhoto] Обработка команды отмены: ${
        isCancel ? 'отменено' : 'продолжение'
      }`,
      telegramId,
      isCancel,
    })

    console.log('isCancel', isCancel)
    if (isCancel) {
      logger.info({
        message: '🛑 [NeuroPhoto] Отмена операции пользователем',
        telegramId,
        action: 'leaving_scene',
      })
      return ctx.scene.leave()
    }
    console.log('CASE: neuroPhotoConversation next')
    logger.info({
      message: '⏭️ [NeuroPhoto] Переход к следующему шагу',
      telegramId,
      nextStep: 'neuroPhotoPromptStep',
    })
    ctx.wizard.next()
    return
  } catch (error) {
    console.error('Error in neuroPhotoConversationStep:', error)
    logger.error({
      message: '❌ [NeuroPhoto] Ошибка в neuroPhotoConversationStep',
      telegramId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    await sendGenericErrorMessage(ctx, isRu, error)
    throw error
  }
}

const neuroPhotoPromptStep = async (ctx: MyContext) => {
  console.log('CASE 2: neuroPhotoPromptStep')
  const isRu = ctx.from?.language_code === 'ru'
  const telegramId = ctx.from?.id?.toString() || 'unknown'

  logger.info({
    message: '🚀 [NeuroPhoto] Начало сцены neuroPhotoPromptStep',
    telegramId,
    currentScene: ModeEnum.NeuroPhoto,
    step: 'prompt',
    sessionData: JSON.stringify(ctx.session || {}),
  })

  try {
    // Проверяем наличие сообщения
    if (!ctx.message) {
      logger.warn({
        message: '⚠️ [NeuroPhoto] Получено пустое сообщение',
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

    const promptMsg = ctx.message
    console.log(promptMsg, 'promptMsg')

    // Проверяем тип сообщения - текст или другое
    const messageType =
      'text' in promptMsg ? 'text' : 'photo' in promptMsg ? 'photo' : 'unknown'

    logger.info({
      message: `📝 [NeuroPhoto] Получено сообщение типа: ${messageType}`,
      telegramId,
      messageType,
    })

    // Обрабатываем только текстовые сообщения
    if (messageType !== 'text') {
      logger.warn({
        message: '⚠️ [NeuroPhoto] Получено нетекстовое сообщение',
        telegramId,
        messageType,
        result: 'wrong_message_type',
      })

      await ctx.reply(
        isRu
          ? '❌ Пожалуйста, отправьте текстовое описание для генерации изображения.'
          : '❌ Please send a text description for image generation.'
      )

      return // Ожидаем повторного ввода текста
    }

    // Теперь безопасно обрабатываем текстовое сообщение
    // Используем явное приведение типа, так как мы уже проверили наличие свойства 'text'
    const textMessage = promptMsg as { text: string }
    const promptText = textMessage.text || ''

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
    const isCancel = await handleHelpCancel(ctx)
    logger.info({
      message: `🔄 [NeuroPhoto] Проверка на отмену: ${
        isCancel ? 'отменено' : 'продолжение'
      }`,
      telegramId,
      isCancel,
    })

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
        logger.warn({
          message: '⚠️ [NeuroPhoto] Ошибка обновления сообщения о прогрессе',
          telegramId,
          error: e instanceof Error ? e.message : String(e),
        })
      }
    }, 10000) // Обновляем каждые 10 секунд

    try {
      // Устанавливаем таймаут на генерацию
      const generatePromise = generateNeuroImage(
        fullPrompt,
        model_url,
        1,
        userId.toString(),
        ctx,
        ctx.botInfo?.username
      )

      // Ожидаем выполнения с таймаутом
      await generatePromise

      // Останавливаем интервал
      clearInterval(progressInterval)

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

      ctx.wizard.next()
      return
    } catch (generateError) {
      // Останавливаем интервал в случае ошибки
      clearInterval(progressInterval)

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
        inviteCount: count,
        subscription: subscriptionType,
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
