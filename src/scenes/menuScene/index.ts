import { Mode, MyContext, Subscription } from '../../interfaces'
import { sendGenericErrorMessage } from '@/menu'
import { levels, mainMenu } from '../../menu/mainMenu'
import { getReferalsCountAndUserData } from '@/core/supabase/getReferalsCountAndUserData'
import { isDev, isRussian } from '@/helpers'
import { sendReplyWithKeyboard } from './sendReplyWithKeyboard'
import { getText } from './getText'
import { logger } from '@/utils/logger'
import { WizardScene } from 'telegraf/scenes'

import { handleMenu } from '@/handlers'
import { checkFullAccess } from '@/handlers/checkFullAccess'
import { getTranslation } from '@/core'
import { sendTutorialMessage } from '@/handlers/sendTutorialMessage'
import { ModeEnum } from '@/price/helpers/modelsCost'

export const menuCommandStep = async (ctx: MyContext) => {
  logger.info('🎯 Вход в menuCommandStep', {
    description: 'Starting menu command step',
    telegram_id: ctx.from?.id,
    full_session_state: ctx.session,
    session_mode: ctx.session?.mode
  })

  console.log('CASE 📲: menuCommand')
  const isRu = isRussian(ctx)
  try {
    const telegram_id = ctx.from?.id?.toString() || ''

    let newCount = 0
    let newSubscription: Subscription
    let newLevel: number

    if (isDev) {
      logger.info('🔧 Режим разработки', {
        description: 'Using development mode settings',
        telegram_id,
        action: 'dev_mode_detected'
      })
      console.log('CASE 🦄: isDev')
      newCount = 0
      newSubscription = 'neurobase'
      newLevel = 0
    } else {
      logger.info('📊 Запрос данных пользователя', {
        description: 'Getting user referrals and data',
        telegram_id,
        action: 'fetch_user_data'
      })
      const { count, subscription, level } =
        await getReferalsCountAndUserData(telegram_id)
      newCount = count
      newSubscription = subscription || 'stars'
      newLevel = level

      logger.info('👤 Данные пользователя получены', {
        description: 'User data retrieved',
        telegram_id,
        subscription: newSubscription,
        level: newLevel,
        referral_count: newCount,
        action: 'user_data_loaded'
      })
    }

    console.log('newSubscription', newSubscription)
    const additionalButtons = [
      levels[100], // Пополнить баланс
      levels[101], // Баланс
      levels[102], // Пригласить друга
      levels[103], // Помощь
      levels[104], // Техподдержка
    ]

    logger.info('⌨️ Подготовка клавиатуры меню', {
      description: 'Preparing menu keyboard layout',
      telegram_id,
      subscription: newSubscription,
      action: 'prepare_keyboard'
    })

    const keyboard = await mainMenu({
      isRu,
      inviteCount: newCount,
      subscription: newSubscription,
      ctx,
      level: newLevel,
      additionalButtons:
        newSubscription === 'neurophoto' ? additionalButtons : [],
    })

    // Проверка условий для отправки сообщения
    if (newLevel === 3 && newSubscription === 'neurophoto') {
      logger.info('📨 Отправка сообщения для neurophoto level 3', {
        description: 'Sending message for neurophoto level 3',
        telegram_id,
        level: newLevel,
        subscription: newSubscription,
        action: 'send_neurophoto_message'
      })
      console.log('CASE: newLevel === 3 && newSubscription === neurophoto')
      const message = getText(isRu, 'mainMenu')
      console.log('message', message)
      await ctx.reply(message, keyboard)
    }

    // Проверка условий для отправки сообщения
    if (newSubscription === 'neurotester') {
      logger.info('📨 Отправка сообщения для neurotester', {
        description: 'Sending message for neurotester',
        telegram_id,
        subscription: newSubscription,
        action: 'send_neurotester_message'
      })
      console.log('CASE: newSubscription === neurotester')
      const message = getText(isRu, 'mainMenu')
      console.log('message', message)
      await ctx.reply(message, keyboard)
      ctx.wizard.next()
      return
    }

    const url = `https://neuro-blogger-web-u14194.vm.elestio.app/neuro_sage/1/1/1/1/1/${
      newCount + 1
    }`

    const nextLevel = levels[newCount + 1]
    const nameStep = nextLevel
      ? isRu
        ? nextLevel.title_ru
        : nextLevel.title_en
      : isRu
        ? 'Неизвестный уровень'
        : 'Unknown level'

    const inlineKeyboard = [
      ...(newCount >= 1
        ? [
            [
              {
                text: isRu ? '🚀 Открыть нейроквест' : '🚀 Open neuroquest',
                web_app: { url },
              },
            ],
          ]
        : []),
    ]

    console.log('nameStep 1', nameStep)
    const hasFullAccess = checkFullAccess(newSubscription)
    let message: string = ''

    const levelKeys: { [key: number]: ModeEnum } = {
      1: ModeEnum.SelectModel,
      2: ModeEnum.NeuroPhoto,
      3: ModeEnum.ImageToPrompt,
      4: ModeEnum.Avatar,
      5: ModeEnum.ChatWithAvatar,
      6: ModeEnum.SelectModel,
      7: ModeEnum.Voice,
      8: ModeEnum.TextToSpeech,
      9: ModeEnum.ImageToVideo,
      10: ModeEnum.TextToVideo,
      11: ModeEnum.TextToImage,
    }

    const levelModes: { [key: number]: ModeEnum } = {
      1: ModeEnum.SelectModel,
      2: ModeEnum.TextToImage,
      3: ModeEnum.ImageToPrompt,
      4: ModeEnum.Avatar,
      5: ModeEnum.ChatWithAvatar,
      6: ModeEnum.SelectModel,
      7: ModeEnum.Voice,
      8: ModeEnum.TextToSpeech,
      9: ModeEnum.ImageToVideo,
      10: ModeEnum.TextToVideo,
      11: ModeEnum.TextToImage,
    }

    const translationKey = levelKeys[newLevel + 1]
    const newMode = levelModes[newLevel + 1]

    if (!hasFullAccess) {
      logger.info('🔒 Обработка меню для пользователя без полного доступа', {
        description: 'Processing menu for user without full access',
        telegram_id: ctx.from?.id,
        subscription: newSubscription,
        level: newLevel,
        action: 'process_limited_access'
      })

      console.log('CASE: !hasFullAccess - stars level')
      const { translation, url } = await getTranslation({
        key: translationKey || 'select_model',
        ctx,
        bot_name: ctx.botInfo.username,
      })

      message = translation
      const photo_url = url
      await sendReplyWithKeyboard(
        ctx,
        message,
        inlineKeyboard,
        keyboard,
        photo_url
      )
      await sendTutorialMessage(ctx, isRu)
    } else {
      logger.info('🔓 Обработка меню для пользователя с полным доступом', {
        description: 'Processing menu for user with full access',
        telegram_id: ctx.from?.id,
        subscription: newSubscription,
        level: newLevel,
        current_mode: ctx.session?.mode,
        action: 'process_full_access'
      })

      // Просто переходим к следующему шагу
      logger.info('⏭️ Переход к следующему шагу', {
        description: 'Proceeding to next step',
        telegram_id: ctx.from?.id,
        current_mode: ctx.session?.mode,
        action: 'proceed_next_step'
      })

      ctx.wizard.next()
      return
    }
  } catch (error) {
    logger.error('❌ Ошибка в меню', {
      description: 'Error in menu command',
      telegram_id: ctx.from?.id,
      error: error instanceof Error ? error.message : 'Unknown error',
      action: 'menu_error'
    })
    console.error('Error in menu command:', error)
    await sendGenericErrorMessage(ctx, isRu, error as Error)
    ctx.scene.leave()
    throw error
  }
}

const menuNextStep = async (ctx: MyContext) => {
  const telegramId = ctx.from?.id?.toString()
  logger.info('🎯 Entering menuNextStep', {
    description: 'Starting next menu step',
    telegram_id: telegramId,
    update_type: ctx.updateType,
  })

  console.log('CASE 1: menuScene.next')
  if ('callback_query' in ctx.update && 'data' in ctx.update.callback_query) {
    const text = ctx.update.callback_query.data
    logger.info('🔄 Processing callback query', {
      description: 'Handling callback data',
      telegram_id: telegramId,
      callback_data: text,
    })
    console.log('text 1', text)
    if (text === 'unlock_features') {
      logger.info('🔓 Unlocking features', {
        description: 'User requested feature unlock',
        telegram_id: telegramId,
      })
      console.log('CASE: 🔓 Разблокировать все функции')
      await ctx.scene.enter(ModeEnum.SubscriptionCheckScene)
    }
  } else if ('message' in ctx.update && 'text' in ctx.update.message) {
    const text = ctx.update.message.text
    logger.info('💬 Processing text message', {
      description: 'Handling text message in menu',
      telegram_id: telegramId,
      message_text: text,
    })
    console.log('CASE menuNextStep: text 2', text)
    await handleMenu(ctx)
    return
  } else {
    logger.info('⚠️ Unhandled update type', {
      description: 'Received unhandled update type in menu',
      telegram_id: telegramId,
      update_type: ctx.updateType,
    })
    console.log('CASE: menuScene.next.else')
  }

  logger.info('🚪 Leaving menu scene', {
    description: 'Exiting menu scene',
    telegram_id: telegramId,
  })
  ctx.scene.leave()
}

export const menuScene = new WizardScene(
  ModeEnum.MenuScene,
  menuCommandStep,
  menuNextStep
)
