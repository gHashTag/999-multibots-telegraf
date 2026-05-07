import { logger } from '@/utils/logger'
import { supabase } from './client'
import { ADMIN_IDS_ARRAY } from '@/config'

/**
 * Получает список имен ботов, принадлежащих указанному telegram_id.
 * @param ownerTelegramId Telegram ID владельца.
 * @returns Promise<string[] | null> Массив имен ботов или null в случае ошибки или отсутствия ботов.
 */
export const getOwnedBots = async (
  ownerTelegramId: string
): Promise<string[] | null> => {
  if (!ownerTelegramId) {
    logger.warn('[getOwnedBots] ownerTelegramId не предоставлен.')
    return null
  }

  try {
    logger.info(`[getOwnedBots] Запрос ботов для владельца: ${ownerTelegramId}`)
    const { data, error } = await supabase
      .from('avatars')
      .select('bot_name')
      .eq('telegram_id', ownerTelegramId)

    if (error) {
      logger.error(
        `[getOwnedBots] Ошибка при запросе ботов для владельца ${ownerTelegramId}:`,
        error
      )
      return null
    }

    if (!data || data.length === 0) {
      logger.info(
        `[getOwnedBots] Боты для владельца ${ownerTelegramId} не найдены.`
      )
      return [] // Возвращаем пустой массив, если боты не найдены
    }

    const botNames = data
      .map(avatar => avatar.bot_name)
      .filter(name => name) as string[]
    logger.info(
      `[getOwnedBots] Найдены боты: ${botNames.join(
        ', '
      )} для владельца ${ownerTelegramId}`
    )
    return botNames
  } catch (err) {
    logger.error(
      `[getOwnedBots] Неожиданная ошибка при запросе ботов для владельца ${ownerTelegramId}:`,
      err
    )
    return null
  }
}

/**
 * Проверяет, является ли пользователь владельцем хотя бы одного бота
 * или супер-админом.
 * @param telegramId Telegram ID пользователя
 * @returns Promise<boolean> true если пользователь владеет ботами или является админом
 */
export async function isUserBotOwner(
  telegramId: string | number | undefined
): Promise<boolean> {
  if (!telegramId) {
    return false
  }

  const telegramIdStr = telegramId.toString()
  const telegramIdNum = parseInt(telegramIdStr, 10)

  // Супер-админы всегда имеют доступ
  if (ADMIN_IDS_ARRAY.includes(telegramIdNum)) {
    return true
  }

  // Проверяем владение ботами
  const ownedBots = await getOwnedBots(telegramIdStr)
  return ownedBots !== null && ownedBots.length > 0
}
