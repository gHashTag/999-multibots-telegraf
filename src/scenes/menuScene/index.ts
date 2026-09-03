import { Mode, MyContext, Subscription } from '../../interfaces'
import { sendGenericErrorMessage, createMainMenuKeyboard } from '@/navigation'
import { getReferalsCountAndUserData } from '@/core/supabase'
import { isDev, isRussian } from '@/helpers'
import { sendReplyWithKeyboard } from './sendReplyWithKeyboard'
import { getText } from './getText'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { Scenes, Markup } from 'telegraf'
import { getPhotoUrl } from '@/handlers/getPhotoUrl'
import { ModeEnum } from '@/interfaces/modes'
import { checkFullAccess } from '@/handlers/checkFullAccess'
import { getTranslation } from '@/core'
// ✅ УДАЛЕН: импорт УДАЛЁН - больше не используется
import { sendPhotoWithFallback } from '@/helpers/sendPhotoWithFallback'
import { logger } from '@/utils'
import { getUserDetailsSubscription } from '@/core/supabase/getUserDetailsSubscription'
import { handleRestartVideoGeneration } from '@/handlers/handleVideoRestart'
import { simulateSubscriptionForDev } from './helpers/simulateSubscription'
import { isRussianWithUserChoice } from '@/helpers/language'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { getParsingAccess } from '@/navigation'
import { getBotNameByToken } from '@/core/bot'
// ⚠️ ВРЕМЕННО: Убрано использование showMainMenu, чтобы избежать бесконечного цикла
// import { showMainMenu } from '@/navigation'

const menuCommandStep = async (ctx: MyContext) => {
  console.log('CASE 📲: menuCommand')

  // ✅ ИСПРАВЛЕНО: Убрана проверка currentSceneId - эта функция вызывается ТОЛЬКО при входе в MainMenu
  // Если пользователь уже в другой сцене, глобальный обработчик hears должен обработать кнопку
  const currentSceneId = ctx.scene.current?.id
  const telegramId = ctx.from?.id?.toString()

  logger.info('🏠 [menuCommandStep] Main menu scene entered', {
    telegramId,
    currentSceneId,
    expectedScene: ModeEnum.MainMenu,
  })

  console.log(
    `✅ [menuCommandStep] User is in main menu scene, processing menuCommand`,
    {
      telegramId,
      currentSceneId,
    }
  )

  // ✅ ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ ЯЗЫКА В MENUSCENE
  logger.info(`[menuCommandStep] 🎭 SCENE STARTED:`, {
    telegramId,
    sessionLanguage: ctx.session?.userLanguage,
    telegramLanguage: ctx.from?.language_code,
    sessionExists: !!ctx.session,
  })

  // ✅ ИСПОЛЬЗУЕМ АСИНХРОННУЮ ФУНКЦИЮ (БД ONLY)
  const isRu = await isRussianWithUserChoice(ctx)

  logger.info(`[menuCommandStep] Language determination:`, {
    telegramId,
    isRu,
    sessionLanguage: ctx.session?.userLanguage,
    telegramLanguage: ctx.from?.language_code,
    functionUsed: 'isRussianWithUserChoice',
  })

  try {
    const telegram_id = ctx.from?.id?.toString() || ''

    // Fetch only the subscription type
    // NOTE: Assuming getReferalsCountAndUserData can return only subscription or using a different function if needed.
    // For now, we still destructure level/count but won't use them.
    const userDetails = await getUserDetailsSubscription(telegram_id)

    // Получаем оригинальную подписку
    const originalSubscription = userDetails.subscriptionType

    // Используем хелпер для симуляции в dev-режиме
    const newSubscription = simulateSubscriptionForDev(
      originalSubscription,
      isDev
    )

    // УБИРАЕМ АВТОМАТИЧЕСКИЙ ПЕРЕХОД В subscriptionScene
    // Пользователи должны сначала увидеть приветственное сообщение
    // и САМИ нажать кнопку подписки для перехода в subscriptionScene

    let message = ''
    let photo_url: string | null = null
    let translationKey = '' // Initialize key

    // --- Определяем ключ для приветственного сообщения ---
    if (
      newSubscription === SubscriptionType.BASIC ||
      newSubscription === SubscriptionType.PRO ||
      newSubscription === SubscriptionType.STUDIO ||
      newSubscription === SubscriptionType.NEUROVIDEO ||
      newSubscription === SubscriptionType.NEUROPHOTO ||
      newSubscription === SubscriptionType.NEUROTESTER
    ) {
      translationKey = 'menu' // Для пользователей с полным доступом
    } else {
      translationKey = 'digitalAvatar' // Для STARS и остальных
    }
    logger.info(
      `[menuCommandStep] Subscription: ${
        newSubscription || 'None'
      }. Using translation key: '${translationKey}'`
    )

    // --- Get Translation using the determined key ---
    logger.info(
      `[menuCommandStep] Getting translation for key: ${translationKey}, Bot: ${ctx.botInfo?.username}`
    )
    const { translation, url, buttons } = await getTranslation({
      key: translationKey,
      ctx,
      bot_name: ctx.botInfo?.username,
    })

    // Логируем полученные кнопки
    logger.info(
      `[menuCommandStep] Got ${buttons.length} buttons from translation for key: ${translationKey}`
    )

    // ✅ НОВЫЙ: Используем единый сервис навигации для создания клавиатуры
    const keyboard = createMainMenuKeyboard(ctx)

    // --- Set message and photo using translation results or fallbacks ---
    if (translation) {
      message = translation
      photo_url = url || null
    } else {
      // Construct the desired fallback message directly, remove unnecessary escapes
      message = isRu
        ? '🏠 Главное меню\nВыберите нужный раздел 👇'
        : '🏠 Main Menu\nSelect the section 👇'
      logger.warn(
        `[menuCommandStep] Translation not found for key '${translationKey}'. Using constructed fallback text.`
      )
      photo_url = null // No photo for fallback
    }

    // Добавляем раздельное логирование
    // Более строгая проверка: translation существует, это строка, и она не пустая
    if (
      translation &&
      typeof translation === 'string' &&
      translation.trim() !== ''
    ) {
      logger.info(
        `[menuCommandStep] Sending DB message: "${message.substring(
          0,
          50
        )}...", Photo URL: ${photo_url}`
      )
    } else {
      logger.info(
        `[menuCommandStep] Sending FALLBACK message: "${(isRu
          ? '🏠 Главное меню\\nВыберите нужный раздел 👇'
          : '🏠 Main Menu\\nSelect the section 👇'
        ).substring(0, 50)}...", Photo URL: null`
      )
    }

    if (photo_url) {
      // Специальная обработка для digitalAvatar - добавляем inline кнопки даже с фото
      if (translationKey === 'digitalAvatar') {
        // Inline кнопка подписки (БЕЗ Mini App)
        const inlineKeyboard = Markup.inlineKeyboard([
          [
            {
              text: isRu ? '💫 Оформить подписку' : '💫 Subscribe',
              callback_data: 'go_to_subscription_scene',
            },
          ],
        ]).reply_markup

        // Пробуем отправить фото с fallback
        const photoSent = await sendPhotoWithFallback(ctx, photo_url, {
          caption: message,
          parse_mode: 'HTML',
          reply_markup: inlineKeyboard,
        })

        if (!photoSent) {
          // Если фото не отправилось, отправляем только текст с inline кнопками
          await ctx.reply(message, {
            parse_mode: 'HTML',
            reply_markup: inlineKeyboard,
          })
        }

        // ✅ НОВЫЙ: Меню показывается через showMainMenu
        // Клавиатура будет показана в showMainMenu
      } else {
        // ✅ ВОССТАНОВЛЕНО: Используем старую логику с клавиатурой
        await sendReplyWithKeyboard(ctx, message, [], keyboard, photo_url)
      }
    } else {
      // Send fallback without parse_mode, or send translation (also without parse_mode FOR MENU KEY)
      if (translation && translationKey !== 'menu') {
        // Если есть перевод И это НЕ ключ 'menu'

        // Специальная обработка для digitalAvatar - добавляем inline кнопки
        if (translationKey === 'digitalAvatar') {
          // Inline кнопка подписки (БЕЗ Mini App)
          const inlineKeyboard = Markup.inlineKeyboard([
            [
              {
                text: isRu ? '💫 Оформить подписку' : '💫 Subscribe',
                callback_data: 'go_to_subscription_scene',
              },
            ],
          ]).reply_markup

          // Отправляем сообщение с inline кнопками
          await ctx.reply(message, {
            parse_mode: 'HTML',
            reply_markup: inlineKeyboard,
          })
        } else {
          await ctx.reply(message, {
            parse_mode: 'HTML',
            reply_markup: keyboard.reply_markup,
          })
        }
      } else {
        // Во всех остальных случаях (fallback ИЛИ ключ 'menu' из базы)
        let messageToSend = message // Берем сообщение (fallback или из базы)
        if (translationKey === 'menu' && typeof messageToSend === 'string') {
          // ЗАМЕНЯЕМ '\\n' на реальный перенос '\n' ТОЛЬКО для ключа 'menu'
          messageToSend = messageToSend.replace(/\\n/g, '\n')
        }
        // Отправляем как обычный текст (без parse_mode)
        await ctx.reply(messageToSend, {
          reply_markup: keyboard.reply_markup,
        })
      }
    }

    // ✅ АРХИТЕКТУРА ИЗМЕНЕНА: После показа меню завершаем сцену
    // Кнопки обрабатываются глобальными hearsHandlers, а не в сцене
    logger.info(
      '[menuCommandStep] Menu displayed, leaving scene to allow global handlers'
    )
    await ctx.scene.leave()
  } catch (error) {
    console.error('Error in menu command:', error)
    await sendGenericErrorMessage(ctx, isRu)
    ctx.scene.leave()
    throw error
  }
}

/**
 * !!! ВНИМАНИЕ !!! КРИТИЧЕСКАЯ ПРОБЛЕМА !!! ВНИМАНИЕ !!!
 *
 * НИКОГДА НЕ ДОБАВЛЯЙТЕ БЕЗУСЛОВНЫЙ ctx.scene.leave() В КОНЦЕ ЭТОЙ ФУНКЦИИ!!!
 *
 * Такой вызов приводит к принудительному выходу из любой сцены, куда переходит
 * пользователь, ДАЖЕ ЕСЛИ ПЕРЕХОД ТОЛЬКО ЧТО ПРОИЗОШЁЛ!
 *
 * Это вызывало серьёзный баг, когда пользователь входил в сцену нейрофото
 * и сразу из неё выходил - меню открывалось, затем автоматически закрывалось.
 *
 * Безусловный вызов ctx.scene.leave() здесь уместен ТОЛЬКО в блоке else,
 * когда обработать сообщение другим способом невозможно.
 */
const menuNextStep = async (ctx: MyContext) => {
  console.log('🎯 URGENT DEBUG: menuNextStep called!')
  logger.info('CASE 1: menuScene.next')
  logger.info(
    `[menuNextStep] Current wizard cursor: ${ctx.wizard?.cursor ?? 0}`
  )
  logger.info(
    `[menuNextStep] Update keys: ${Object.keys(ctx.update).join(', ')}`
  )
  logger.info(`[menuNextStep] Raw update:`, JSON.stringify(ctx.update, null, 2))
  if ('callback_query' in ctx.update && 'data' in ctx.update.callback_query) {
    // Answer the callback up front so the button spinner does not hang ~30s on
    // the unlock_features / else branches (only go_to_subscription_scene answered
    // before). .catch guards a stale/expired query id.
    await ctx.answerCbQuery().catch(() => {})
    const text = ctx.update.callback_query.data
    logger.info(`[menuNextStep] Callback Query Data: ${text}`)
    // Handle callback query buttons as before
    if (text === 'unlock_features') {
      logger.info('[menuNextStep] Handling callback: unlock_features')
      await ctx.scene.enter(ModeEnum.SubscriptionScene)
    } else if (text === 'go_to_subscription_scene') {
      logger.info('[menuNextStep] Handling callback: go_to_subscription_scene')
      await ctx.scene.leave()
      ctx.session.mode = ModeEnum.SubscriptionScene
      await ctx.scene.enter(ModeEnum.SubscriptionScene)
    } else {
      // Все callback_data обрабатываются через глобальные обработчики
      // УДАЛЁН УДАЛЁН - используется setupHearsHandlers
      logger.info(
        `[menuNextStep] Callback forwarded to global handlers: ${text}`
      )
    }
  } else if ('message' in ctx.update && 'text' in ctx.update.message) {
    const text = ctx.update.message.text
    logger.info(`[menuNextStep] Text Message Received: ${text}`)

    // ВАЖНО: Обработка кнопки подписки напрямую в menuScene (все варианты)
    console.log(`🔧 [DEBUG] Checking subscription button. Text: "${text}"`)
    if (
      text === '💫 Оформить подписку' ||
      text === '💫 Subscribe' ||
      text === '💳 Оформить подписку' ||
      text === '💳 Subscribe'
    ) {
      console.log(`🎯 [DEBUG] SUBSCRIPTION BUTTON MATCHED! Processing: ${text}`)
      logger.info(`[menuNextStep] DIRECT SUBSCRIPTION BUTTON HANDLING: ${text}`)
      try {
        console.log('🔧 [DEBUG] Step 1: Leaving current scene...')
        await ctx.scene.leave()

        console.log('🔧 [DEBUG] Step 2: Setting subscription mode...')
        ctx.session.mode = ModeEnum.SubscriptionScene

        console.log('🔧 [DEBUG] Step 3: Entering subscription scene...')
        await ctx.scene.enter(ModeEnum.SubscriptionScene)

        console.log('✅ [DEBUG] Successfully entered subscription scene!')
        return // Explicitly handled
      } catch (error) {
        console.error(
          '❌ [DEBUG] Error in subscription button handling:',
          error
        )
        logger.error('Error in direct subscription button handling:', {
          error,
          telegramId: ctx.from?.id,
        })
      }
    } else {
      console.log(`🔧 [DEBUG] Not a subscription button. Text: "${text}"`)
    }

    // 🔍 ПЕРСОНАЛИЗИРОВАННАЯ ОБРАБОТКА КНОПКИ ПАРСИНГ ПО БОТАМ
    if (text === '🔍 Парсинг' || text === '🔍 Parsing') {
      const userId = ctx.from?.id?.toString()
      const botToken = ctx.telegram.token

      logger.info(`[menuNextStep] PARSING BUTTON HANDLING: ${text}`, {
        telegramId: ctx.from?.id,
        userId,
        botName: getBotNameByToken(botToken).bot_name,
      })

      if (!userId) {
        logger.warn('Instagram parsing access denied - no user ID', {
          telegramId: ctx.from?.id,
        })
        await ctx.reply('❌ Ошибка: не удалось определить пользователя.')
        return
      }

      // 🔍 Проверяем доступ к парсингу для текущего бота
      const parsingAccess = getParsingAccess(userId, botToken)

      if (!parsingAccess.hasAccess) {
        const { bot_name } = getBotNameByToken(botToken)

        logger.warn('Instagram parsing access denied in menuScene', {
          telegramId: ctx.from?.id,
          userId,
          botName: bot_name,
          reason: 'Not in bot staff list',
        })

        const isRu = isRussianFromState(ctx)
        await ctx.reply(
          isRu
            ? '❌ У вас нет доступа к функции парсинга Instagram.'
            : '❌ You do not have access to Instagram parsing feature.'
        )
        return // Останавливаем обработку
      }

      try {
        const { bot_name } = getBotNameByToken(botToken)

        logger.info(
          'Instagram parsing access granted - entering wizard from menuScene',
          {
            telegramId: ctx.from?.id,
            userId,
            botName: bot_name,
            allowedProjects: parsingAccess.allowedProjects,
          }
        )

        await ctx.scene.leave() // Выходим из menuScene
        ctx.session.mode = ModeEnum.InstagramScrapingWizard
        await ctx.scene.enter(ModeEnum.InstagramScrapingWizard)

        logger.info(
          'Successfully entered Instagram scraping wizard from menuScene',
          {
            telegramId: ctx.from?.id,
            botName: bot_name,
          }
        )
        return // Explicitly handled
      } catch (error) {
        logger.error(
          'Error entering Instagram scraping wizard from menuScene:',
          {
            error,
            telegramId: ctx.from?.id,
          }
        )

        const isRu = isRussianFromState(ctx)
        await ctx.reply(
          isRu
            ? '❌ Ошибка при запуске парсинга Instagram. Попробуйте позже.'
            : '❌ Error starting Instagram parsing. Please try again later.'
        )
      }
    }

    // Specific text button handling (example: "Generate new video?")
    if (
      text === '🎥 Сгенерировать новое видео?' ||
      text === '🎥 Generate new video?'
    ) {
      logger.info(
        `[menuNextStep] Detected 'Generate new video' button. Calling handleRestartVideoGeneration...`
      )
      await handleRestartVideoGeneration(ctx)
      return // Explicitly handled
    }

    // Все остальные кнопки меню обрабатываются глобальными hearsHandlers
    // УДАЛЁН УДАЛЁН из проекта - используется setupHearsHandlers

    // 🚨 КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: НЕ перехватываем команды (начинающиеся с /)
    // Команды должны обрабатываться ГЛОБАЛЬНО в registerCommands.ts
    if (text.startsWith('/')) {
      logger.info(
        `[menuNextStep] Detected command '${text}' - checking for direct handling`
      )
      console.log(
        `🎯 COMMAND DETECTION: Processing command in menuScene: ${text}`
      )

      // 🚀 ПРЯМАЯ ОБРАБОТКА КОМАНДЫ /START В MENUSCENE
      if (text === '/start') {
        logger.info(
          '[menuNextStep] Handling /start command directly in menuScene'
        )
        try {
          // Выходим из текущей сцены
          await ctx.scene.leave()

          // Сбрасываем сессию как в глобальном обработчике
          const { defaultSession } = await import('@/store')
          ctx.session = { ...defaultSession }

          // Переходим в avatarTransformScene
          await ctx.scene.enter(ModeEnum.AvatarTransform)

          logger.info(
            '[menuNextStep] Successfully handled /start command in menuScene'
          )
          return // Команда обработана
        } catch (error) {
          logger.error(
            '[menuNextStep] Error handling /start command in menuScene:',
            error
          )
          // Fallback - позволяем глобальному обработчику попробовать
        }
      }

      // Для всех остальных команд позволяем глобальным обработчикам обработать
      console.log(
        `🎯 COMMAND DETECTION: Allowing global handlers for command: ${text}`
      )
      return // Позволяем глобальным обработчикам команд обработать это
    }

    // 🚨 КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: УДАЛЁН УДАЛЁН - используется setupHearsHandlers
    // Проблема: после входа в wizard, пользователь получает ответ первого шага,
    // но menuScene продолжает обрабатывать это как новую команду
    const currentSceneId = ctx.scene.current?.id
    console.log('🎯 URGENT DEBUG: menuNextStep called!', {
      currentSceneId,
      text: text.substring(0, 50),
      telegramId: ctx.from?.id,
    })

    if (currentSceneId !== ModeEnum.MainMenu) {
      logger.info(
        `[menuNextStep] User is in different scene (${currentSceneId}), УДАЛЁН УДАЛЁН`,
        {
          telegramId: ctx.from?.id,
          currentSceneId,
          text: text.substring(0, 50),
        }
      )
      return // НЕ обрабатываем, если пользователь в другой сцене
    }

    logger.info(
      `[menuNextStep] User still in menuScene, using global hears handlers for: ${text}`
    )
    console.log(
      '🔄 [menuNextStep] Allowing global hears handlers to process button...'
    )

    // ✅ ИСПОЛЬЗУЕМ ТОЛЬКО ГЛОБАЛЬНЫЕ HEARS ОБРАБОТЧИКИ
    // УДАЛЁН ПОЛНОСТЬЮ УДАЛЁН - используется setupHearsHandlers
    // Все кнопки обрабатываются единообразно через hearsHandlers.ts
  } else {
    // Handle other update types or leave if unhandled
    logger.warn(
      '[menuNextStep] Unhandled update type or message format in menuScene.',
      ctx.update
    )
    // Consider replying to the user that the action is not understood in the current context.
    // For example:
    // await ctx.reply(isRussian(ctx) ? 'Не совсем понимаю вас в этом меню. Пожалуйста, используйте кнопки.' : 'I don't quite understand you in this menu. Please use the buttons.');
    // Leaving the scene might be too abrupt if it's just an unhandled message type.
    // It's often better to guide the user or repeat the menu.
  }
}

// ✅ ИЗМЕНЕНА АРХИТЕКТУРА: menuScene стал одношаговым для избежания конфликтов
// Кнопки теперь обрабатываются ТОЛЬКО через глобальные hearsHandlers
// После показа меню сцена завершается, позволяя глобальным обработчикам работать

export const menuScene = new Scenes.WizardScene(
  ModeEnum.MainMenu,
  menuCommandStep
)

// Обработчик для inline кнопки "Оформить подписку"
menuScene.action('go_to_subscription_scene', async ctx => {
  const isRu = isRussianFromState(ctx)
  logger.info('MENU SCENE ACTION: go_to_subscription_scene', {
    telegramId: ctx.from?.id,
  })
  try {
    await ctx.answerCbQuery()
    await ctx.scene.leave()
    ctx.session.mode = ModeEnum.SubscriptionScene
    await ctx.scene.enter(ModeEnum.SubscriptionScene)
  } catch (error) {
    logger.error('Error in menuScene go_to_subscription_scene action:', {
      error,
      telegramId: ctx.from?.id,
    })
    await ctx.reply(
      isRu
        ? 'Произошла ошибка. Попробуйте позже.'
        : 'An error occurred. Please try again later.'
    )
  }
})
