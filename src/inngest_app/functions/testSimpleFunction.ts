import { Inngest } from 'inngest'
import { logger } from '@/utils/logger'

const inngest = new Inngest({
  name: 'bot-farm',
  id: 'bot-farm-test',
  eventKey: process.env.BOT_INNGEST_EVENT_KEY,
})

export const testSimpleFunction = inngest.createFunction(
  {
    id: 'test-simple',
    name: 'Test Simple Function',
  },
  { event: 'test/simple' },
  async ({ event, step }) => {
    logger.info('🧪 [TEST] Simple function started', { data: event.data })

    await step.run('simple-step', async () => {
      logger.info('🧪 [TEST] Simple step executed')
      return 'success'
    })

    logger.info('🧪 [TEST] Simple function completed')
    return { status: 'completed', timestamp: new Date().toISOString() }
  }
)
