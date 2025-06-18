import { Mode, MyContext, Subscription } from '../../interfaces'
import { sendGenericErrorMessage } from '@/menu'
import { levels, mainMenu } from '../../menu/mainMenu'
import { getReferalsCountAndUserData } from '@/core/supabase'
import { isDev, isRussian } from '@/helpers'
import { sendReplyWithKeyboard } from './sendReplyWithKeyboard'
import { getText } from './getText'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { Scenes } from 'telegraf'
import { getPhotoUrl } from '@/handlers/getPhotoUrl'
import { ModeEnum } from '@/interfaces/modes'
import { checkFullAccess } from '@/handlers/checkFullAccess'
import { getTranslation } from '@/core'
import { handleMenu } from '@/handlers/handleMenu'
import { logger } from '@/utils'
import { getUserDetailsSubscription } from '@/core/supabase/getUserDetailsSubscription'
import { handleRestartVideoGeneration } from '@/handlers/handleVideoRestart'
import { simulateSubscriptionForDev } from './helpers/simulateSubscription'

const menuCommandStep = async (ctx: MyContext) => {
  console.log('CASE 📲: menuCommand')
  const isRu = isRussian(ctx)
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

    // Pass only necessary data to mainMenu (assuming it adapts or uses defaults for level/count)
    const keyboard = await mainMenu({
      isRu,
      subscription: newSubscription,
      ctx,
    })

    let message = ''
    let photo_url: string | null = null
    let translationKey = '' // Initialize key

    // --- Determine translation key based ONLY on Subscription Type ---
    if (
      newSubscription === SubscriptionType.NEUROVIDEO ||
      newSubscription === SubscriptionType.NEUROPHOTO ||
      newSubscription === SubscriptionType.NEUROTESTER
    ) {
      translationKey = 'menu' // Use 'menu' key for full access users
      logger.info(
        `[menuCommandStep] Subscription: ${newSubscription}. Using translation key: '${translationKey}'`
      )
    } else {
      // For STARS, or any other case (including null/undefined newSubscription)
      translationKey = 'digitalAvatar' // Use 'digitalAvatar' for limited access / prompt to subscribe
      logger.info(
        `[menuCommandStep] Subscription: ${newSubscription || 'None'}. Using translation key: '${translationKey}'`
      )
    }

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
      await sendReplyWithKeyboard(ctx, message, [], keyboard, photo_url)
    } else {
      // Send fallback without parse_mode, or send translation (also without parse_mode FOR MENU KEY)
      if (translation && translationKey !== 'menu') {
        // Если есть перевод И это НЕ ключ 'menu'
        await ctx.reply(message, {
          parse_mode: 'MarkdownV2', // Используем MarkdownV2 для других ключей
          reply_markup: keyboard.reply_markup,
        })
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
    ctx.wizard.next()
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
  logger.info('CASE 1: menuScene.next')
  if ('callback_query' in ctx.update && 'data' in ctx.update.callback_query) {
    const text = ctx.update.callback_query.data
    logger.info(`[menuNextStep] Callback Query Data: ${text}`)
    // Handle callback query buttons as before
    if (text === 'unlock_features') {
      logger.info('[menuNextStep] Handling callback: unlock_features')
      await ctx.scene.enter('subscriptionScene')
    } else {
      // Assuming other callbacks might be handled by handleMenu if they represent scene entries
      // or specific actions defined as callbacks
      logger.info(`[menuNextStep] Forwarding callback to handleMenu: ${text}`)
      await handleMenu(ctx) // handleMenu can process known callback_data
    }
  } else if ('message' in ctx.update && 'text' in ctx.update.message) {
    const text = ctx.update.message.text
    logger.info(`[menuNextStep] Text Message Received: ${text}`)

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
    // Let's re-send the menu if it's an unexpected text.
    // However, handleMenu is designed to map button texts to actions.
    // If the text matches a known menu button text, handleMenu will process it.
    // This means regular menu button presses (not commands, not callbacks) will still work.
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
