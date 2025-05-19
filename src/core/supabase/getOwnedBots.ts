import { logger } from '@/utils/logger'
import { supabase } from './client'

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
      `[getOwnedBots] Найдены боты: ${botNames.join(', ')} для владельца ${ownerTelegramId}`
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
