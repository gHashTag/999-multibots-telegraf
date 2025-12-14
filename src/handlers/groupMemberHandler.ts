/**
 * 🎯 Обработчик событий вступления/выхода из групп
 *
 * Автоматически выдаёт/отзывает доступ NEUROTESTER при:
 * - Вступлении в определённую группу → выдача доступа
 * - Выходе из группы → отзыв доступа
 */

import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { logger } from '@/utils/logger'
import { supabase } from '@/core/supabase'

// ID группы для автоматической выдачи доступа (t.me/c/2643951085)
const NEUROTESTER_GROUP_ID = -1002643951085

/**
 * Настроить обработчик событий chat_member
 */
export function setupGroupMemberHandler(bot: Telegraf<MyContext>): void {
  bot.on('chat_member', async (ctx) => {
    try {
      const update = ctx.update as any
      const chatMemberUpdate = update.chat_member

      if (!chatMemberUpdate) {
        return
      }

      const chatId = chatMemberUpdate.chat?.id
      const userId = chatMemberUpdate.new_chat_member?.user?.id
      const username = chatMemberUpdate.new_chat_member?.user?.username || userId?.toString()
      const oldStatus = chatMemberUpdate.old_chat_member?.status
      const newStatus = chatMemberUpdate.new_chat_member?.status

      // Проверяем, что это наша группа
      if (chatId !== NEUROTESTER_GROUP_ID) {
        return
      }

      logger.info('👥 [GroupMember] Chat member update', {
        chatId,
        userId,
        username,
        oldStatus,
        newStatus,
      })

      // Пользователь вступил в группу
      const joinedStatuses = ['member', 'administrator', 'creator']
      const leftStatuses = ['left', 'kicked', 'banned']

      if (
        leftStatuses.includes(oldStatus) &&
        joinedStatuses.includes(newStatus)
      ) {
        // Пользователь вступил → выдаём доступ
        await grantNeurotesterAccess(userId.toString(), username)
        logger.info('✅ [GroupMember] User joined, access granted', {
          userId,
          username,
        })
      } else if (
        joinedStatuses.includes(oldStatus) &&
        leftStatuses.includes(newStatus)
      ) {
        // Пользователь вышел → отзываем доступ
        await revokeNeurotesterAccess(userId.toString(), username)
        logger.info('🚫 [GroupMember] User left, access revoked', {
          userId,
          username,
        })
      }
    } catch (error) {
      logger.error('❌ [GroupMember] Error processing chat_member update', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })

  logger.info('✅ [GroupMember] Handler registered for group', {
    groupId: NEUROTESTER_GROUP_ID,
  })
}

/**
 * Выдать доступ NEUROTESTER пользователю
 */
async function grantNeurotesterAccess(telegramId: string, username: string): Promise<void> {
  // Проверяем, есть ли уже активный доступ
  const { data: existing } = await supabase
    .from('payments_v2')
    .select('id')
    .eq('telegram_id', telegramId)
    .eq('subscription_type', 'NEUROTESTER')
    .eq('status', 'COMPLETED')
    .maybeSingle()

  if (existing) {
    logger.info('⏭️ [GroupMember] User already has NEUROTESTER access', {
      telegramId,
      username,
    })
    return
  }

  // Создаём запись о доступе
  const { error } = await supabase.from('payments_v2').insert({
    telegram_id: telegramId,
    subscription_type: 'NEUROTESTER',
    status: 'COMPLETED',
    type: 'MONEY_INCOME',
    currency: 'RUB',
    amount: 0,
    stars: 0,
    bot_name: 'group_auto_grant',
    payment_date: new Date().toISOString(),
  })

  if (error) {
    logger.error('❌ [GroupMember] Error granting access', {
      telegramId,
      username,
      error: error.message,
    })
    throw error
  }

  logger.info('✅ [GroupMember] NEUROTESTER access granted', {
    telegramId,
    username,
  })
}

/**
 * Отозвать доступ NEUROTESTER у пользователя
 */
async function revokeNeurotesterAccess(telegramId: string, username: string): Promise<void> {
  // Находим активную подписку, выданную автоматически (bot_name = 'group_auto_grant' или 'admin_script')
  const { data: subscriptions } = await supabase
    .from('payments_v2')
    .select('id, bot_name')
    .eq('telegram_id', telegramId)
    .eq('subscription_type', 'NEUROTESTER')
    .eq('status', 'COMPLETED')
    .in('bot_name', ['group_auto_grant', 'admin_script'])

  if (!subscriptions || subscriptions.length === 0) {
    logger.info('⏭️ [GroupMember] No auto-granted subscription to revoke', {
      telegramId,
      username,
    })
    return
  }

  // Помечаем подписки как отозванные
  const { error } = await supabase
    .from('payments_v2')
    .update({ status: 'REVOKED' })
    .eq('telegram_id', telegramId)
    .eq('subscription_type', 'NEUROTESTER')
    .in('bot_name', ['group_auto_grant', 'admin_script'])

  if (error) {
    logger.error('❌ [GroupMember] Error revoking access', {
      telegramId,
      username,
      error: error.message,
    })
    throw error
  }

  logger.info('🚫 [GroupMember] NEUROTESTER access revoked', {
    telegramId,
    username,
    revokedCount: subscriptions.length,
  })
}
