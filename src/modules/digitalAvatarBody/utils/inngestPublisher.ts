import { inngest } from '@/inngest_app/client'
import { logger } from './logger'
import type { ModelTrainingInngestEventData } from '../types'

interface InngestUserPayload {
  telegram_id: string
  // other user fields if expected by Inngest
}

export async function publishDigitalAvatarTrainingEvent(
  eventName: string,
  data: ModelTrainingInngestEventData,
  user?: InngestUserPayload
): Promise<void> {
  try {
    await inngest.send({
      name: eventName,
      data,
      user,
    })
    logger.info(
      `[InngestPublisher] Event "${eventName}" sent successfully for telegram_id: ${data.telegram_id}.`
    )
  } catch (error) {
    logger.error(
      `[InngestPublisher] Error sending event "${eventName}" for telegram_id: ${data.telegram_id}`,
      { error }
    )
    throw error
  }
}
