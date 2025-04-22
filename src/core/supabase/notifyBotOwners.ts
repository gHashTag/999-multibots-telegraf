// Хелпер для отправки уведомлений владельцам ботов через таблицу avatars
import { logger } from '@/utils/logger'
import { createBotByName } from '@/core/bot'
import { BotName } from '@/interfaces'
import { supabase } from '@/core/supabase'
import { toBotName } from '@/helpers/botName.helper'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'

// DEBUG MARKER: Version 2024-03-21-001
logger.info('🔍 Loading notifyBotOwners module v2024-03-21-001')

interface AvatarOwner {
  telegram_id: string
  username: string
  amount: number
  subscription: string
}

// Функция для отправки уведомлений владельцам бота
export async function notifyBotOwners(
  bot_name: string,
  message: string
): Promise<void> {
  try {
    const validBotName = toBotName(bot_name)
    const ownerBotData = await createBotByName(validBotName)

    if (!ownerBotData || !ownerBotData.bot) {
      logger.error('❌ Не удалось получить бота для отправки уведомлений:', {
        description: 'Failed to get bot for notifications',
        bot_name: validBotName,
      })
      return
    }

    const { data: owners, error } = await supabase
      .from('avatars')
      .select('telegram_id, username, amount, subscription')
      .eq('bot_name', validBotName)

    if (error) {
      logger.error('❌ Ошибка при получении владельцев из базы данных:', {
        description: 'Error getting owners from database',
        error,
      })
      return
    }

    if (!owners || owners.length === 0) {
      logger.warn('⚠️ Владельцы не найдены для бота:', {
        description: 'No owners found for bot',
        bot_name: validBotName,
      })
      return
    }

    for (const owner of owners) {
      try {
        await ownerBotData.bot.telegram.sendMessage(
          owner.telegram_id,
          `🔔 ${message}\n\nПользователь: ${owner.username}\nСумма: ${owner.amount}\nПодписка: ${owner.subscription}`
        )
        logger.info('✅ Уведомление успешно отправлено владельцу:', {
          description: 'Notification sent successfully to owner',
          owner: owner.username,
          bot_name: validBotName,
        })
      } catch (sendError) {
        logger.error('❌ Ошибка при отправке уведомления владельцу:', {
          description: 'Error sending notification to owner',
          owner: owner.username,
          error: sendError,
        })
      }
    }
  } catch (error) {
    logger.error('❌ Ошибка в notifyBotOwners:', {
      description: 'Error in notifyBotOwners',
      error,
    })
  }
}
