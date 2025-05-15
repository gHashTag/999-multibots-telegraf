import { Inngest } from 'inngest'
import { logger } from './logger'
import type { ModelTrainingInngestEventData } from '../types'

interface InngestUserPayload {
  telegram_id: string
  // other user fields if expected by Inngest
}

export async function publishDigitalAvatarTrainingEvent(
  inngestClient: Inngest,
  eventName: string,
  data: ModelTrainingInngestEventData,
  user?: InngestUserPayload
): Promise<void> {
  try {
    await inngestClient.send({
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
