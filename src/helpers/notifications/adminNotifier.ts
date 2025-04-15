import { logger } from '@/utils/logger'
import { createBotByName, pulseBot } from '@/core/bot'
import { supabase } from '@/core/supabase'
import { TransactionType } from '@/interfaces/payments.interface' // Убедимся, что импортирован

// --- Вспомогательные типы (можно вынести в общий файл) ---

interface BasePaymentDetails {
  telegram_id: number | string
  bot_name: string
  language_code?: string
  username?: string | null
}

interface SuccessfulPaymentDetails extends BasePaymentDetails {
  amount: number
  stars?: number
  currency?: string
  description: string
  operationId?: string
  currentBalance?: number
  newBalance?: number
  subscription?: string
  type: TransactionType
}

// --- Логика уведомлений администраторам ---

/**
 * Получает список владельцев бота из таблицы users.
 */
async function getBotOwnerIds(botName: string): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('telegram_id')
      .eq('bot_name', botName)
      .eq('is_bot_owner', true)

    if (error) {
      logger.error('❌ Ошибка при получении владельцев бота из users:', {
        error,
        botName,
      })
      return []
    }
    return data
      .map(owner => owner.telegram_id?.toString())
      .filter((id): id is string => !!id)
  } catch (error) {
    logger.error('❌ Непредвиденная ошибка при получении владельцев бота:', {
      error,
      botName,
    })
    return []
  }
}

/**
 * Отправляет уведомление о событии (например, платеже) администраторам и в группы.
 */
export async function notifyAdminsAboutPayment(
  details: SuccessfulPaymentDetails
): Promise<void> {
  const {
    telegram_id,
    bot_name,
    username,
    amount,
    stars,
    subscription,
    currency,
  } = details
  const userIdentifier = username ? `@${username}` : `ID: ${telegram_id}`
  const starsAmount = stars || amount
  // Определяем строку суммы в зависимости от валюты или наличия звезд
  const amountStr = currency === 'RUB' ? `${amount} RUB` : `${starsAmount} ⭐️`
  const starsStr = starsAmount ? `и получил ${starsAmount} ⭐️` : ''

  let message = `💸 Пользователь ${userIdentifier} оплатил ${amountStr} ${starsStr}.`
  if (subscription) {
    message = `💫 Пользователь ${userIdentifier} купил подписку \"${subscription}\" (${amountStr}) ${starsStr}.`
  }

  // 1. Отправка в @neuro_blogger_pulse
  const pulseGroupId = '@neuro_blogger_pulse'
  try {
    // Проверяем, доступен ли pulseBot и его методы
    if (pulseBot && pulseBot.telegram && pulseBot.telegram.sendMessage) {
      await pulseBot.telegram.sendMessage(pulseGroupId, message)
      logger.info(`✅ Уведомление отправлено в ${pulseGroupId}`, {
        telegram_id,
      })
    } else {
      logger.warn(
        `[notifyAdminsAboutPayment] pulseBot не инициализирован, пропуск отправки в ${pulseGroupId}.`
      )
    }
  } catch (error: any) {
    logger.error(`❌ Ошибка при отправке уведомления в ${pulseGroupId}:`, {
      error: error?.message || error,
      groupId: pulseGroupId,
    })
  }

  // 2. Отправка владельцам и в группу конкретного бота
  try {
    const botData = await createBotByName(bot_name)
    if (!botData?.bot) {
      logger.warn(
        `[notifyAdminsAboutPayment] Бот ${bot_name} не найден, уведомления владельцам/группе не отправлены.`
      )
      return // Выходим, если нет основного бота
    }
    const { groupId, bot } = botData
    const owners = await getBotOwnerIds(bot_name)
    let successfulOwnerNotifications = 0

    // Отправка владельцам
    if (owners.length > 0) {
      for (const ownerId of owners) {
        try {
          await bot.telegram.sendMessage(
            ownerId,
            `🔔 Уведомление\n\n${message}`
          )
          successfulOwnerNotifications++
        } catch (error: any) {
          logger.error('❌ Ошибка при отправке уведомления владельцу', {
            error: error?.message || error,
            ownerId,
            botName: bot_name,
          })
        }
      }
      logger.info('📊 Статистика отправки уведомлений владельцам', {
        totalOwners: owners.length,
        successful: successfulOwnerNotifications,
        botName: bot_name,
      })
    } else {
      logger.warn('⚠️ Не найдены владельцы бота для уведомлений', {
        botName: bot_name,
      })
    }

    // Отправка в группу бота
    if (groupId) {
      try {
        await bot.telegram.sendMessage(`@${groupId}`, message)
        logger.info(`✅ Уведомление отправлено в группу бота ${groupId}`, {
          botName: bot_name,
        })
      } catch (error: any) {
        logger.error('❌ Ошибка при отправке уведомления в группу бота', {
          error: error?.message || error,
          groupId,
          botName: bot_name,
        })
      }
    } else {
      logger.warn(
        '⚠️ groupId не настроен для бота, пропускаем отправку в группу',
        { botName: bot_name }
      )
    }
  } catch (error) {
    logger.error(
      '❌ Критическая ошибка при отправке уведомлений админам/группе',
      { error, botName: bot_name }
    )
  }
}
