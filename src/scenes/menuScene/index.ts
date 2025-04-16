import { MyContext, Subscription } from '../../interfaces'
import { sendGenericErrorMessage } from '@/menu'
import { levels, mainMenu } from '../../menu/mainMenu'
import { getReferalsCountAndUserData } from '@/core/supabase/getReferalsCountAndUserData'
import { isDev, isRussian } from '@/helpers'
import { getText } from './getText'
import { WizardScene } from 'telegraf/scenes'
import { logger } from '@/utils/logger'
import { ModeEnum } from '@/interfaces/modes'
import { handleMenu } from '@/handlers'

const menuCommandStep = async (ctx: MyContext) => {
  console.log('CASE 📲: menuCommand')
  const isRu = isRussian(ctx)
  try {
    const telegram_id = ctx.from?.id?.toString() || ''

    let newCount = 0
    let newSubscription: Subscription
    let newLevel: number

    if (isDev) {
      console.log('CASE 🦄: isDev')
      newCount = 0
      newSubscription = 'neurobase'
      newLevel = 0
    } else {
      const { count, subscription, level } =
        await getReferalsCountAndUserData(telegram_id)
      newCount = count
      newSubscription = subscription || 'stars'
      newLevel = level
    }

    logger.info('🔄 Инициализация меню:', {
      description: 'Menu initialization',
      telegram_id,
      subscription: newSubscription,
      level: newLevel,
      count: newCount,
    })

    const additionalButtons = [
      levels[100], // Пополнить баланс
      levels[101], // Баланс
      levels[102], // Пригласить друга
      levels[103], // Помощь
      levels[104], // Техподдержка
    ]

    const keyboard = await mainMenu({
      isRu,
      inviteCount: newCount,
      subscription: newSubscription,
      ctx,
      level: newLevel,
      additionalButtons:
        newSubscription === 'neurophoto' ? additionalButtons : [],
    })

    const message = getText(isRu, 'mainMenu')
    await ctx.reply(message, keyboard)

    logger.info('✅ Меню успешно отображено:', {
      description: 'Menu displayed successfully',
      telegram_id,
      subscription: newSubscription,
    })

    return ctx.wizard.next()
  } catch (error) {
    logger.error('❌ Ошибка в меню:', {
      description: 'Error in menu',
      error: error instanceof Error ? error.message : String(error),
      telegram_id: ctx.from?.id,
    })
    await sendGenericErrorMessage(ctx, isRu, error as Error)
    return ctx.scene.leave()
  }
}

const menuNextStep = async (ctx: MyContext) => {
  console.log('CASE 1: menuScene.next')
  if ('callback_query' in ctx.update && 'data' in ctx.update.callback_query) {
    const text = ctx.update.callback_query.data
    console.log('text 1', text)
    if (text === 'unlock_features') {
      console.log('CASE: 🔓 Разблокировать все функции')
      await ctx.scene.enter(ModeEnum.SubscriptionScene)
    }
  } else if ('message' in ctx.update && 'text' in ctx.update.message) {
    const text = ctx.update.message.text
    console.log('CASE menuNextStep: text 2', text)
    await handleMenu(ctx)
    return
  } else {
    console.log('CASE: menuScene.next.else')
  }
  ctx.scene.leave()
}

export const menuScene = new WizardScene(
  'menuScene',
  menuCommandStep,
  menuNextStep
)
