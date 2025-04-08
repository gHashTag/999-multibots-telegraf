import { Mode, MyContext, Subscription } from '../../interfaces'
import { sendGenericErrorMessage } from '@/menu'
import { levels, mainMenu } from '../../menu/mainMenu'
import { getReferalsCountAndUserData } from '@/core/supabase/getReferalsCountAndUserData'
import { isDev, isRussian } from '@/helpers'
import { sendReplyWithKeyboard } from './sendReplyWithKeyboard'
import { getText } from './getText'
import { Logger as logger } from '@/utils/logger'
import { WizardScene } from 'telegraf/scenes'

import { handleMenu } from '@/handlers'
import { checkFullAccess } from '@/handlers/checkFullAccess'
import { getTranslation } from '@/core'
import { sendTutorialMessage } from '@/handlers/sendTutorialMessage'
import { ModeEnum } from '@/price/helpers/modelsCost'

const menuCommandStep = async (ctx: MyContext) => {
  const telegramId = ctx.from?.id?.toString()
  logger.info('🎯 Entering menuCommandStep', {
    description: 'Starting menu command step',
    telegram_id: telegramId,
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
      logger.info('🔧 Development mode detected', {
        description: 'Using development mode settings',
        telegram_id
      })
      console.log('CASE 🦄: isDev')
      newCount = 0
      newSubscription = 'neurobase'
      newLevel = 0
    } else {
      logger.info('📊 Fetching user data', {
        description: 'Getting user referrals and data',
        telegram_id
      })
      const { count, subscription, level } = await getReferalsCountAndUserData(
        telegram_id
      )
      newCount = count
      newSubscription = subscription || 'stars'
      newLevel = level
    }

    logger.info('👤 User data loaded', {
      description: 'User data retrieved',
      telegram_id,
      subscription: newSubscription,
      level: newLevel,
      referral_count: newCount
    })

    console.log('newSubscription', newSubscription)
    const additionalButtons = [
      levels[100], // Пополнить баланс
      levels[101], // Баланс
      levels[102], // Пригласить друга
      levels[103], // Помощь
      levels[104], // Техподдержка
    ]

    logger.info('⌨️ Building menu keyboard', {
      description: 'Preparing menu keyboard layout',
      telegram_id,
      subscription: newSubscription
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

    const url = `https://neuro-blogger-web-u14194.vm.elestio.app/neuro_sage/1/1/1/1/1/${
      newCount + 1
    }`

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

    const hasFullAccess = checkFullAccess(newSubscription)
    const message = getText(isRu, 'mainMenu')

    logger.info('🎮 Preparing menu response', {
      description: 'Setting up menu response',
      telegram_id,
      has_full_access: hasFullAccess,
      subscription: newSubscription
    })

    if (!hasFullAccess) {
      logger.info('🔒 Limited access menu', {
        description: 'Showing limited access menu',
        telegram_id
      })
      console.log('CASE: !hasFullAccess - stars level')
      const { translation, url: photo_url } = await getTranslation('digitalAvatar', ctx)
      await sendReplyWithKeyboard(
        ctx,
        translation,
        inlineKeyboard,
        keyboard,
        photo_url
      )
      await sendTutorialMessage(ctx, isRu)
    } else {
      logger.info('🔓 Full access menu', {
        description: 'Showing full access menu',
        telegram_id
      })
      await sendReplyWithKeyboard(ctx, message, inlineKeyboard, keyboard)
    }

    logger.info('➡️ Moving to next wizard step', {
      description: 'Transitioning to next menu step',
      telegram_id
    })
    ctx.wizard.next()
  } catch (error) {
    logger.error('❌ Error in menu command', {
      description: 'Error occurred in menu command step',
      telegram_id: ctx.from?.id?.toString(),
      error: error instanceof Error ? error.message : String(error)
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
    update_type: ctx.updateType
  })

  console.log('CASE 1: menuScene.next')
  if ('callback_query' in ctx.update && 'data' in ctx.update.callback_query) {
    const text = ctx.update.callback_query.data
    logger.info('🔄 Processing callback query', {
      description: 'Handling callback data',
      telegram_id: telegramId,
      callback_data: text
    })
    console.log('text 1', text)
    if (text === 'unlock_features') {
      logger.info('🔓 Unlocking features', {
        description: 'User requested feature unlock',
        telegram_id: telegramId
      })
      console.log('CASE: 🔓 Разблокировать все функции')
      await ctx.scene.enter('subscriptionScene')
    }
  } else if ('message' in ctx.update && 'text' in ctx.update.message) {
    const text = ctx.update.message.text
    logger.info('💬 Processing text message', {
      description: 'Handling text message in menu',
      telegram_id: telegramId,
      message_text: text
    })
    console.log('CASE menuNextStep: text 2', text)
    await handleMenu(ctx)
    return
  } else {
    logger.info('⚠️ Unhandled update type', {
      description: 'Received unhandled update type in menu',
      telegram_id: telegramId,
      update_type: ctx.updateType
    })
    console.log('CASE: menuScene.next.else')
  }
  
  logger.info('🚪 Leaving menu scene', {
    description: 'Exiting menu scene',
    telegram_id: telegramId
  })
  ctx.scene.leave()
}

export const menuScene = new WizardScene(
  'menuScene',
  menuCommandStep,
  menuNextStep
)
