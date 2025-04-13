import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { getUserBalance } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { getUserInfo } from '@/handlers/getUserInfo'

// Define scene ID constant
export const BALANCE_NOTIFIER_SCENE_ID = 'balanceNotifierScene'

/**
 * Scene for sending balance notifications to users
 * This scene allows users to enable or disable balance notifications
 * and set a threshold for when they should be notified
 */
export const balanceNotifierScene = new Scenes.BaseScene<MyContext>(BALANCE_NOTIFIER_SCENE_ID)

// Handle scene entry
balanceNotifierScene.enter(async (ctx) => {
  logger.info({
    message: '💰 Balance notifier setup',
    description: 'Entering balance notifier scene',
    telegram_id: ctx.from?.id,
  })

  const isRu = ctx.from?.language_code === 'ru'
  const { telegramId } = getUserInfo(ctx)
  
  try {
    // Get user's current balance
    const currentBalance = await getUserBalance(telegramId, ctx.botInfo.username)
    
    // Check if notification settings exist in session
    const notificationEnabled = ctx.session.balanceNotifications?.enabled || false
    const notificationThreshold = ctx.session.balanceNotifications?.threshold || 10
    
    // Prepare message based on current settings
    const message = isRu
      ? `💰 <b>Настройка уведомлений о балансе</b>\n\n` +
        `Текущий баланс: <b>${currentBalance.toFixed(2)}</b> ⭐️\n\n` +
        `Уведомления: <b>${notificationEnabled ? 'Включены ✅' : 'Выключены ❌'}</b>\n` +
        `Порог уведомления: <b>${notificationThreshold}</b> ⭐️\n\n` +
        `Выберите действие:`
      : `💰 <b>Balance Notification Settings</b>\n\n` +
        `Current balance: <b>${currentBalance.toFixed(2)}</b> ⭐️\n\n` +
        `Notifications: <b>${notificationEnabled ? 'Enabled ✅' : 'Disabled ❌'}</b>\n` +
        `Notification threshold: <b>${notificationThreshold}</b> ⭐️\n\n` +
        `Choose an action:`
    
    // Create keyboard with options
    await ctx.reply(message, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: isRu ? (notificationEnabled ? '🔕 Выключить' : '🔔 Включить') : (notificationEnabled ? '🔕 Disable' : '🔔 Enable'),
              callback_data: `toggle_notifications`
            }
          ],
          [
            {
              text: isRu ? '🔄 Изменить порог' : '🔄 Change threshold',
              callback_data: 'change_threshold'
            }
          ],
          [
            {
              text: isRu ? '🔙 Назад' : '🔙 Back',
              callback_data: 'back_to_menu'
            }
          ]
        ]
      }
    })
  } catch (error) {
    logger.error({
      message: '❌ Error in balance notifier scene',
      description: error instanceof Error ? error.message : String(error),
      telegram_id: ctx.from?.id,
    })
    
    const errorMessage = isRu
      ? '❌ Произошла ошибка при настройке уведомлений. Пожалуйста, попробуйте позже.'
      : '❌ An error occurred while setting up notifications. Please try again later.'
      
    await ctx.reply(errorMessage)
    await ctx.scene.leave()
  }
})

// Handle toggle notifications button
balanceNotifierScene.action('toggle_notifications', async (ctx) => {
  const isRu = ctx.from?.language_code === 'ru'
  
  // Initialize notifications settings if they don't exist
  if (!ctx.session.balanceNotifications) {
    ctx.session.balanceNotifications = {
      enabled: false,
      threshold: 10
    }
  }
  
  // Toggle notification state
  ctx.session.balanceNotifications.enabled = !ctx.session.balanceNotifications.enabled
  const enabled = ctx.session.balanceNotifications.enabled
  
  logger.info({
    message: `${enabled ? '🔔 Notifications enabled' : '🔕 Notifications disabled'}`,
    description: `User toggled balance notifications to ${enabled}`,
    telegram_id: ctx.from?.id,
  })
  
  const confirmationMessage = isRu
    ? `${enabled ? '✅ Уведомления о балансе включены' : '❌ Уведомления о балансе выключены'}`
    : `${enabled ? '✅ Balance notifications enabled' : '❌ Balance notifications disabled'}`
    
  await ctx.answerCbQuery(confirmationMessage)
  
  // Re-enter the scene to refresh the UI
  return ctx.scene.reenter()
})

// Handle change threshold button
balanceNotifierScene.action('change_threshold', async (ctx) => {
  const isRu = ctx.from?.language_code === 'ru'
  
  const promptMessage = isRu
    ? '📝 Пожалуйста, введите порог баланса для уведомлений (число звезд):'
    : '📝 Please enter the balance threshold for notifications (number of stars):'
    
  await ctx.reply(promptMessage)
  
  // Set scene state to indicate we're waiting for threshold input
  ctx.scene.session.waitingForThreshold = true
  
  await ctx.answerCbQuery()
})

// Handle back button
balanceNotifierScene.action('back_to_menu', async (ctx) => {
  logger.info({
    message: '🔙 Returning to menu',
    description: 'User exited balance notifier scene',
    telegram_id: ctx.from?.id,
  })
  
  await ctx.answerCbQuery()
  await ctx.scene.leave()
  
  // Assuming there's a menu scene to return to
  return ctx.scene.enter('menuScene')
})

// Handle text input (for threshold)
balanceNotifierScene.on('text', async (ctx) => {
  const isRu = ctx.from?.language_code === 'ru'
  
  // Only process text if we're waiting for threshold input
  if (ctx.scene.session.waitingForThreshold) {
    const thresholdText = ctx.message.text.trim()
    const threshold = parseFloat(thresholdText)
    
    // Validate input
    if (isNaN(threshold) || threshold <= 0) {
      const errorMessage = isRu
        ? '❌ Пожалуйста, введите положительное число.'
        : '❌ Please enter a positive number.'
        
      await ctx.reply(errorMessage)
      return
    }
    
    // Initialize notifications settings if they don't exist
    if (!ctx.session.balanceNotifications) {
      ctx.session.balanceNotifications = {
        enabled: false,
        threshold: 10
      }
    }
    
    // Update threshold
    ctx.session.balanceNotifications.threshold = threshold
    
    logger.info({
      message: '🔄 Balance threshold updated',
      description: `User updated balance notification threshold to ${threshold}`,
      telegram_id: ctx.from?.id,
    })
    
    // Reset waiting state
    ctx.scene.session.waitingForThreshold = false
    
    // Re-enter scene to refresh UI
    return ctx.scene.reenter()
  }
})

// Handle any command to exit the scene
balanceNotifierScene.command(['start', 'menu', 'exit', 'cancel'], async (ctx) => {
  logger.info({
    message: '🔙 Exiting notifier scene via command',
    description: 'User exited balance notifier scene with command',
    telegram_id: ctx.from?.id,
    command: ctx.message.text,
  })
  
  await ctx.scene.leave()
  return ctx.scene.enter('menuScene')
}) 