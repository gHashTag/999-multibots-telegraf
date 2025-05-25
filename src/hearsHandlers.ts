import { imageModelMenu } from './menu/imageModelMenu'
import { logger } from './utils/logger'
import { generateTextToImage } from './services/generateTextToImage'
import { isRussian } from './helpers/language'
import { MyContext } from './interfaces/'
import { Telegraf, Markup } from 'telegraf'

import { generateNeuroImage } from './services/generateNeuroImage'
import { handleSizeSelection } from './handlers'
import { levels, mainMenu } from './menu'
import { getReferalsCountAndUserData } from './core/supabase'
import { ModeEnum } from './interfaces/modes'
import { SubscriptionType } from './interfaces/subscription.interface'
// import { handleRestartVideoGeneration } from './handlers/handleVideoRestart' // Закомментировано, так как кнопка неясна
import { getUserProfileAndSettings } from '@/db/userSettings'
import { checkSubscriptionGuard } from './helpers/subscriptionGuard'

export const setupHearsHandlers = (bot: Telegraf<MyContext>) => {
  logger.info('Настройка обработчиков hears...')

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
      await ctx.reply(
        isRussian(ctx) ? '❌ Процесс отменён.' : '❌ Process cancelled.',
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
        '🤖 Цифровое тело'
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
      const hasSubscription = await checkSubscriptionGuard(ctx, '📸 Нейрофото')
      if (!hasSubscription) {
        return // Пользователь перенаправлен в subscriptionScene
      }

      ctx.session.mode = ModeEnum.NeuroPhotoV2
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
    }
  )

  bot.hears(['📸 Нейрофото 2', '📸 NeuroPhoto 2'], async (ctx: MyContext) => {
    logger.debug(`Получен hears для Нейрофото 2 от ${ctx.from?.id}`)

    // ✅ ЗАЩИТА: Проверяем подписку перед входом в админскую функцию
    const hasSubscription = await checkSubscriptionGuard(ctx, '📸 Нейрофото 2')
    if (!hasSubscription) {
      return // Пользователь перенаправлен в subscriptionScene
    }

    ctx.session.mode = ModeEnum.NeuroPhoto
    await ctx.scene.enter(ModeEnum.CheckBalanceScene)
  })

  bot.hears(
    [levels[3].title_ru, levels[3].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Промпт из фото от ${ctx.from?.id}`)

      // ✅ ЗАЩИТА: Проверяем подписку перед входом в промпт из фото
      const hasSubscription = await checkSubscriptionGuard(
        ctx,
        '🔍 Промпт из фото'
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
        '🧠 Мозг аватара'
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
        '💭 Чат с аватаром'
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
        '🤖 Выбор модели ИИ'
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
        '🎤 Голос аватара'
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
        '🎙️ Текст в голос'
      )
      if (!hasSubscription) {
        return // Пользователь перенаправлен в subscriptionScene
      }

      ctx.session.mode = ModeEnum.TextToSpeech
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
        '🎥 Фото в видео'
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
        '🎥 Видео из текста'
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
        '🖼️ Текст в фото'
      )
      if (!hasSubscription) {
        return // Пользователь перенаправлен в subscriptionScene
      }

      ctx.session.mode = ModeEnum.TextToImage
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
        const isRu = isRussian(ctx)
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
        const isRu = isRussian(ctx)
        await ctx.reply(
          isRu
            ? 'Произошла ошибка при попытке выбора другой модели. Попробуйте вернуться в главное меню.'
            : 'An error occurred while trying to select another model. Please try returning to the main menu.'
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
    const isRu = isRussian(ctx)
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
        await generateNeuroImage(
          prompt,
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
    const isRu = isRussian(ctx)
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

      // ✅ ЗАЩИТА: Проверяем подписку перед пополнением баланса
      const hasSubscription = await checkSubscriptionGuard(
        ctx,
        '💎 Пополнить баланс'
      )
      if (!hasSubscription) {
        return // Пользователь перенаправлен в subscriptionScene
      }

      ctx.session.mode = ModeEnum.TopUpBalance
      ctx.session.subscription = SubscriptionType.STARS
      await ctx.scene.enter(ModeEnum.PaymentScene)
    }
  )

  bot.hears(
    [levels[101].title_ru, levels[101].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Баланс от ${ctx.from?.id}`)

      // ✅ ЗАЩИТА: Проверяем подписку перед показом баланса
      const hasSubscription = await checkSubscriptionGuard(ctx, '💰 Баланс')
      if (!hasSubscription) {
        return // Пользователь перенаправлен в subscriptionScene
      }

      ctx.session.mode = ModeEnum.Balance
      await ctx.scene.enter(ModeEnum.BalanceScene)
    }
  )

  bot.hears(
    [levels[102].title_ru, levels[102].title_en],
    async (ctx: MyContext) => {
      logger.debug(`Получен hears для Пригласить друга от ${ctx.from?.id}`)

      // ✅ ЗАЩИТА: Проверяем подписку перед входом в приглашения
      const hasSubscription = await checkSubscriptionGuard(
        ctx,
        '👥 Пригласить друга'
      )
      if (!hasSubscription) {
        return // Пользователь перенаправлен в subscriptionScene
      }

      ctx.session.mode = ModeEnum.Invite
      await ctx.scene.enter(ModeEnum.InviteScene)
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

  // === АДМИНСКИЕ КНОПКИ ===
  bot.hears('🤖 Цифровое тело 2', async ctx => {
    logger.info('GLOBAL HEARS: Цифровое тело 2 (Admin)', {
      telegramId: ctx.from?.id,
    })

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

    // ✅ ЗАЩИТА: Проверяем подписку перед входом в админскую функцию
    const hasSubscription = await checkSubscriptionGuard(ctx, '📸 Нейрофото 2')
    if (!hasSubscription) {
      return // Пользователь перенаправлен в subscriptionScene
    }

    await ctx.scene.leave()
    ctx.session.mode = ModeEnum.NeuroPhoto
    await ctx.scene.enter(ModeEnum.CheckBalanceScene)
  })
}
//
