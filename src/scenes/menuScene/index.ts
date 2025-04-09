import { Scenes } from 'telegraf'
import { MyContext, Subscription } from '@/interfaces'
import { logger } from '@/utils/logger'
import { handleMenu } from '@/handlers'
import { mainMenu } from '@/menu/mainMenu'
import { isRussian, isDev } from '@/helpers'
import { getReferalsCountAndUserData } from '@/core/supabase/getReferalsCountAndUserData'

export const menuScene = new Scenes.BaseScene<MyContext>('menu_scene')

menuScene.enter(async (ctx: MyContext) => {
  logger.info('🎯 Вход в меню', {
    description: 'Entering menu scene',
    telegram_id: ctx.from?.id,
    current_mode: ctx.session?.mode,
    action: 'enter_menu',
  })

  const isRu = isRussian(ctx)
  const telegram_id = ctx.from?.id?.toString() || ''

  try {
    // Получаем данные пользователя
    let newCount = 0
    let newSubscription: Subscription = 'stars'
    let newLevel = 0

    if (isDev) {
      newSubscription = 'neurobase'
    } else {
      const { count, subscription, level } =
        await getReferalsCountAndUserData(telegram_id)
      newCount = count
      newSubscription = subscription || 'stars'
      newLevel = level
    }

    // Формируем клавиатуру
    const keyboard = await mainMenu({
      isRu,
      inviteCount: newCount,
      subscription: newSubscription,
      ctx,
      level: newLevel,
      additionalButtons: [],
    })

    // Отправляем меню
    await ctx.reply(isRu ? '🏠 Главное меню' : '🏠 Main Menu', keyboard)

    logger.info('✅ Меню отправлено', {
      description: 'Menu sent successfully',
      telegram_id: ctx.from?.id,
      subscription: newSubscription,
      level: newLevel,
      action: 'menu_sent',
    })
  } catch (error) {
    logger.error('❌ Ошибка при формировании меню', {
      description: 'Error creating menu',
      telegram_id: ctx.from?.id,
      error: error instanceof Error ? error.message : 'Unknown error',
      action: 'menu_error',
    })
    await ctx.reply(
      isRu
        ? '❌ Произошла ошибка. Попробуйте позже.'
        : '❌ An error occurred. Please try again later.'
    )
  }
})

menuScene.on('text', async (ctx: MyContext) => {
  if (!ctx.message || !('text' in ctx.message)) {
    logger.warn('⚠️ Получено не текстовое сообщение', {
      description: 'Non-text message received',
      telegram_id: ctx.from?.id,
      action: 'skip_non_text',
    })
    return
  }

  const text = ctx.message.text
  logger.info('📝 Получено сообщение в меню', {
    description: 'Received text in menu',
    telegram_id: ctx.from?.id,
    message_text: text,
    current_mode: ctx.session?.mode,
    action: 'menu_message',
  })

  // Обрабатываем команды через handleMenu
  await handleMenu(ctx)
})
