import { logger } from '@/utils/logger'
import { Telegram } from 'telegraf'
import { supabase } from '@/supabase'
import { isDev } from '@/config'
import { TransactionType } from '@/interfaces/payments.interface'

/**
 * Интерфейс для параметров уведомления амбассадора
 */
export interface AmbassadorNotificationParams {
  /** ID пользователя, совершившего платеж */
  user_telegram_id: number | string

  /** Имя бота, в котором произошел платеж */
  bot_name: string

  /** Сумма платежа */
  amount: number

  /** Количество звезд */
  stars: number

  /** Тип транзакции */
  transaction_type: TransactionType | string

  /** Описание транзакции */
  description: string

  /** ID операции */
  operation_id: string
}

/**
 * Получает информацию об амбассадоре по имени бота
 * @param bot_name Имя бота
 * @returns Данные амбассадора или null, если не найден
 */
export async function getAmbassadorByBotName(bot_name: string) {
  try {
    const { data, error } = await supabase
      .from('avatars')
      .select('telegram_id, bot_name, group')
      .eq('bot_name', bot_name)
      .single()

    if (error) {
      logger.error('❌ Ошибка при получении данных амбассадора:', {
        description: 'Error fetching ambassador data',
        error: error.message,
        bot_name,
      })
      return null
    }

    if (!data) {
      logger.warn('⚠️ Амбассадор не найден для бота:', {
        description: 'Ambassador not found for bot',
        bot_name,
      })
      return null
    }

    return data
  } catch (error) {
    logger.error('❌ Ошибка при получении данных амбассадора:', {
      description: 'Error in getAmbassadorByBotName',
      error: error instanceof Error ? error.message : String(error),
      bot_name,
    })
    return null
  }
}

/**
 * Форматирует текст уведомления для амбассадора
 */
function formatAmbassadorNotification(
  params: AmbassadorNotificationParams,
  username?: string
): string {
  const { user_telegram_id, amount, stars, transaction_type, description } =
    params

  // Определяем эмодзи в зависимости от типа транзакции
  let emoji = '💰'
  if (transaction_type.toLowerCase().includes('expense')) {
    emoji = '💸'
  } else if (transaction_type.toLowerCase().includes('subscription')) {
    emoji = '⭐️'
  }

  // Текст платежа
  const userLink = username
    ? `<a href="tg://user?id=${user_telegram_id}">${username}</a>`
    : `<a href="tg://user?id=${user_telegram_id}">Пользователь</a>`

  return `${emoji} <b>Новый платеж в вашем боте!</b>

${userLink} совершил транзакцию:
├ Тип: <b>${transaction_type}</b>
├ Сумма: <b>${amount} руб.</b>
├ Звезды: <b>${stars} ⭐️</b>
└ Описание: <i>${description}</i>

<i>ID транзакции: ${params.operation_id}</i>`
}

/**
 * Отправляет уведомление амбассадору о платеже в его боте
 * @param params Параметры уведомления
 * @returns Результат отправки уведомления
 */
export async function sendAmbassadorNotification(
  params: AmbassadorNotificationParams
): Promise<{ success: boolean; message?: string }> {
  try {
    // В режиме разработки не отправляем реальных уведомлений
    if (isDev) {
      logger.info('📩 Уведомление амбассадору (DEV режим):', {
        description: 'Ambassador notification in DEV mode',
        params,
      })
      return { success: true, message: 'DEV mode, notification skipped' }
    }

    // Получаем информацию об амбассадоре
    const ambassador = await getAmbassadorByBotName(params.bot_name)
    if (!ambassador) {
      return {
        success: false,
        message: `Ambassador not found for bot: ${params.bot_name}`,
      }
    }

    // Получаем информацию о пользователе, если возможно
    let username: string | undefined
    try {
      const { data: userData } = await supabase
        .from('users')
        .select('username, first_name, last_name')
        .eq('telegram_id', String(params.user_telegram_id))
        .single()

      if (userData) {
        username =
          userData.username ||
          (userData.first_name
            ? `${userData.first_name} ${userData.last_name || ''}`.trim()
            : undefined)
      }
    } catch (error) {
      // Игнорируем ошибку, просто не будем использовать имя пользователя
      logger.warn('⚠️ Не удалось получить данные пользователя:', {
        description: 'Could not fetch user data',
        telegram_id: params.user_telegram_id,
      })
    }

    // Форматируем сообщение
    const message = formatAmbassadorNotification(params, username)

    // Отправляем сообщение амбассадору
    const telegram = new Telegram(process.env.BOT_TOKEN || '')
    await telegram.sendMessage(ambassador.telegram_id, message, {
      parse_mode: 'HTML',
    })

    logger.info('✅ Уведомление амбассадору отправлено:', {
      description: 'Ambassador notification sent',
      ambassador_telegram_id: ambassador.telegram_id,
      bot_name: params.bot_name,
      operation_id: params.operation_id,
    })

    return { success: true }
  } catch (error) {
    logger.error('❌ Ошибка при отправке уведомления амбассадору:', {
      description: 'Error sending ambassador notification',
      error: error instanceof Error ? error.message : String(error),
      params,
    })

    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}
