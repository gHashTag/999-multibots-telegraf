import { MyContext } from '@/interfaces'
import { adminRenewSubscription } from '@/core/supabase/adminRenewSubscription'
import { checkSubscriptionByTelegramId } from '@/core/supabase/checkSubscriptionByTelegramId'
import { getUserByTelegramId } from '@/core/supabase/getUserByTelegramId'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { logger } from '@/utils/logger'
import { isRussian } from '@/helpers'

/**
 * Команда для продления подписки пользователю
 * Доступна только администраторам
 */
export async function extendUserSubscriptionCommand(ctx: MyContext) {
  const isRu = isRussian(ctx)
  const adminId = ctx.from?.id
  
  // Проверяем, что команду вызывает администратор
  const adminIds = process.env.ADMIN_IDS
    ? process.env.ADMIN_IDS.split(',').map(id => parseInt(id.trim(), 10))
    : []
  
  if (!adminId || !adminIds.includes(adminId)) {
    await ctx.reply(
      isRu 
        ? '❌ У вас нет прав для выполнения этой команды'
        : '❌ You do not have permission to execute this command'
    )
    return
  }

  // Целевой пользователь для продления подписки
  const targetUserId = '7007992081'
  
  try {
    logger.info('📱 [ExtendSubscription] Starting subscription extension', {
      targetUserId,
      adminId,
      botName: ctx.botInfo?.username
    })

    // Проверяем, существует ли пользователь
    const user = await getUserByTelegramId(targetUserId)
    if (!user) {
      await ctx.reply(
        isRu
          ? `❌ Пользователь с ID ${targetUserId} не найден в системе`
          : `❌ User with ID ${targetUserId} not found in the system`
      )
      return
    }

    // Проверяем текущий статус подписки
    const currentSubscription = await checkSubscriptionByTelegramId(targetUserId)
    logger.info('📊 [ExtendSubscription] Current subscription status', {
      targetUserId,
      currentSubscription
    })

    // Продлеваем подписку NEUROPHOTO на 30 дней
    const result = await adminRenewSubscription({
      telegram_id: targetUserId,
      subscription_type: SubscriptionType.NEUROPHOTO,
      duration_days: 30,
      bot_name: ctx.botInfo?.username || 'unknown_bot',
      reason: 'Продление подписки для доиспользования ботов'
    })

    if (result.success) {
      logger.info('✅ [ExtendSubscription] Subscription extended successfully', {
        targetUserId,
        subscriptionType: SubscriptionType.NEUROPHOTO,
        durationDays: 30
      })

      // Отправляем уведомление администратору
      await ctx.reply(
        isRu
          ? `✅ Подписка NEUROPHOTO для пользователя ${targetUserId} успешно продлена на 30 дней!

📊 Детали:
• ID пользователя: ${targetUserId}
• Имя: ${user.first_name || 'Не указано'} ${user.last_name || ''}
• Username: @${user.username || 'не указан'}
• Тип подписки: NEUROPHOTO
• Период продления: 30 дней
• Причина: Доиспользование ботов`
          : `✅ NEUROPHOTO subscription for user ${targetUserId} has been extended for 30 days!

📊 Details:
• User ID: ${targetUserId}
• Name: ${user.first_name || 'Not specified'} ${user.last_name || ''}
• Username: @${user.username || 'not specified'}
• Subscription type: NEUROPHOTO
• Extension period: 30 days
• Reason: Bot usage completion`
      )

      // Также отправляем уведомление самому пользователю
      try {
        await ctx.telegram.sendMessage(
          targetUserId,
          isRu
            ? `🎉 Ваша подписка NEUROPHOTO была продлена на 30 дней!

Теперь вы можете продолжить использовать все функции бота и доиспользовать свои генерации.

Приятного использования! 💫`
            : `🎉 Your NEUROPHOTO subscription has been extended for 30 days!

You can now continue using all bot features and complete your generations.

Enjoy! 💫`
        )
        
        await ctx.reply(
          isRu
            ? '✉️ Уведомление отправлено пользователю'
            : '✉️ Notification sent to user'
        )
      } catch (notifyError) {
        logger.error('❌ [ExtendSubscription] Error sending notification to user', {
          targetUserId,
          error: notifyError instanceof Error ? notifyError.message : 'Unknown error'
        })
        
        await ctx.reply(
          isRu
            ? '⚠️ Подписка продлена, но не удалось отправить уведомление пользователю'
            : '⚠️ Subscription extended, but failed to send notification to user'
        )
      }
    } else {
      logger.error('❌ [ExtendSubscription] Failed to extend subscription', {
        targetUserId,
        error: result.error
      })

      await ctx.reply(
        isRu
          ? `❌ Не удалось продлить подписку для пользователя ${targetUserId}

Ошибка: ${result.error || 'Неизвестная ошибка'}`
          : `❌ Failed to extend subscription for user ${targetUserId}

Error: ${result.error || 'Unknown error'}`
      )
    }
  } catch (error) {
    logger.error('❌ [ExtendSubscription] Exception in extendUserSubscriptionCommand', {
      targetUserId,
      adminId,
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    await ctx.reply(
      isRu
        ? `❌ Произошла ошибка при продлении подписки: ${
            error instanceof Error ? error.message : 'Неизвестная ошибка'
          }`
        : `❌ An error occurred while extending subscription: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
    )
  }
}

/**
 * Универсальная команда для продления подписки любому пользователю
 * Формат: /extend_subscription <telegram_id> <subscription_type> <days>
 */
export async function extendSubscriptionUniversal(ctx: MyContext) {
  const isRu = isRussian(ctx)
  const adminId = ctx.from?.id
  
  // Проверяем права администратора
  const adminIds = process.env.ADMIN_IDS
    ? process.env.ADMIN_IDS.split(',').map(id => parseInt(id.trim(), 10))
    : []
  
  if (!adminId || !adminIds.includes(adminId)) {
    await ctx.reply(
      isRu 
        ? '❌ У вас нет прав для выполнения этой команды'
        : '❌ You do not have permission to execute this command'
    )
    return
  }

  // Парсим параметры команды
  const messageText = ctx.message && 'text' in ctx.message ? ctx.message.text : ''
  const parts = messageText.split(' ')
  
  if (parts.length < 4) {
    await ctx.reply(
      isRu
        ? `❌ Неверный формат команды

Используйте: /extend_subscription <telegram_id> <subscription_type> <days>

Доступные типы подписок:
• NEUROPHOTO
• NEUROVIDEO
• STARS
• NEUROTESTER

Пример: /extend_subscription 7007992081 NEUROPHOTO 30`
        : `❌ Invalid command format

Use: /extend_subscription <telegram_id> <subscription_type> <days>

Available subscription types:
• NEUROPHOTO
• NEUROVIDEO
• STARS
• NEUROTESTER

Example: /extend_subscription 7007992081 NEUROPHOTO 30`
    )
    return
  }

  const targetUserId = parts[1]
  const subscriptionType = parts[2].toUpperCase() as SubscriptionType
  const days = parseInt(parts[3], 10)

  // Валидация параметров
  if (!Object.values(SubscriptionType).includes(subscriptionType)) {
    await ctx.reply(
      isRu
        ? `❌ Неверный тип подписки: ${subscriptionType}`
        : `❌ Invalid subscription type: ${subscriptionType}`
    )
    return
  }

  if (isNaN(days) || days <= 0 || days > 365) {
    await ctx.reply(
      isRu
        ? '❌ Количество дней должно быть от 1 до 365'
        : '❌ Number of days must be between 1 and 365'
    )
    return
  }

  try {
    // Проверяем существование пользователя
    const user = await getUserByTelegramId(targetUserId)
    if (!user) {
      await ctx.reply(
        isRu
          ? `❌ Пользователь с ID ${targetUserId} не найден`
          : `❌ User with ID ${targetUserId} not found`
      )
      return
    }

    // Продлеваем подписку
    const result = await adminRenewSubscription({
      telegram_id: targetUserId,
      subscription_type: subscriptionType,
      duration_days: days,
      bot_name: ctx.botInfo?.username || 'unknown_bot',
      reason: `Admin extension by ${adminId}`
    })

    if (result.success) {
      await ctx.reply(
        isRu
          ? `✅ Подписка ${subscriptionType} для пользователя ${targetUserId} продлена на ${days} дней!`
          : `✅ ${subscriptionType} subscription for user ${targetUserId} extended for ${days} days!`
      )

      // Уведомляем пользователя
      try {
        await ctx.telegram.sendMessage(
          targetUserId,
          isRu
            ? `🎉 Ваша подписка ${subscriptionType} была продлена на ${days} дней!`
            : `🎉 Your ${subscriptionType} subscription has been extended for ${days} days!`
        )
      } catch (e) {
        logger.error('Failed to notify user about subscription extension', { targetUserId })
      }
    } else {
      await ctx.reply(
        isRu
          ? `❌ Ошибка при продлении подписки: ${result.error}`
          : `❌ Error extending subscription: ${result.error}`
      )
    }
  } catch (error) {
    logger.error('Exception in extendSubscriptionUniversal', { error })
    await ctx.reply(
      isRu
        ? '❌ Произошла ошибка при выполнении команды'
        : '❌ An error occurred while executing the command'
    )
  }
}