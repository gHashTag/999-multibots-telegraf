import { Inngest } from 'inngest'
import { logger } from '@/utils/logger'

class InngestServiceClass {
  private inngest: Inngest

  constructor() {
    this.inngest = new Inngest({
      id: 'test-app',
      eventKey: process.env.INNGEST_EVENT_KEY,
    })
  }

  async sendEvent(name: string, data: any) {
    try {
      logger.info('🚀 Отправка события в Inngest', {
        description: 'Sending event to Inngest',
        event_name: name,
        data,
      })

      await this.inngest.send({
        name,
        data,
      })

      logger.info('✅ Событие успешно отправлено', {
        description: 'Event sent successfully',
        event_name: name,
      })
    } catch (error) {
      logger.error('❌ Ошибка при отправке события', {
        description: 'Error sending event',
        event_name: name,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }
}

export const InngestService = new InngestServiceClass()
