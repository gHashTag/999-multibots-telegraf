import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'

export async function checkSubscription(
  ctx: MyContext,
  telegram_channel_id: string
): Promise<boolean> {
  try {
    if (!ctx.from?.id) {
      console.error('User ID is undefined')
      throw new Error('User ID is undefined')
    }
    const chatMember = await ctx.telegram.getChatMember(
      telegram_channel_id,
      ctx.from?.id
    )
    console.log('chatMember', chatMember)

    return ['member', 'administrator', 'creator'].includes(chatMember.status)
  } catch (error) {
    console.error('Error checking subscription:', error)
    throw error
  }
}

/**
 * Кикает пользователя из группы, если он не оплачен
 * @param ctx Контекст Telegram
 * @param telegram_channel_id ID канала/группы
 * @param reason Причина кика
 */
export async function kickUnpaidUser(
  ctx: MyContext,
  telegram_channel_id: string,
  reason: string = 'Неоплаченная подписка'
): Promise<boolean> {
  try {
    if (!ctx.from?.id) {
      logger.error('Cannot kick user: User ID is undefined')
      return false
    }

    const userId = ctx.from.id
    const username = ctx.from.username || ctx.from.first_name || 'Unknown'

    logger.info('🚫 Attempting to kick unpaid user from group', {
      userId,
      username,
      telegram_channel_id,
      reason,
    })

    // Проверяем, является ли пользователь участником группы
    try {
      const chatMember = await ctx.telegram.getChatMember(
        telegram_channel_id,
        userId
      )

      // Если пользователь не в группе или уже забанен, не нужно кикать
      if (['left', 'kicked'].includes(chatMember.status)) {
        logger.info('User is not in the group or already kicked', {
          userId,
          status: chatMember.status,
        })
        return true
      }

      // Нельзя кикать администраторов и создателей
      if (['administrator', 'creator'].includes(chatMember.status)) {
        logger.warn('Cannot kick admin or creator', {
          userId,
          status: chatMember.status,
        })
        return false
      }
    } catch (memberCheckError) {
      logger.warn('Error checking member status before kick', {
        error: memberCheckError,
        userId,
      })
      // Продолжаем попытку кика, возможно пользователь есть в группе
    }

    // Кикаем пользователя
    await ctx.telegram.banChatMember(
      telegram_channel_id,
      userId,
      Math.floor(Date.now() / 1000) + 60, // Бан на 1 минуту, потом может вернуться
      { revoke_messages: false } // Не удаляем сообщения
    )

    logger.info('✅ Successfully kicked unpaid user from group', {
      userId,
      username,
      telegram_channel_id,
      reason,
    })

    // Отправляем уведомление пользователю
    try {
      const isRu = ctx.from?.language_code === 'ru'
      const kickMessage = isRu
        ? `🚫 Вы были исключены из группы @${telegram_channel_id}

📋 Причина: ${reason}

💡 Чтобы вернуться в группу:
💳 Оформите подписку в боте

🔄 После оплаты вы сможете снова присоединиться к группе`
        : `🚫 You have been removed from group @${telegram_channel_id}

📋 Reason: ${reason}

💡 To return to the group:
💳 Get a subscription in the bot

🔄 After payment you can rejoin the group`

      await ctx.telegram.sendMessage(userId, kickMessage)
    } catch (notifyError) {
      logger.warn('Could not notify user about kick', {
        error: notifyError,
        userId,
      })
    }

    return true
  } catch (error) {
    logger.error('❌ Error kicking unpaid user from group', {
      error: error instanceof Error ? error.message : String(error),
      userId: ctx.from?.id,
      telegram_channel_id,
      reason,
    })
    return false
  }
}
