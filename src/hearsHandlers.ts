import { imageModelMenu } from './menu/imageModelMenu'
import { logger } from './utils/logger'
import { generateTextToImage } from './services/generateTextToImage'
import { isRussian } from './helpers/language'
// ✅ ИМПОРТИРУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ ЯЗЫКОВ!
import { isRussianFromState } from './helpers/centralizedLanguage'
import { MyContext } from './interfaces/'
import { Telegraf, Markup } from 'telegraf'
import { HAIM_GROUP_STAFF_IDS } from './menu/mainMenu'
import { generateNeuroPhotoHybrid } from './services/generateNeuroPhotoHybrid'
import { handleSizeSelection } from './handlers'
import { levels, MAIN_MENU_BUTTONS, handleMenuButtonPress, createMainMenuKeyboard } from './menu'
// ✅ НОВЫЕ ИМПОРТЫ ИЗ simpleMenu
import { simpleLevels, simpleMainMenu } from './menu/simpleMenu'
import { getReferalsCountAndUserData, getUserData } from './core/supabase'
import { ModeEnum } from './interfaces/modes'
import { SubscriptionType } from './interfaces/subscription.interface'
// import { handleRestartVideoGeneration } from './handlers/handleVideoRestart' // Закомментировано, так как кнопка неясна
import { getUserProfileAndSettings } from '@/db/userSettings'
import { checkSubscriptionGuard } from './helpers/subscriptionGuard'
// Импортируем обработчики FLUX Kontext
import {
  handleFluxKontextImage,
  handleFluxKontextModelSelection,
  handleFluxKontextPrompt,
} from './commands/fluxKontextCommand'

// Импортируем функцию upscaling
import { upscaleFluxKontextImage } from './services/generateFluxKontext'
import { getParsingAccess } from './menu/mainMenu'

export const setupHearsHandlers = (bot: Telegraf<MyContext>) => {
  logger.info('Настройка обработчиков hears...')

  // ✅ WIZARD CALLBACK HANDLING: Wizards обрабатываются через stage.middleware()
  // stage.middleware() запускается ПЕРЕД этим handler'ом и устанавливает ctx.scene.current
  // Если wizard активен, мы пропускаем callback к wizard через return next()

  // === INLINE КНОПКИ ДЛЯ НЕЙРОФОТО ===
  bot.on('callback_query', async (ctx: MyContext, next) => {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
      await ctx.answerCbQuery()
      return next()
    }

    const data = ctx.callbackQuery.data
    const telegramId = ctx.from.id

    // ✅ КРИТИЧНО: Если wizard активен, пропускаем к wizard handler
    // stage.middleware() уже запустился и установил ctx.scene.current
    console.log('🔍 [GLOBAL CALLBACK] Checking wizard:', {
      hasScene: !!ctx.scene,
      hasCurrent: !!ctx.scene?.current,
      wizardId: ctx.scene?.current?.id,
      callback: data,
    })

    if (ctx.scene?.current?.id) {
      console.log('🚨 [GLOBAL CALLBACK] Active wizard detected, passing to wizard:', {
        wizardId: ctx.scene.current.id,
        callback: data,
      })
      return next() // Передаём wizard handler'у
    }

    try {
      await ctx.answerCbQuery()

      // Обработка кнопок генерации нейрофото
      if (data.startsWith('neuro_generate_')) {
        const numImages = parseInt(data.replace('neuro_generate_', ''))

        logger.info(`🔢 [INLINE] Запрошена генерация ${numImages} изображений пользователем ${telegramId}`)

        // Проверяем, есть ли активная сессия нейрофото с промптом и моделью
        if (!ctx.session?.prompt || !ctx.session?.userModel || !ctx.session.userModel.model_url) {
          const isRu = isRussianFromState(ctx)
          await ctx.reply(
            isRu
              ? '❌ Для генерации нужно сначала выбрать модель и ввести промпт. Используйте команду "📸 Нейрофото".'
              : '❌ To generate images, please first select a model and enter a prompt. Use "📸 NeuroPhoto" command.'
          )
          return
        }

        // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
        const isRu = isRussianFromState(ctx)
        const userId = ctx.from?.id
        const prompt = ctx.session.prompt

        // Получаем данные пола для промпта
        const userData = await getUserData(userId?.toString() ?? '')
        let genderPromptPart = 'person'
        if (userData?.gender === 'female') {
          genderPromptPart = 'female'
        } else if (userData?.gender === 'male') {
          genderPromptPart = 'male'
        }

        const trigger_word = ctx.session.userModel.trigger_word as string
        const detailPrompt = `Cinematic Lighting, ethereal light, intricate details, extremely detailed, incredible details, full colored, complex details, insanely detailed and intricate, hypermaximalist, extremely detailed with rich colors. masterpiece, best quality, aerial view, HDR, UHD, unreal engine, Representative, fair skin, beautiful face, Rich in details High quality, gorgeous, glamorous, 8k, super detail, gorgeous light and shadow, detailed decoration, detailed lines`
        const fullPrompt = `Fashionable ${trigger_word} ${genderPromptPart}, ${prompt}, ${detailPrompt}`

        // Получаем aspect ratio пользователя
        const { getAspectRatio } = await import('./core/supabase')
        const userAspectRatio = await getAspectRatio(userId || 0)

        logger.info(`🚀 [INLINE] Начинаем генерацию ${numImages} изображений для пользователя ${telegramId}`)

        // Запускаем генерацию
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

      // Обработка других кнопок нейрофото
      switch (data) {
        case 'improve_prompt':
          await ctx.scene.enter(ModeEnum.ImprovePromptWizard)
          return
        case 'change_size':
          await ctx.scene.enter(ModeEnum.SizeWizard)
          return
        case 'new_prompt':
          ctx.session.prompt = undefined
          await ctx.scene.enter(ModeEnum.NeuroPhoto)
          return
        case 'main_menu':
          await ctx.scene.enter(ModeEnum.MainMenu)
          return
        default:
          // Неизвестный callback - передаем другим обработчикам (может быть wizard)
          logger.debug(`Callback не обработан глобальным handler'ом, передаем дальше: ${data}`)
          return next()
      }

    } catch (error) {
      logger.error('Error in callback_query handler:', {
        error,
        telegramId,
        data,
      })
      const isRuError = isRussianFromState(ctx)
      await ctx.reply(
        isRuError
          ? '❌ Произошла ошибка при обработке команды.'
          : '❌ An error occurred while processing the command.'
      )
    }
  })

  // Удаляем экстренный обработчик подписки - он перехватывает слишком много команд
  // Обработка подписки происходит через конкретные кнопки в registerCommands.ts

  // ОБРАБОТЧИК ДЛЯ УВЕЛИЧЕНИЯ КАЧЕСТВА НЕЙРОФОТО (keyboard кнопка с бэкенда)
  bot.hears(['⬆️ Увеличить качество', '⬆️ Upscale Quality'], async ctx => {
    logger.info('GLOBAL HEARS: Neurophoto upscale quality requested', {
      telegramId: ctx.from?.id,
    })

    try {
      const telegram_id = ctx.from?.id?.toString()
      const username = ctx.from?.username || ''
      // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
      const is_ru = isRussianFromState(ctx)

      if (!telegram_id) {
        await ctx.reply(
          is_ru ? '❌ Ошибка получения ID пользователя.' : '❌ User ID error.'
        )
        return
      }

      // Проверяем, есть ли сохраненное изображение для upscaling
      if (!ctx.session?.lastNeuroPhotoImageUrl) {
        await ctx.reply(
          is_ru
            ? '❌ Нет изображения для увеличения качества. Сначала сгенерируйте нейрофото.'
            : '❌ No image to upscale. Please generate a neurophoto first.'
        )
        return
      }

      // Отправляем сообщение о начале обработки
      await ctx.reply(
        is_ru
          ? '⌛ Увеличиваем качество нейрофото... Пожалуйста, подождите'
          : '⌛ Upscaling neurophoto quality... Please wait'
      )

      // Импортируем и запускаем локальный upscaler (тот же что и для отдельного upscaler'а)
      const { upscaleImage } = await import('./services/imageUpscaler')
      await upscaleImage({
        imageUrl: ctx.session.lastNeuroPhotoImageUrl,
        telegram_id,
        username,
        is_ru,
        ctx,
        originalPrompt:
          ctx.session.lastNeuroPhotoPrompt || 'Neurophoto upscale',
      })
    } catch (error) {
      logger.error('Error in neurophoto upscale hears handler:', {
        error,
        telegramId: ctx.from?.id,
      })
      // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
      const isRuError = isRussianFromState(ctx)
      await ctx.reply(
        isRuError
          ? '❌ Произошла ошибка при увеличении качества нейрофото.'
          : '❌ An error occurred while upscaling the neurophoto.'
      )
    }
  })

  // === НАВИГАЦИОННЫЕ ОБРАБОТЧИКИ ===
  bot.hears(['🏠 Главное меню', '🏠 Main menu'], async ctx => {
    logger.info('GLOBAL HEARS: Главное меню', {
      telegramId: ctx.from?.id,
    })
    try {
      await ctx.scene.leave()
      await ctx.scene.enter(ModeEnum.MainMenu)
    } catch (error) {
      logger.error('Error in Главное меню hears:', {
        error,
        telegramId: ctx.from?.id,
      })
    }
  })

  bot.hears(['❓ Справка', '❓ Help'], async ctx => {
    logger.info('GLOBAL HEARS: Справка', {
      telegramId: ctx.from?.id,
    })
    try {
      await ctx.scene.leave()
      await ctx.scene.enter(ModeEnum.Help)
    } catch (error) {
      logger.error('Error in Справка hears:', {
        error,
        telegramId: ctx.from?.id,
      })
    }
  })

  bot.hears(['Отмена', 'Cancel'], async ctx => {
    logger.info('GLOBAL HEARS: Отмена/Cancel', {
      telegramId: ctx.from?.id,
    })
    try {
      // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
      const isRuCancel = isRussianFromState(ctx)
      await ctx.reply(
        isRuCancel ? '❌ Процесс отменён.' : '❌ Process cancelled.',
        Markup.removeKeyboard()
      )
      await ctx.scene.leave()
      await ctx.scene.enter(ModeEnum.MainMenu)
    } catch (error) {
      logger.error('Error in Отмена/Cancel hears:', {
        error,
        telegramId: ctx.from?.id,
      })
    }
  })

  // === ФУНКЦИОНАЛЬНЫЕ ОБРАБОТЧИКИ С ЗАЩИТОЙ ===

  bot.hears(
    [levels[1].title_ru, levels[1].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Цифровое тело от ${ctx.from?.id}`)

      // ✅ ЗАЩИТА: Проверяем подписку перед входом в цифровое тело
      const hasSubscription = await checkSubscriptionGuard(
        ctx,
        isRussianFromState(ctx) ? levels[1].title_ru : levels[1].title_en
      )
      if (!hasSubscription) {
        return // Пользователь перенаправлен в subscriptionScene
      }

      ctx.session.mode = ModeEnum.DigitalAvatarBody
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
    }
  )

  bot.hears(
    [levels[2].title_ru, levels[2].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Нейрофото от ${ctx.from?.id}`)

      // ✅ ЗАЩИТА: Проверяем подписку перед входом в нейрофото
      const hasSubscription = await checkSubscriptionGuard(
        ctx,
        isRussianFromState(ctx) ? levels[2].title_ru : levels[2].title_en
      )
      if (!hasSubscription) {
        return // Пользователь перенаправлен в subscriptionScene
      }

      ctx.session.mode = ModeEnum.NeuroPhoto
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
    }
  )

  // TEMPORARILY HIDDEN - кнопка "Нейрофото 2"
  // bot.hears(['📸 Нейрофото 2', '📸 NeuroPhoto 2'], async (ctx: MyContext) => {
  //   logger.debug(`Получен hears для Нейрофото 2 от ${ctx.from?.id}`)
  //
  //   // 🔒 ЗАЩИТА: Проверяем что пользователь админ
  //   const { ADMIN_IDS_ARRAY } = await import('@/config')
  //   const userId = ctx.from?.id
  //   const isAdmin = userId ? ADMIN_IDS_ARRAY.includes(userId) : false
  //
  //   if (!isAdmin) {
  //     await ctx.reply('❌ У вас нет доступа к этой функции.')
  //     return
  //   }
  //
  //   // ✅ ЗАЩИТА: Проверяем подписку перед входом в админскую функцию
  //   const hasSubscription = await checkSubscriptionGuard(ctx, '📸 Нейрофото 2')
  //   if (!hasSubscription) {
  //     return // Пользователь перенаправлен в subscriptionScene
  //   }
  //
  //   await ctx.scene.leave()
  //   ctx.session.mode = ModeEnum.NeuroPhotoV2
  //   await ctx.scene.enter(ModeEnum.CheckBalanceScene)
  // })

  bot.hears(
    [levels[3].title_ru, levels[3].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Промпт из фото от ${ctx.from?.id}`)

      // ✅ ЗАЩИТА: Проверяем подписку перед входом в промпт из фото
      const hasSubscription = await checkSubscriptionGuard(
        ctx,
        isRussianFromState(ctx) ? levels[3].title_ru : levels[3].title_en
      )
      if (!hasSubscription) {
        return // Пользователь перенаправлен в subscriptionScene
      }

      ctx.session.mode = ModeEnum.ImageToPrompt
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
    }
  )

  bot.hears(
    [levels[4].title_ru, levels[4].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Мозг аватара от ${ctx.from?.id}`)

      // ✅ ЗАЩИТА: Проверяем подписку перед входом в мозг аватара
      const hasSubscription = await checkSubscriptionGuard(
        ctx,
        isRussianFromState(ctx) ? levels[4].title_ru : levels[4].title_en
      )
      if (!hasSubscription) {
        return // Пользователь перенаправлен в subscriptionScene
      }

      ctx.session.mode = ModeEnum.Avatar
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
    }
  )

  bot.hears(
    [levels[5].title_ru, levels[5].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Чат с аватаром от ${ctx.from?.id}`)

      // ✅ ЗАЩИТА: Проверяем подписку перед входом в чат с аватаром
      const hasSubscription = await checkSubscriptionGuard(
        ctx,
        isRussianFromState(ctx) ? levels[5].title_ru : levels[5].title_en
      )
      if (!hasSubscription) {
        return // Пользователь перенаправлен в subscriptionScene
      }

      ctx.session.mode = ModeEnum.ChatWithAvatar
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
    }
  )

  bot.hears(
    [levels[6].title_ru, levels[6].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Выбор модели ИИ от ${ctx.from?.id}`)

      // ✅ ЗАЩИТА: Проверяем подписку перед входом в выбор модели
      const hasSubscription = await checkSubscriptionGuard(
        ctx,
        isRussianFromState(ctx) ? levels[6].title_ru : levels[6].title_en
      )
      if (!hasSubscription) {
        return // Пользователь перенаправлен в subscriptionScene
      }

      ctx.session.mode = ModeEnum.SelectModel
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
    }
  )

  bot.hears(
    [levels[7].title_ru, levels[7].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Голос аватара от ${ctx.from?.id}`)

      // ✅ ЗАЩИТА: Проверяем подписку перед входом в голос аватара
      const hasSubscription = await checkSubscriptionGuard(
        ctx,
        isRussianFromState(ctx) ? levels[7].title_ru : levels[7].title_en
      )
      if (!hasSubscription) {
        return // Пользователь перенаправлен в subscriptionScene
      }

      ctx.session.mode = ModeEnum.Voice
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
    }
  )

  bot.hears(
    [levels[8].title_ru, levels[8].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Текст в голос от ${ctx.from?.id}`)

      // ✅ ЗАЩИТА: Проверяем подписку перед входом в текст в голос
      const hasSubscription = await checkSubscriptionGuard(
        ctx,
        isRussianFromState(ctx) ? levels[8].title_ru : levels[8].title_en
      )
      if (!hasSubscription) {
        return // Пользователь перенаправлен в subscriptionScene
      }

      ctx.session.mode = ModeEnum.TextToSpeech
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
    }
  )

  bot.hears(
    [levels[108].title_ru, levels[108].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Транскрибация Reels от ${ctx.from?.id}`)

      // ✅ ЗАЩИТА: Проверяем подписку перед входом в транскрибацию
      const hasSubscription = await checkSubscriptionGuard(
        ctx,
        isRussianFromState(ctx) ? levels[108].title_ru : levels[108].title_en
      )
      if (!hasSubscription) {
        return // Пользователь перенаправлен в subscriptionScene
      }

      ctx.session.mode = ModeEnum.VideoTranscription
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
    }
  )

  bot.hears(
    [levels[9].title_ru, levels[9].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Фото в видео от ${ctx.from?.id}`)

      // ✅ ЗАЩИТА: Проверяем подписку перед входом в фото в видео
      const hasSubscription = await checkSubscriptionGuard(
        ctx,
        isRussianFromState(ctx) ? levels[9].title_ru : levels[9].title_en
      )
      if (!hasSubscription) {
        return // Пользователь перенаправлен в subscriptionScene
      }

      ctx.session.mode = ModeEnum.ImageToVideo
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
    }
  )

  bot.hears(
    [levels[10].title_ru, levels[10].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Видео из текста от ${ctx.from?.id}`)

      // ✅ ЗАЩИТА: Проверяем подписку перед входом в видео из текста
      const hasSubscription = await checkSubscriptionGuard(
        ctx,
        isRussianFromState(ctx) ? levels[10].title_ru : levels[10].title_en
      )
      if (!hasSubscription) {
        return // Пользователь перенаправлен в subscriptionScene
      }

      ctx.session.mode = ModeEnum.TextToVideo
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
    }
  )

  bot.hears(
    [levels[11].title_ru, levels[11].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Текст в фото от ${ctx.from?.id}`)

      // ✅ ЗАЩИТА: Проверяем подписку перед входом в текст в фото
      const hasSubscription = await checkSubscriptionGuard(
        ctx,
        isRussianFromState(ctx) ? levels[11].title_ru : levels[11].title_en
      )
      if (!hasSubscription) {
        return // Пользователь перенаправлен в subscriptionScene
      }

      ctx.session.mode = ModeEnum.TextToImage
      await ctx.scene.enter(ModeEnum.TextToImage)
    }
  )

  bot.hears(
    [levels[12].title_ru, levels[12].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для FLUX Kontext от ${ctx.from?.id}`)

      // ✅ ЗАЩИТА: Проверяем подписку перед входом в FLUX Kontext
      const hasSubscription = await checkSubscriptionGuard(
        ctx,
        isRussianFromState(ctx) ? levels[12].title_ru : levels[12].title_en
      )
      if (!hasSubscription) {
        return // Пользователь перенаправлен в subscriptionScene
      }

      // Входим в сцену выбора модели AI Photoshop
      await ctx.scene.leave()
      await ctx.scene.enter('ai_photoshop_scene')
    }
  )

  // Обработчик для кнопки "Увеличить качество фото"
  bot.hears(
    [levels[107].title_ru, levels[107].title_en],
    async (ctx: MyContext) => {
      logger.debug(
        `Получен hears для Увеличить качество фото от ${ctx.from?.id}`
      )

      // ✅ ЗАЩИТА: Проверяем подписку перед входом в upscaler
      const hasSubscription = await checkSubscriptionGuard(
        ctx,
        isRussianFromState(ctx) ? levels[107].title_ru : levels[107].title_en
      )
      if (!hasSubscription) {
        return // Пользователь перенаправлен в subscriptionScene
      }

      ctx.session.mode = ModeEnum.ImageUpscaler
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
    }
  )

  // Кнопка 15: 🎭 Замена лица
  bot.hears(
    [levels[15].title_ru, levels[15].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Замена лица от ${ctx.from?.id}`)

      // ✅ ЗАЩИТА: Проверяем подписку перед входом в face swap
      const hasSubscription = await checkSubscriptionGuard(
        ctx,
        isRussianFromState(ctx) ? levels[15].title_ru : levels[15].title_en
      )
      if (!hasSubscription) {
        return // Пользователь перенаправлен в subscriptionScene
      }

      ctx.session.mode = ModeEnum.FaceSwap
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
    }
  )

  // bot.hears(
  //   ['🎥 Сгенерировать новое видео?', '🎥 Generate new video?'],
  //   async (ctx: MyContext) => {
  //     await handleRestartVideoGeneration(ctx)
  //   }
  // )

  bot.hears('🔄 Сгенерировать еще (Фото в Видео)', async (ctx: MyContext) => {
    logger.info('HEARS: Сгенерировать еще (Фото в Видео)', {
      telegramId: ctx.from?.id,
    })
    try {
      ctx.session.mode = ModeEnum.ImageToVideo
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
    } catch (error) {
      logger.error('Error entering imageToVideoWizard from hears:', {
        error,
        telegramId: ctx.from?.id,
      })
    }
  })

  // НОВЫЕ ОБРАБОТЧИКИ ДЛЯ "ТЕКСТ В ВИДЕО"
  bot.hears(
    ['✨ Создать еще (Текст в Видео)', '✨ Create More (Text to Video)'],
    async (ctx: MyContext) => {
      logger.info('HEARS: Создать еще (Текст в Видео)', {
        telegramId: ctx.from?.id,
      })
      try {
        ctx.session.mode = ModeEnum.TextToVideo
        if (ctx.scene.current) {
          await ctx.scene.leave()
        }
        await ctx.scene.enter(ModeEnum.CheckBalanceScene)
      } catch (error) {
        logger.error(
          'Error entering textToVideoWizard from "Создать еще" hears:',
          {
            error: error,
            errorString: String(error),
            errorJson: JSON.stringify(error, Object.getOwnPropertyNames(error)),
            telegramId: ctx.from?.id,
          }
        )
        // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
        const isRu = isRussianFromState(ctx)
        await ctx.reply(
          isRu
            ? 'Произошла ошибка при попытке начать новую генерацию. Попробуйте вернуться в главное меню.'
            : 'An error occurred while trying to start a new generation. Please try returning to the main menu.'
        )
      }
    }
  )

  bot.hears(
    ['🖼 Выбрать другую модель (Видео)', '🖼 Select Another Model (Video)'],
    async (ctx: MyContext) => {
      logger.info('HEARS: Выбрать другую модель (Видео)', {
        telegramId: ctx.from?.id,
      })
      try {
        ctx.session.mode = ModeEnum.TextToVideo
        if (ctx.scene.current) {
          await ctx.scene.leave()
        }
        await ctx.scene.enter(ModeEnum.CheckBalanceScene)
      } catch (error) {
        logger.error(
          'Error entering textToVideoWizard from "Выбрать другую модель" hears:',
          {
            error: error,
            errorString: String(error),
            errorJson: JSON.stringify(error, Object.getOwnPropertyNames(error)),
            telegramId: ctx.from?.id,
          }
        )
        // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
        const isRu = isRussianFromState(ctx)
        await ctx.reply(
          isRu
            ? 'Произошла ошибка при попытке выбора другой модели. Попробуйте вернуться в главное меню.'
            : 'An error occurred while trying to select another model. Please try returning to the main menu.'
        )
      }
    }
  )

  // ОБРАБОТЧИК ДЛЯ "СОЗДАТЬ ЕЩЕ МОРФИНГ"
  bot.hears(
    ['🧬 Создать еще морфинг', '🧬 Create Another Morphing'],
    async (ctx: MyContext) => {
      logger.info('HEARS: Создать еще морфинг', {
        telegramId: ctx.from?.id,
      })
      try {
        if (ctx.scene.current) {
          await ctx.scene.leave()
        }
        await ctx.scene.enter('morphing_wizard')
      } catch (error) {
        logger.error(
          'Error entering morphing_wizard from "Создать еще морфинг" hears:',
          {
            error: error,
            errorString: String(error),
            errorJson: JSON.stringify(error, Object.getOwnPropertyNames(error)),
            telegramId: ctx.from?.id,
          }
        )
        // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
        const isRu = isRussianFromState(ctx)
        await ctx.reply(
          isRu
            ? 'Произошла ошибка при попытке создать морфинг. Попробуйте вернуться в главное меню.'
            : 'An error occurred while trying to create morphing. Please try returning to the main menu.'
        )
      }
    }
  )

  // ОБРАБОТЧИК ДЛЯ "НОВОЕ ВИДЕО" (Image-to-Video)
  bot.hears(
    ['🎬 Новое видео', '🎬 New Video'],
    async (ctx: MyContext) => {
      logger.info('HEARS: Новое видео (Image-to-Video)', {
        telegramId: ctx.from?.id,
      })
      try {
        // ✅ ЗАЩИТА: Проверяем подписку
        const hasSubscription = await checkSubscriptionGuard(
          ctx,
          'Image-to-Video'
        )
        if (!hasSubscription) {
          return // Пользователь перенаправлен в subscriptionScene
        }

        ctx.session.mode = ModeEnum.ImageToVideo
        if (ctx.scene.current) {
          await ctx.scene.leave()
        }
        await ctx.scene.enter(ModeEnum.ImageToVideo)
      } catch (error) {
        logger.error(
          'Error entering imageToVideoWizard from "Новое видео" hears:',
          {
            error: error,
            errorString: String(error),
            errorJson: JSON.stringify(error, Object.getOwnPropertyNames(error)),
            telegramId: ctx.from?.id,
          }
        )
        const isRu = isRussianFromState(ctx)
        await ctx.reply(
          isRu
            ? 'Произошла ошибка при попытке начать новую генерацию видео. Попробуйте вернуться в главное меню.'
            : 'An error occurred while trying to start a new video generation. Please try returning to the main menu.'
        )
      }
    }
  )

  // 🚨 ОБРАБОТКА КНОПОК 1️⃣,2️⃣,3️⃣,4️⃣ ДЛЯ ПОВТОРНОЙ ГЕНЕРАЦИИ ИЗОБРАЖЕНИЙ
  bot.hears(['1️⃣', '2️⃣', '3️⃣', '4️⃣'], async (ctx: MyContext) => {
    if (!('text' in ctx.message)) {
      logger.warn('Получено нетекстовое сообщение для числового hears')
      return
    }
    const text = ctx.message.text
    let numImages: number
    if (['1️⃣', '2️⃣', '3️⃣', '4️⃣'].includes(text)) {
      numImages = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'].indexOf(text) + 1
    } else {
      return // Не должно случиться, но на всякий случай
    }

    const telegramId = ctx.from.id
    const isRu = isRussianFromState(ctx)

    logger.info(`🔢 Повторная генерация ${numImages} изображений для пользователя ${telegramId}`)

    // Проверяем, есть ли сохранённый промпт и модель
    if (!ctx.session.prompt || !ctx.session.selectedImageModel) {
      logger.warn(`Нет сохранённого промпта или модели для ${telegramId}`)
      await ctx.reply(
        isRu
          ? '❌ Не найдены данные для генерации. Пожалуйста, начните генерацию заново через /menu → 🖼️ Текст в фото'
          : '❌ Generation data not found. Please start generation again via /menu → 🖼️ Text to Image'
      )
      return
    }

    try {
      const { generateTextToImageDirect } = await import('./services/generateTextToImageDirect')

      await generateTextToImageDirect(
        ctx.session.prompt,
        ctx.session.selectedImageModel,
        numImages,
        telegramId.toString(),
        ctx.from.username ?? 'unknown',
        isRu,
        ctx
      )
    } catch (error) {
      logger.error(`Ошибка при повторной генерации изображений для ${telegramId}:`, error)
      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка при генерации изображений. Попробуйте ещё раз.'
          : '❌ An error occurred while generating images. Please try again.'
      )
    }
  })

  bot.hears(
    ['⬆️ Улучшить промпт', '⬆️ Improve prompt'],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Улучшить промпт от ${ctx.from?.id}`)
      await ctx.scene.enter(ModeEnum.ImprovePromptWizard, {
        prompt: ctx.session.prompt,
        mode: ctx.session.mode,
      })
    }
  )

  bot.hears(
    ['📐 Изменить размер', '📐 Change size'],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Изменить размер от ${ctx.from?.id}`)
      await ctx.scene.enter(ModeEnum.SizeWizard)
    }
  )

  bot.hears(
    [
      '21:9',
      '16:9',
      '3:2',
      '4:3',
      '5:4',
      '1:1',
      '4:5',
      '3:4',
      '2:3',
      '9:16',
      '9:21',
    ],
    async (ctx: MyContext) => {
      if (!('text' in ctx.message)) {
        logger.warn(
          'Получено нетекстовое сообщение для hears изменения размера'
        )
        return
      }
      const size = ctx.message.text
      logger.debug(
        `Получен hears для изменения размера на ${size} от ${ctx.from?.id}`
      )
      await handleSizeSelection(ctx, size)
    }
  )

  bot.hears(/^(Отмена|отмена|Cancel|cancel)$/i, async (ctx: MyContext) => {
    logger.debug(`Получен hears для Отмена от ${ctx.from?.id}`)
    // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
    const isRu = isRussianFromState(ctx)
    const telegram_id = ctx.from?.id?.toString() || ''
    const { subscriptionType } = await getReferalsCountAndUserData(telegram_id)

    await mainMenu({
      isRu,
      subscription: subscriptionType,
      ctx,
    })
    await ctx.scene.leave()
  })

  bot.hears(
    [levels[103].title_ru, levels[103].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Помощь от ${ctx.from?.id}`)
      ctx.session.mode = ModeEnum.Help
      await ctx.scene.enter(ModeEnum.Help)
    }
  )

  bot.hears(
    [levels[100].title_ru, levels[100].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Пополнить баланс от ${ctx.from?.id}`)

      // Проверяем наличие подписки для пополнения баланса
      const telegramId = ctx.from?.id?.toString() || ''
      const { subscriptionType } = await getReferalsCountAndUserData(telegramId)
      const isRu = isRussianFromState(ctx)

      if (!subscriptionType || subscriptionType === SubscriptionType.STARS) {
        // Пользователь без подписки - показываем информативное сообщение
        const message = isRu
          ? '❌ <b>Пополнение баланса недоступно без подписки</b>\n\n' +
            '💳 Функция пополнения баланса доступна только для пользователей с активной подпиской.\n\n' +
            '📋 <b>Доступные тарифы:</b>\n' +
            '• NEUROPHOTO - работа с фото и изображениями\n' +
            '• NEUROVIDEO - все функции включая видео\n\n' +
            '💫 Нажмите "Оформить подписку" в главном меню для выбора тарифа'
          : '❌ <b>Balance top-up is not available without subscription</b>\n\n' +
            '💳 The balance top-up feature is only available for users with an active subscription.\n\n' +
            '📋 <b>Available plans:</b>\n' +
            '• NEUROPHOTO - photo and image features\n' +
            '• NEUROVIDEO - all features including video\n\n' +
            '💫 Press "Subscribe" in the main menu to choose a plan'

        await ctx.replyWithHTML(message)

        // Возвращаем в главное меню
        await mainMenu({
          isRu,
          subscription: subscriptionType,
          ctx,
        })
        return
      }

      // У пользователя есть подписка - продолжаем с пополнением
      ctx.session.mode = ModeEnum.TopUpBalance
      ctx.session.subscription = subscriptionType
      await ctx.scene.enter(ModeEnum.PaymentScene)
    }
  )

  bot.hears(
    [levels[101].title_ru, levels[101].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Баланс от ${ctx.from?.id}`)

      // Проверяем наличие подписки для просмотра баланса
      const telegramId = ctx.from?.id?.toString() || ''
      const { subscriptionType } = await getReferalsCountAndUserData(telegramId)
      const isRu = isRussianFromState(ctx)

      if (!subscriptionType || subscriptionType === SubscriptionType.STARS) {
        // Пользователь без подписки - показываем информативное сообщение
        const message = isRu
          ? '❌ <b>Просмотр баланса недоступен без подписки</b>\n\n' +
            '💳 Функции баланса доступны только для пользователей с активной подпиской.\n\n' +
            '📋 <b>Доступные тарифы:</b>\n' +
            '• NEUROPHOTO - работа с фото и изображениями\n' +
            '• NEUROVIDEO - все функции включая видео\n\n' +
            '💫 Нажмите "Оформить подписку" в главном меню для выбора тарифа'
          : '❌ <b>Balance view is not available without subscription</b>\n\n' +
            '💳 Balance features are only available for users with an active subscription.\n\n' +
            '📋 <b>Available plans:</b>\n' +
            '• NEUROPHOTO - photo and image features\n' +
            '• NEUROVIDEO - all features including video\n\n' +
            '💫 Press "Subscribe" in the main menu to choose a plan'

        await ctx.replyWithHTML(message)

        // Возвращаем в главное меню
        await mainMenu({
          isRu,
          subscription: subscriptionType,
          ctx,
        })
        return
      }

      // У пользователя есть подписка - показываем баланс
      ctx.session.mode = ModeEnum.Balance
      await ctx.scene.enter(ModeEnum.BalanceScene)
    }
  )

  bot.hears(
    [levels[102].title_ru, levels[102].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Пригласить друга от ${ctx.from?.id}`)

      // Пригласить друга доступно всем пользователям
      ctx.session.mode = ModeEnum.Invite
      await ctx.scene.enter('inviteScene')
    }
  )

  bot.hears(
    ['✨ Улучшить промт', '✨ Improve Prompt'],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Улучшить промт от ${ctx.from?.id}`)
      await ctx.scene.enter(ModeEnum.ImprovePromptWizard, {
        prompt: ctx.session.prompt,
        mode: ctx.session.mode,
      })
    }
  )

  bot.hears(['📝 Размер', '📝 Size'], async (ctx: MyContext) => {
    logger.debug(`Получен hears для Размер от ${ctx.from?.id}`)
    ctx.session.mode = ModeEnum.ChangeSize
    await ctx.scene.enter(ModeEnum.SizeWizard)
  })

  bot.hears(['❓ Помощь', '❓ Help'], async (ctx: MyContext) => {
    logger.debug(`Получен hears для Помощь от ${ctx.from?.id}`)
    await ctx.scene.enter(ModeEnum.Help)
  })

  bot.hears(['ℹ️ О боте', 'ℹ️ About'], async ctx => {
    logger.debug(`Получен hears для О боте от ${ctx.from?.id}`)
    await ctx.scene.enter(ModeEnum.Help)
  })

  // === ОБРАБОТЧИК ДЛЯ КНОПОК AVATAR TRANSFORM ===
  // Эти кнопки могут остаться у пользователя после выхода из сцены
  bot.hears(
    ['👨‍💼 Мужской образ', '👨‍💼 Male look', '👩‍💼 Женский образ', '👩‍💼 Female look'],
    async ctx => {
      logger.info(
        'GLOBAL HEARS: Avatar Transform button pressed outside scene',
        {
          telegramId: ctx.from?.id,
          buttonText:
            ctx.message && 'text' in ctx.message ? ctx.message.text : '',
        }
      )

      try {
        const isRu = isRussianFromState(ctx)

        // Информируем пользователя и предлагаем начать заново
        await ctx.reply(
          isRu
            ? '🔄 Похоже, вы вышли из процесса трансформации.\n\nЧтобы создать новый образ, используйте команду /start'
            : '🔄 It seems you have exited the transformation process.\n\nTo create a new look, use the /start command',
          Markup.removeKeyboard()
        )

        // Переходим в главное меню
        await ctx.scene.leave()
        await ctx.scene.enter(ModeEnum.MainMenu)
      } catch (error) {
        logger.error('Error handling Avatar Transform button outside scene:', {
          error,
          telegramId: ctx.from?.id,
        })
      }
    }
  )

  // === АДМИНСКИЕ КНОПКИ ===
  // TEMPORARILY HIDDEN - кнопка "Цифровое тело 2"
  // bot.hears('🤖 Цифровое тело 2', async ctx => {
  //   logger.info('GLOBAL HEARS: Цифровое тело 2 (Admin)', {
  //     telegramId: ctx.from?.id,
  //   })
  //
  //   // 🔒 ЗАЩИТА: Проверяем что пользователь админ
  //   const { ADMIN_IDS_ARRAY } = await import('@/config')
  //   const userId = ctx.from?.id
  //   const isAdmin = userId ? ADMIN_IDS_ARRAY.includes(userId) : false
  //
  //   if (!isAdmin) {
  //     await ctx.reply('❌ У вас нет доступа к этой функции.')
  //     return
  //   }
  //
  //   // ✅ ЗАЩИТА: Проверяем подписку перед входом в админскую функцию
  //   const hasSubscription = await checkSubscriptionGuard(
  //     ctx,
  //     '🤖 Цифровое тело 2'
  //   )
  //   if (!hasSubscription) {
  //     return // Пользователь перенаправлен в subscriptionScene
  //   }
  //
  //   await ctx.scene.leave()
  //   ctx.session.mode = ModeEnum.DigitalAvatarBodyV2
  //   await ctx.scene.enter(ModeEnum.CheckBalanceScene)
  // })

  // TEMPORARILY HIDDEN - кнопка "Нейрофото 2" (дубликат)
  // bot.hears('📸 Нейрофото 2', async ctx => {
  //   logger.info('GLOBAL HEARS: Нейрофото 2 (Admin)', {
  //     telegramId: ctx.from?.id,
  //   })
  //
  //   // 🔒 ЗАЩИТА: Проверяем что пользователь админ
  //   const { ADMIN_IDS_ARRAY } = await import('@/config')
  //   const userId = ctx.from?.id
  //   const isAdmin = userId ? ADMIN_IDS_ARRAY.includes(userId) : false
  //
  //   if (!isAdmin) {
  //     await ctx.reply('❌ У вас нет доступа к этой функции.')
  //     return
  //   }
  //
  //   // ✅ ЗАЩИТА: Проверяем подписку перед входом в админскую функцию
  //   const hasSubscription = await checkSubscriptionGuard(ctx, '📸 Нейрофото 2')
  //   if (!hasSubscription) {
  //     return // Пользователь перенаправлен в subscriptionScene
  //   }
  //
  //   await ctx.scene.leave()
  //   ctx.session.mode = ModeEnum.NeuroPhoto
  //   await ctx.scene.enter(ModeEnum.CheckBalanceScene)
  // })

  // === FLUX KONTEXT ОБРАБОТЧИКИ ===
  bot.hears(['💼 FLUX Kontext Pro'], async ctx => {
    logger.info('GLOBAL HEARS: FLUX Kontext Pro selected', {
      telegramId: ctx.from?.id,
    })

    // Устанавливаем режим для справки
    if (ctx.session) {
      ctx.session.mode = ModeEnum.FluxKontext
    }

    await handleFluxKontextModelSelection(ctx, 'pro')
  })

  bot.hears(['🚀 FLUX Kontext Max'], async ctx => {
    logger.info('GLOBAL HEARS: FLUX Kontext Max selected', {
      telegramId: ctx.from?.id,
    })

    // Устанавливаем режим для справки
    if (ctx.session) {
      ctx.session.mode = ModeEnum.FluxKontext
    }

    await handleFluxKontextModelSelection(ctx, 'max')
  })

  // Обработчик для кнопок результата редактирования
  bot.hears(['✨ Ещё редактирование', '✨ More editing'], async ctx => {
    logger.info('GLOBAL HEARS: More editing requested', {
      telegramId: ctx.from?.id,
    })

    // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
    const isRuEdit = isRussianFromState(ctx)
    await ctx.reply(
      isRuEdit
        ? '📷 Отправьте новое изображение для редактирования:'
        : '📷 Send a new image for editing:',
      {
        reply_markup: {
          remove_keyboard: true,
        },
      }
    )

    if (ctx.session) {
      ctx.session.awaitingFluxKontextImage = true
    }
  })

  // Новые обработчики для AI Photoshop
  bot.hears(['🔄 Другой режим', '🔄 Different mode'], async ctx => {
    logger.info('GLOBAL HEARS: Different mode requested', {
      telegramId: ctx.from?.id,
    })

    // Возвращаемся к AI Photoshop сцене
    await ctx.scene.leave()
    await ctx.scene.enter('ai_photoshop_scene')
  })

  // === ПАРСИНГ INSTAGRAM ДЛЯ АДМИНОВ (НОВЫЙ WIZARD БЕЗ CALLBACKS) ===
  bot.hears(['🔍 Парсинг', '🔍 Parsing'], async ctx => {
    const userId = ctx.from?.id?.toString()
    const botToken = ctx.telegram.token

    logger.info('GLOBAL HEARS: Парсинг Instagram button pressed', {
      telegramId: ctx.from?.id,
      userId,
      botToken: botToken?.substring(0, 10) + '...',
    })

    if (!userId) {
      logger.warn('Instagram parsing access denied - no user ID', {
        telegramId: ctx.from?.id,
      })
      await ctx.reply('❌ Ошибка: не удалось определить пользователя.')
      return
    }

    // 🔍 Простая проверка - доступ только админам
    const { ADMIN_IDS_ARRAY } = await import('@/config')
    const isAdmin = ADMIN_IDS_ARRAY.includes(parseInt(userId))

    if (!isAdmin) {
      logger.warn('Instagram parsing access denied - not admin', {
        telegramId: ctx.from?.id,
        userId,
      })

      await ctx.reply('❌ У вас нет доступа к функции парсинга Instagram.')
      return
    }

    logger.info('Instagram parsing access granted for admin', {
      telegramId: ctx.from?.id,
      userId,
    })

    // ✅ Доступ разрешен - запускаем мастер парсинга
    try {
      await ctx.scene.leave()
      await ctx.scene.enter(ModeEnum.InstagramParserScene)
    } catch (error) {
      logger.error('Error entering Instagram parser wizard', {
        telegramId: ctx.from?.id,
        userId,
        error: error instanceof Error ? error.message : String(error),
      })
      await ctx.reply('❌ Произошла ошибка при запуске парсинга. Попробуйте позже.')
    }
  })

  // === НЕДОСТАЮЩИЕ ОБРАБОТЧИКИ КНОПОК МЕНЮ ===

  // Кнопка 104: 🏠 Главное меню
  bot.hears(
    [levels[104].title_ru, levels[104].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Главное меню от ${ctx.from?.id}`)
      await ctx.scene.leave()
      ctx.session.mode = ModeEnum.MainMenu
      await ctx.scene.enter(ModeEnum.MainMenu)
    }
  )

  // Кнопка 105: 💫 Оформить подписку (уже есть в registerCommands, но добавим для консистентности)
  bot.hears(
    [levels[105].title_ru, levels[105].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Оформить подписку от ${ctx.from?.id}`)
      await ctx.scene.leave()
      ctx.session.mode = ModeEnum.SubscriptionScene
      await ctx.scene.enter(ModeEnum.SubscriptionScene)
    }
  )

  // Кнопка 106: 🌐 Смена языка
  bot.hears(
    [levels[106].title_ru, levels[106].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Смена языка от ${ctx.from?.id}`)

      const isRu = isRussianFromState(ctx)
      const currentLang = ctx.session?.userLanguage
      const newLang = currentLang === 'ru' ? 'en' : 'ru'
      ctx.session.userLanguage = newLang

      await ctx.reply(
        newLang === 'ru'
          ? '✅ Язык изменён на русский'
          : '✅ Language changed to English'
      )

      // Показываем главное меню на новом языке
      await ctx.scene.leave()
      ctx.session.mode = ModeEnum.MainMenu
      await ctx.scene.enter(ModeEnum.MainMenu)
    }
  )

  // Кнопка 109: 🔍 Мониторинг конкурентов (только для админов и сотрудников Haim Group)
  bot.hears(
    [levels[109].title_ru, levels[109].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Мониторинг конкурентов от ${ctx.from?.id}`)

      const userId = ctx.from?.id?.toString()
      const { ADMIN_IDS_ARRAY } = await import('@/config')
      const isMainAdmin = userId && ADMIN_IDS_ARRAY.includes(parseInt(userId))
      const isHaimStaff = userId && HAIM_GROUP_STAFF_IDS.includes(userId)
      const hasAccess = isMainAdmin || isHaimStaff

      if (!hasAccess) {
        logger.warn('Competitor monitoring access denied - not admin/staff', {
          userId,
          isMainAdmin,
          isHaimStaff,
        })
        await ctx.reply(
          isRussianFromState(ctx)
            ? '❌ У вас нет доступа к мониторингу конкурентов. Функция доступна только администраторам.'
            : '❌ You do not have access to competitor monitoring. This feature is admin only.'
        )
        return
      }

      // Запускаем Instagram Parser Wizard
      await ctx.scene.leave()
      await ctx.scene.enter('instagram_parser_wizard')
    }
  )

  // Кнопка 110: 🎬 ИИ Рилс (только для админов и сотрудников Haim Group)
  bot.hears(
    [levels[110].title_ru, levels[110].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для ИИ Рилс от ${ctx.from?.id}`)

      const userId = ctx.from?.id?.toString()
      const { ADMIN_IDS_ARRAY } = await import('@/config')
      const isMainAdmin = userId && ADMIN_IDS_ARRAY.includes(parseInt(userId))
      const isHaimStaff = userId && HAIM_GROUP_STAFF_IDS.includes(userId)
      const hasAccess = isMainAdmin || isHaimStaff

      if (!hasAccess) {
        logger.warn('AI Reels access denied - not admin/staff', {
          userId,
          isMainAdmin,
          isHaimStaff,
        })
        await ctx.reply(
          isRussianFromState(ctx)
            ? '❌ У вас нет доступа к ИИ Рилс. Функция доступна только администраторам.'
            : '❌ You do not have access to AI Reels. This feature is admin only.'
        )
        return
      }

      // Запускаем AI Reels entry wizard (выбор метода)
      await ctx.scene.leave()
      await ctx.scene.enter('ai_reels_entry')
    }
  )

  // === ПОСЛЕДНИЕ НЕДОСТАЮЩИЕ КНОПКИ ===

  // Кнопка 13: 🌀 Infinity Морфинг
  bot.hears(
    [levels[13].title_ru, levels[13].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Infinity Морфинг от ${ctx.from?.id}`)

      // ✅ ЗАЩИТА: Проверяем подписку перед входом в морфинг
      const hasSubscription = await checkSubscriptionGuard(
        ctx,
        isRussianFromState(ctx) ? levels[13].title_ru : levels[13].title_en
      )
      if (!hasSubscription) {
        return // Пользователь перенаправлен в subscriptionScene
      }

      await ctx.scene.leave()
      ctx.session.mode = ModeEnum.MorphingWizard
      await ctx.scene.enter(ModeEnum.MorphingWizard)
    }
  )

  // Кнопка 14: 🎤 Синхронизация губ (только для админов)
  bot.hears(
    [levels[14].title_ru, levels[14].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Синхронизация губ от ${ctx.from?.id}`)

      // 🔒 ЗАЩИТА: Проверяем что пользователь админ
      const { ADMIN_IDS_ARRAY } = await import('@/config')
      const userId = ctx.from?.id
      const isAdmin = userId ? ADMIN_IDS_ARRAY.includes(userId) : false

      if (!isAdmin) {
        await ctx.reply(
          isRussianFromState(ctx)
            ? '❌ У вас нет доступа к синхронизации губ. Функция в разработке.'
            : '❌ You do not have access to lip sync. Feature in development.'
        )
        return
      }

      // Переходим к выбору модели lip-sync
      await ctx.scene.leave()
      ctx.session.mode = ModeEnum.LipSync
      await ctx.scene.enter(ModeEnum.LipSync)
    }
  )

  // Кнопка 111: 🦸‍♂️ ИИ Герои
  bot.hears(
    [levels[111].title_ru, levels[111].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для ИИ Герои от ${ctx.from?.id}`)

      // ✅ ЗАЩИТА: Проверяем подписку перед входом в ИИ Герои
      const hasSubscription = await checkSubscriptionGuard(
        ctx,
        isRussianFromState(ctx) ? levels[111].title_ru : levels[111].title_en
      )
      if (!hasSubscription) {
        return // Пользователь перенаправлен в subscriptionScene
      }

      await ctx.scene.leave()
      ctx.session.mode = ModeEnum.AIHeroes
      await ctx.scene.enter(ModeEnum.AvatarTransform)
    }
  )

  // ✅ НОВЫЙ ПРОСТОЙ ОБРАБОТЧИК ДЛЯ ГЛАВНОГО МЕНЮ
  // Ловим ВСЕ кнопки из MAIN_MENU_BUTTONS
  const menuButtonTexts = MAIN_MENU_BUTTONS.map(btn => [btn.ru, btn.en]).flat()

  bot.hears(menuButtonTexts, async (ctx: MyContext) => {
    const text = ctx.message?.text
    if (!text) return

    console.log('🎯 [SIMPLE MENU] Button pressed:', text)

    // Передаем кнопку в новую простую функцию
    const handled = await handleMenuButtonPress(ctx, text)

    if (handled) {
      console.log('✅ [SIMPLE MENU] Button handled successfully')
    } else {
      console.log('⚠️ [SIMPLE MENU] Button not recognized:', text)
    }
  })
}
//
