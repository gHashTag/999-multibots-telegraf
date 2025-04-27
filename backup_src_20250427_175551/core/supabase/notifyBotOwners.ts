// Помести этот код либо в начало src/services/payment.service.ts,
// либо в новый файл src/helpers/notifyBotOwners.ts (и импортируй)
import { logger } from '@/utils/logger'
import { createBotByName } from '@/core/bot'
import { supabase } from '@/core/supabase'

// Helper функция для отправки уведомления владельцам бота
export async function notifyBotOwners(
  bot_name: string,
  paymentInfo: {
    username: string
    telegram_id: string // ID пользователя, который оплатил
    amount: number
    stars: number
    subscription?: string
  }
): Promise<void> {
  // Добавил Promise<void> для ясности
  try {
    logger.info(`[NotifyOwners] Fetching owners for bot: ${bot_name}`)
    // Запрашиваем telegram_id владельцев из таблицы avatars по bot_name
    const { data: owners, error: ownersError } = await supabase
      .from('avatars') // Используем таблицу avatars
      .select('telegram_id') // Выбираем telegram_id владельцев
      .eq('bot_name', bot_name || 'neuro_blogger_bot') // Фильтруем по имени бота из платежа

    if (ownersError) {
      logger.error(
        `[NotifyOwners] Error fetching owners for bot ${bot_name}:`,
        ownersError
      )
      return // Не останавливаем процесс, просто логируем ошибку
    }

    if (!owners || owners.length === 0) {
      logger.warn(`[NotifyOwners] No owners found for bot ${bot_name}`)
      return
    }

    // Получаем инстанс бота для отправки сообщений
    const ownerBotData = await createBotByName(bot_name)
    if (!ownerBotData) {
      logger.error(
        `[NotifyOwners] Could not create bot instance for ${bot_name}`
      )
      return
    }
    const ownerBot = ownerBotData.bot

    // Формируем сообщение для владельца
    const ownerMessage = `✅ Новый платеж в боте @${bot_name}\nПользователь: @${
      paymentInfo.username || 'Без username'
    } (ID: ${paymentInfo.telegram_id})\nСумма: ${
      paymentInfo.amount
    } RUB\nЗвезд начислено: ${paymentInfo.stars}\n${
      paymentInfo.subscription
        ? `Подписка: ${paymentInfo.subscription}`
        : 'Пополнение баланса'
    }`

    logger.info(
      `[NotifyOwners] Sending notifications to ${owners.length} owners for bot ${bot_name}`
    )

    // Отправляем сообщение каждому владельцу
    for (const owner of owners) {
      if (owner.telegram_id) {
        try {
          // Отправляем сообщение в ЛС владельцу
          await ownerBot.telegram.sendMessage(owner.telegram_id, ownerMessage)
          logger.info(
            `[NotifyOwners] Sent notification to owner ${owner.telegram_id} for bot ${bot_name}`
          )
        } catch (sendError: any) {
          // Логируем ошибку, если не удалось отправить (например, бот заблокирован)
          logger.error(
            `[NotifyOwners] Failed to send notification to owner ${owner.telegram_id} for bot ${bot_name}:`,
            sendError.message // Логируем только сообщение об ошибке
          )
          // Не прерываем цикл
        }
      } else {
        logger.warn(
          `[NotifyOwners] Owner found with null telegram_id for bot ${bot_name}`
        )
      }
    }
  } catch (error) {
    // Логируем общую ошибку при уведомлении владельцев
    logger.error(
      `[NotifyOwners] General error notifying owners for bot ${bot_name}:`,
      error
    )
    // Не бросаем ошибку дальше, чтобы не прерывать основной процесс оплаты
  }
}
