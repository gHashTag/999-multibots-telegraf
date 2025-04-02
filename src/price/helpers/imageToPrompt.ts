import { inngest } from '@/core/inngest/clients'
import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'
import { v4 as uuidv4 } from 'uuid'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { calculateModeCost } from '@/price/helpers/modelsCost'
import { getBotByName } from '@/core/bot'
import { getUserByTelegramIdString } from '@/core/supabase'

export async function generateImageToPrompt(
  imageUrl: string,
  telegram_id: string,
  ctx: MyContext,
  isRu: boolean,
  botName: string
): Promise<null> {
  if (!botName) {
    logger.error('❌ Отсутствует имя бота', {
      description: 'Bot name is missing',
      telegram_id,
    })
    throw new Error('Bot name is required')
  }

  // Проверяем существование бота
  try {
    const { bot } = getBotByName(botName)
    if (!bot) {
      logger.error('❌ Бот не найден', {
        description: 'Bot not found',
        telegram_id,
        botName,
      })
      throw new Error(`Bot ${botName} not found`)
    }
  } catch (error) {
    logger.error('❌ Ошибка при проверке бота', {
      description: 'Error checking bot',
      telegram_id,
      botName,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    throw error
  }

  // Проверяем права доступа пользователя
  const user = await getUserByTelegramIdString(telegram_id)
  if (!user) {
    logger.error('❌ Пользователь не найден', {
      description: 'User not found',
      telegram_id,
      botName,
    })
    throw new Error('User not found')
  }

  if (user.bot_name !== botName) {
    logger.error('❌ Несоответствие бота пользователя', {
      description: 'User bot mismatch',
      telegram_id,
      userBot: user.bot_name,
      requestedBot: botName,
    })
    throw new Error('User does not have access to this bot')
  }

  logger.info('🚀 Отправка события image/to-prompt.generate', {
    description: 'Sending image/to-prompt.generate event',
    imageUrl,
    telegram_id,
    isRu,
    botName,
  })

  try {
    // Рассчитываем стоимость операции
    const cost = calculateModeCost({
      mode: ModeEnum.ImageToPrompt,
      steps: 1,
    })

    logger.info('💰 Рассчитана стоимость операции', {
      description: 'Cost calculated',
      cost_per_image: cost.stars,
      telegram_id,
    })

    // Отправляем событие в Inngest
    await inngest.send({
      id: `image-to-prompt-${telegram_id}-${Date.now()}-${uuidv4()}`,
      name: 'image/to-prompt.generate',
      data: {
        image: imageUrl,
        telegram_id,
        username: ctx.from?.username,
        is_ru: isRu,
        bot_name: botName,
        cost_per_image: cost.stars,
        metadata: {
          service_type: ModeEnum.ImageToPrompt,
          bot_name: botName,
          language: isRu ? 'ru' : 'en',
        },
      },
    })

    logger.info('✅ Событие успешно отправлено', {
      description: 'Event sent successfully',
      telegram_id,
      botName,
    })

    return null
  } catch (error) {
    logger.error('❌ Ошибка при отправке события', {
      description: 'Error sending event',
      error: error instanceof Error ? error.message : 'Unknown error',
      telegram_id,
      botName,
    })

    await ctx.reply(
      isRu
        ? 'Произошла ошибка при анализе изображения. Пожалуйста, попробуйте позже.'
        : 'An error occurred while analyzing the image. Please try again later.'
    )

    return null
  }
}
