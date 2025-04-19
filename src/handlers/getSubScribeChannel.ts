import { MyContext } from '@/interfaces'

import { logger } from '@/utils/logger'

const DEFAULT_CHANNEL_ID = '@neuro_blogger_group' // Значение по умолчанию, если ID не найден
export const AVATARS_GROUP_ID = {
  ['neuro_blogger_bot']: '@neuro_blogger_group',
  ['MetaMuse_Manifest_bot']: '@MetaMuse_AI_Influencer',
  ['ZavaraBot']: '@NeuroLuna',
  ['LeeSolarbot']: '@SolarNeuroBlogger1',
  ['NeuroLenaAssistant_bot']: '@neuroLenka',
  ['NeurostylistShtogrina_bot']: '@neirostylist',
  ['Gaia_Kamskaia_bot']: '@neuromeets',
}

/**
 * Определяет канал для подписки в зависимости от ID бота
 * @param ctx Контекст Telegram
 * @returns Название канала для подписки
 */
export const getSubScribeChannel = (ctx: MyContext): string | null => {
  logger.info('Executing getSubScribeChannel')
  // Используем ctx.botInfo.id вместо ctx.botId
  if (!ctx || !ctx.botInfo?.id) {
    logger.error(
      'getSubScribeChannel: Bot info or bot ID is missing in context'
    )
    return DEFAULT_CHANNEL_ID // Возвращаем значение по умолчанию или null/ошибку
  }

  const botId = ctx.botInfo.id.toString()
  logger.info({ message: 'getSubScribeChannel - Got botId', botId })

  const botChannelMap = AVATARS_GROUP_ID

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
  return DEFAULT_CHANNEL_ID
}
