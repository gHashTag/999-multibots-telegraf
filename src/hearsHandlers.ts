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
import { levels, mainMenu } from './menu'
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

  // 🏠 ГЛОБАЛЬНЫЙ ОБРАБОТЧИК КНОПКИ "ГЛАВНОЕ МЕНЮ" - РАБОТАЕТ ВЕЗДЕ!
  bot.hears([levels[104].title_ru, levels[104].title_en], async ctx => {
    logger.info('🏠 GLOBAL HEARS: Main menu button pressed', {
      telegramId: ctx.from?.id,
      text: ctx.message && 'text' in ctx.message ? ctx.message.text : 'unknown',
    })

    try {
      // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
      const is_ru = isRussianFromState(ctx)

      // Покидаем текущую сцену
      await ctx.scene.leave()

      // Устанавливаем режим главного меню
      ctx.session.mode = ModeEnum.MainMenu

      // Переходим в главное меню
      await ctx.scene.enter(ModeEnum.MainMenu)

      logger.info('✅ GLOBAL HEARS: Successfully entered main menu', {
        telegramId: ctx.from?.id,
      })
    } catch (error) {
      logger.error('❌ GLOBAL HEARS: Error in main menu handler:', {
        error,
        telegramId: ctx.from?.id,
      })

      // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
      const isRuError = isRussianFromState(ctx)
      await ctx.reply(
        isRuError
          ? '❌ Произошла ошибка при переходе в главное меню.'
          : '❌ Error occurred while entering main menu.'
      )
    }
  })

  // 🏠 ГЛОБАЛЬНЫЙ ОБРАБОТЧИК КОМАНДЫ "/menu" - РАБОТАЕТ ВЕЗДЕ!
  bot.command('menu', async ctx => {
    logger.info('🏠 GLOBAL COMMAND: /menu command pressed', {
      telegramId: ctx.from?.id,
    })

    try {
      // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
      const is_ru = isRussianFromState(ctx)

      // Покидаем текущую сцену
      await ctx.scene.leave()

      // Устанавливаем режим главного меню
      ctx.session.mode = ModeEnum.MainMenu

      // Переходим в главное меню
      await ctx.scene.enter(ModeEnum.MainMenu)

      logger.info(
        '✅ GLOBAL COMMAND: Successfully entered main menu via /menu',
        {
          telegramId: ctx.from?.id,
        }
      )
    } catch (error) {
      logger.error('❌ GLOBAL COMMAND: Error in /menu handler:', {
        error,
        telegramId: ctx.from?.id,
      })

      // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
      const isRuError = isRussianFromState(ctx)
      await ctx.reply(
        isRuError
          ? '❌ Произошла ошибка при переходе в главное меню.'
          : '❌ Error occurred while entering main menu.'
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

  bot.hears(['📸 Нейрофото 2', '📸 NeuroPhoto 2'], async (ctx: MyContext) => {
    logger.debug(`Получен hears для Нейрофото 2 от ${ctx.from?.id}`)

    // 🔒 ЗАЩИТА: Проверяем что пользователь админ
    const { ADMIN_IDS_ARRAY } = await import('@/config')
    const userId = ctx.from?.id
    const isAdmin = userId ? ADMIN_IDS_ARRAY.includes(userId) : false

    if (!isAdmin) {
      await ctx.reply('❌ У вас нет доступа к этой функции.')
      return
    }

    // ✅ ЗАЩИТА: Проверяем подписку перед входом в админскую функцию
    const hasSubscription = await checkSubscriptionGuard(ctx, '📸 Нейрофото 2')
    if (!hasSubscription) {
      return // Пользователь перенаправлен в subscriptionScene
    }

    await ctx.scene.leave()
    ctx.session.mode = ModeEnum.NeuroPhotoV2
    await ctx.scene.enter(ModeEnum.CheckBalanceScene)
  })

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
      logger.debug(`Получен hears для Генерация изображений от ${ctx.from?.id}`)

      // ✅ ЗАЩИТА: Проверяем подписку перед входом в генерацию изображений
      const hasSubscription = await checkSubscriptionGuard(
        ctx,
        isRussianFromState(ctx) ? levels[11].title_ru : levels[11].title_en
      )
      if (!hasSubscription) {
        return // Пользователь перенаправлен в subscriptionScene
      }

      ctx.session.mode = ModeEnum.TextToImage
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
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
    [levels[16].title_ru, levels[16].title_en],  // ✅ Изменено с 107 на 16
    async (ctx: MyContext) => {
      logger.debug(
        `Получен hears для Увеличить качество фото от ${ctx.from?.id}`
      )

      // ✅ ЗАЩИТА: Проверяем подписку перед входом в upscaler
      const hasSubscription = await checkSubscriptionGuard(
        ctx,
        isRussianFromState(ctx) ? levels[16].title_ru : levels[16].title_en  // ✅ Изменено с 107 на 16
      )
      if (!hasSubscription) {
        return // Пользователь перенаправлен в subscriptionScene
      }

      ctx.session.mode = ModeEnum.ImageUpscaler
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

  bot.hears(['1️⃣', '2️⃣', '3️⃣', '4️⃣'], async (ctx: MyContext) => {
    if (!('text' in ctx.message)) {
      logger.warn('Получено нетекстовое сообщение для числового hears')
      return
    }
    const text = ctx.message.text
    logger.debug(`Получен hears для кнопки ${text} от ${ctx.from?.id}`)
    // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
    const isRu = isRussianFromState(ctx)
    const prompt = ctx.session.prompt
    const telegramId = ctx.from.id
    const numImages = parseInt(text[0])

    // --- DEBUG LOG ---
    logger.debug('>>> HEARS HANDLER (1-4):', {
      telegramId: telegramId,
      textButton: text,
      parsedNumImages: numImages,
      sessionPromptSample: prompt ? prompt.substring(0, 70) + '...' : 'null',
      sessionMode: ctx.session.mode,
      sessionSelectedImageModel: ctx.session.selectedImageModel,
    })
    // --- END DEBUG LOG ---

    const { profile, settings } = await getUserProfileAndSettings(telegramId)

    if (!profile || !settings) {
      logger.error(
        'Не удалось получить профиль или настройки для hears handler',
        { telegramId }
      )
      await ctx.reply(
        isRu
          ? 'Ошибка: Не удалось получить данные пользователя.'
          : 'Error: Could not retrieve user data.'
      )
      return
    }

    if (!prompt) {
      logger.error('Промпт отсутствует в сессии для hears handler', {
        telegramId,
      })
      await ctx.reply(
        isRu
          ? 'Ошибка: Не найден текст для генерации. Попробуйте снова.'
          : 'Error: Prompt not found. Please try again.'
      )
      return
    }

    const generate = async (num: number) => {
      if (ctx.session.mode === ModeEnum.NeuroPhoto) {
        // ИСПРАВЛЕНИЕ: Формируем правильный промпт с учетом пола и trigger_word
        const trigger_word = ctx.session.userModel.trigger_word as string

        const userData = await getUserData(telegramId.toString())
        let genderPromptPart = 'person'
        if (userData?.gender === 'female') {
          genderPromptPart = 'female'
        } else if (userData?.gender === 'male') {
          genderPromptPart = 'male'
        }

        logger.info(
          `[hearsHandlers 1-4] Determined gender for prompt: ${genderPromptPart}`,
          {
            telegramId,
          }
        )

        const detailPrompt = `Cinematic Lighting, ethereal light, intricate details, extremely detailed, incredible details, full colored, complex details, insanely detailed and intricate, hypermaximalist, extremely detailed with rich colors. masterpiece, best quality, aerial view, HDR, UHD, unreal engine, Representative, fair skin, beautiful face, Rich in details High quality, gorgeous, glamorous, 8k, super detail, gorgeous light and shadow, detailed decoration, detailed lines`

        const fullPrompt = `Fashionable ${trigger_word} ${genderPromptPart}, ${prompt}, ${detailPrompt}`

        await generateNeuroPhotoHybrid(
          fullPrompt,
          ctx.session.userModel.model_url,
          num,
          telegramId.toString(),
          ctx,
          ctx.botInfo?.username
        )
      } else if (ctx.session.mode === ModeEnum.TextToImage) {
        const modelToUse = ctx.session.selectedImageModel

        if (!modelToUse) {
          logger.error(
            '[Hears 1-4 TextToImage] Model not found in session (ctx.session.selectedImageModel).',
            { telegramId }
          )
          await ctx.reply(
            isRu
              ? 'Ошибка: Модель для генерации не найдена в текущей сессии. Попробуйте начать заново из главного меню.'
              : 'Error: Model for generation not found in the current session. Please try starting over from the main menu.'
          )
          return
        }

        logger.info(
          `[Hears 1-4 TextToImage] Using model from session: ${modelToUse} for user ${telegramId}`
        )
        await generateTextToImage(
          prompt,
          modelToUse,
          numImages,
          telegramId.toString(),
          isRu,
          ctx,
          ctx.botInfo?.username
        )
      }
    }

    if (numImages >= 1 && numImages <= 4) {
      await generate(numImages)
    } else {
      await ctx.reply('Неизвестная кнопка')
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
  bot.hears('🤖 Цифровое тело 2', async ctx => {
    logger.info('GLOBAL HEARS: Цифровое тело 2 (Admin)', {
      telegramId: ctx.from?.id,
    })

    // 🔒 ЗАЩИТА: Проверяем что пользователь админ
    const { ADMIN_IDS_ARRAY } = await import('@/config')
    const userId = ctx.from?.id
    const isAdmin = userId ? ADMIN_IDS_ARRAY.includes(userId) : false

    if (!isAdmin) {
      await ctx.reply('❌ У вас нет доступа к этой функции.')
      return
    }

    // ✅ ЗАЩИТА: Проверяем подписку перед входом в админскую функцию
    const hasSubscription = await checkSubscriptionGuard(
      ctx,
      '🤖 Цифровое тело 2'
    )
    if (!hasSubscription) {
      return // Пользователь перенаправлен в subscriptionScene
    }

    await ctx.scene.leave()
    ctx.session.mode = ModeEnum.DigitalAvatarBodyV2
    await ctx.scene.enter(ModeEnum.CheckBalanceScene)
  })

  bot.hears('📸 Нейрофото 2', async ctx => {
    logger.info('GLOBAL HEARS: Нейрофото 2 (Admin)', {
      telegramId: ctx.from?.id,
    })

    // 🔒 ЗАЩИТА: Проверяем что пользователь админ
    const { ADMIN_IDS_ARRAY } = await import('@/config')
    const userId = ctx.from?.id
    const isAdmin = userId ? ADMIN_IDS_ARRAY.includes(userId) : false

    if (!isAdmin) {
      await ctx.reply('❌ У вас нет доступа к этой функции.')
      return
    }

    // ✅ ЗАЩИТА: Проверяем подписку перед входом в админскую функцию
    const hasSubscription = await checkSubscriptionGuard(ctx, '📸 Нейрофото 2')
    if (!hasSubscription) {
      return // Пользователь перенаправлен в subscriptionScene
    }

    await ctx.scene.leave()
    ctx.session.mode = ModeEnum.NeuroPhoto
    await ctx.scene.enter(ModeEnum.CheckBalanceScene)
  })

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
      await ctx.reply(
        '❌ Произошла ошибка при запуске парсинга. Попробуйте позже.'
      )
    }
  })
}
//
