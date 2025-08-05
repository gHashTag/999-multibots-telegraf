import { Mode, MyContext, Subscription } from '../../interfaces'
import { sendGenericErrorMessage } from '@/menu'
import { levels, mainMenu } from '../../menu/mainMenu'
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
import { handleMenu } from '@/handlers/handleMenu'
import { sendPhotoWithFallback } from '@/helpers/sendPhotoWithFallback'
import { logger } from '@/utils'
import { getUserDetailsSubscription } from '@/core/supabase/getUserDetailsSubscription'
import { handleRestartVideoGeneration } from '@/handlers/handleVideoRestart'
import { simulateSubscriptionForDev } from './helpers/simulateSubscription'
import { isRussianWithUserChoice } from '@/helpers/language'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { getParsingAccess } from '@/menu/mainMenu'
import { getBotNameByToken } from '@/core/bot'

const menuCommandStep = async (ctx: MyContext) => {
  console.log('CASE 📲: menuCommand')

  // ✅ ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ ЯЗЫКА В MENUSCENE
  const telegramId = ctx.from?.id?.toString()
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
      newSubscription === SubscriptionType.NEUROVIDEO ||
      newSubscription === SubscriptionType.NEUROPHOTO ||
      newSubscription === SubscriptionType.NEUROTESTER
    ) {
      translationKey = 'menu' // Для пользователей с полным доступом
    } else {
      translationKey = 'digitalAvatar' // Для STARS и остальных
    }
    logger.info(
      `[menuCommandStep] Subscription: ${newSubscription || 'None'}. Using translation key: '${translationKey}'`
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

    // Создаем клавиатуру
    const keyboard = await mainMenu({
      isRu,
      subscription: newSubscription, // Pass simulated subscription
      ctx,
    })

    // Кнопки подписки теперь добавляются через mainMenu.ts как единая кнопка "💫 Оформить подписку"

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
        `[menuCommandStep] Sending DB message: "${message.substring(0, 50)}...", Photo URL: ${photo_url}`
      )
    } else {
      logger.info(
        `[menuCommandStep] Sending FALLBACK message: "${(isRu ? '🏠 Главное меню\\nВыберите нужный раздел 👇' : '🏠 Main Menu\\nSelect the section 👇').substring(0, 50)}...", Photo URL: null`
      )
    }

    if (photo_url) {
      // Специальная обработка для digitalAvatar - добавляем inline кнопки даже с фото
      if (translationKey === 'digitalAvatar') {
        const inlineKeyboard = {
          inline_keyboard: [
            [
              {
                text: isRu ? '💫 Оформить подписку' : '💫 Subscribe',
                callback_data: 'go_to_subscription_scene',
              },
            ],
          ],
        }

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

        // Отправляем обычную клавиатуру отдельным сообщением
        await ctx.reply(
          isRu ? '👇 Выберите действие:' : '👇 Choose an action:',
          {
            reply_markup: keyboard.reply_markup,
          }
        )
      } else {
        // Для всех остальных случаев используем стандартную функцию с fallback
        await sendReplyWithKeyboard(ctx, message, [], keyboard, photo_url)
      }
    } else {
      // Send fallback without parse_mode, or send translation (also without parse_mode FOR MENU KEY)
      if (translation && translationKey !== 'menu') {
        // Если есть перевод И это НЕ ключ 'menu'

        // Специальная обработка для digitalAvatar - добавляем inline кнопки
        if (translationKey === 'digitalAvatar') {
          const inlineKeyboard = {
            inline_keyboard: [
              [
                {
                  text: isRu ? '💫 Оформить подписку' : '💫 Subscribe',
                  callback_data: 'go_to_subscription_scene',
                },
              ],
            ],
          }

          // Отправляем сообщение с inline кнопками
          await ctx.reply(message, {
            parse_mode: 'HTML',
            reply_markup: inlineKeyboard,
          })

          // Отправляем обычную клавиатуру отдельным сообщением
          await ctx.reply(
            isRu ? '👇 Выберите действие:' : '👇 Choose an action:',
            {
              reply_markup: keyboard.reply_markup,
            }
          )
        } else {
          await ctx.reply(message, {
            parse_mode: 'HTML', // Изменено с MarkdownV2 на HTML
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
          // Отправляем обработанное сообщение
          // НЕТ parse_mode здесь
          reply_markup: keyboard.reply_markup,
        })
      }
    }

    // Ensure the wizard progresses to handle button clicks
    logger.info(
      '[menuCommandStep] Calling ctx.wizard.next() to enable button handling'
    )
    ctx.wizard.next()
    logger.info(`[menuCommandStep] Current wizard cursor: ${ctx.wizard.cursor}`)
  } catch (error) {
    console.error('Error in menu command:', error)
    await sendGenericErrorMessage(ctx, isRu, error as Error)
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
  logger.info(`[menuNextStep] Current wizard cursor: ${ctx.wizard.cursor}`)
  logger.info(
    `[menuNextStep] Update keys: ${Object.keys(ctx.update).join(', ')}`
  )
  logger.info(`[menuNextStep] Raw update:`, JSON.stringify(ctx.update, null, 2))
  if ('callback_query' in ctx.update && 'data' in ctx.update.callback_query) {
    const text = ctx.update.callback_query.data
    logger.info(`[menuNextStep] Callback Query Data: ${text}`)
    // Handle callback query buttons as before
    if (text === 'unlock_features') {
      logger.info('[menuNextStep] Handling callback: unlock_features')
      await ctx.scene.enter(ModeEnum.SubscriptionScene)
    } else if (text === 'go_to_subscription_scene') {
      logger.info('[menuNextStep] Handling callback: go_to_subscription_scene')
      await ctx.answerCbQuery()
      await ctx.scene.leave()
      ctx.session.mode = ModeEnum.SubscriptionScene
      await ctx.scene.enter(ModeEnum.SubscriptionScene)
    } else {
      // Assuming other callbacks might be handled by handleMenu if they represent scene entries
      // or specific actions defined as callbacks
      logger.info(`[menuNextStep] Forwarding callback to handleMenu: ${text}`)
      await handleMenu(ctx) // handleMenu can process known callback_data
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

    // If the text is not a specific button handled above,
    // and not a command (which should be handled globally),
    // we can consider it an unhandled text message within the menu scene.
    // For now, we can log it and do nothing, or re-send the menu.
    // However, handleMenu is designed to map button texts to actions.
    // If the text matches a known menu button text, handleMenu will process it.
    // This means regular menu button presses (not commands, not callbacks) will still work.

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

    logger.info(
      `[menuNextStep] Forwarding text message to handleMenu for potential button match: ${text}`
    )
    await handleMenu(ctx)
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

export const menuScene = new Scenes.WizardScene(
  ModeEnum.MainMenu,
  menuCommandStep,
  menuNextStep
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
