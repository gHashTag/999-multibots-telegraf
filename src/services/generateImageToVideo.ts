import { inngest } from '@/inngest-functions/clients'
import { logger } from '@/utils/logger'
import { v4 as uuidv4 } from 'uuid'
import { processBalanceVideoOperation } from '@/price/helpers'
import { getBotByName } from '@/core/bot'

interface GenerateImageToVideoParams {
  imageUrl: string
  prompt: string
  videoModel: string
  telegram_id: string
  username: string
  is_ru: boolean
  bot_name: string
}

export const generateImageToVideo = async (
  params: GenerateImageToVideoParams
): Promise<void> => {
  const { videoModel, telegram_id, is_ru, bot_name } = params

  try {
    logger.info('🎬 Processing image to video request', {
      description: 'Processing request and checking balance',
      ...params,
    })

    const { bot } = getBotByName(bot_name)
    if (!bot) {
      throw new Error(`Bot ${bot_name} not found`)
    }

    // Check balance and process payment first
    const { success, error } = await processBalanceVideoOperation({
      videoModel,
      telegram_id,
      is_ru,
      bot,
      bot_name,
      description: 'Payment for generating video',
    })

    if (!success) {
      throw new Error(error)
    }

    // If payment successful, send to Inngest for processing
    await inngest.send({
      id: `image-to-video-${params.telegram_id}-${Date.now()}-${uuidv4()}`,
      name: 'image/video',
      data: params,
    })

    logger.info('✅ Image to video request queued', {
      description: 'Request queued for processing',
      telegram_id: params.telegram_id,
    })
  } catch (error) {
    logger.error('❌ Error processing image to video request:', {
      description: 'Failed to process request',
      error: error instanceof Error ? error.message : 'Unknown error',
      params,
    })
    throw error
  }
}
