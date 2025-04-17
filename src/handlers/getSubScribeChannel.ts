import { MyContext } from '@/interfaces'
import logger from '@/utils/logger'

/**
 * Определяет канал для подписки в зависимости от ID бота
 * @param ctx Контекст Telegram
 * @returns Название канала для подписки
 */
export function getSubScribeChannel(ctx: MyContext): string {
  if (!ctx || !ctx.botId) {
    logger.warn(
      '⚠️ Контекст или ID бота отсутствует, возвращаем канал по умолчанию'
    )
    return 'neuro_blogger_group'
  }

  const botId = ctx.botId

  // Карта соответствия ID ботов и каналов
  const botChannelMap = {
    bot1: 'neuro_blogger_group',
    main: 'neuro_blogger_group',
    bot2: 'MetaMuse_AI_Influencer',
    bot3: 'motionly_tech',
    bot4: 'AvaTek_en',
    bot5: 'neuro_blogger_group',
  }

  // Проверяем наличие ID бота в карте
  if (botId in botChannelMap) {
    const channel = botChannelMap[botId as keyof typeof botChannelMap]
    logger.debug(`🔍 Для бота ${botId} определен канал: ${channel}`)
    return channel
  }

  // Если ID не найден, возвращаем канал по умолчанию
  logger.info(
    `ℹ️ Для бота ${botId} не найден канал, используем канал по умолчанию`
  )
  return 'neuro_blogger_group'
}
