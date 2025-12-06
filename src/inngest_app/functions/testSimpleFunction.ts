import { logger } from '@/utils/logger'
// ✅ Используем единый клиент из @/inngest_app/client
import { inngest } from '@/inngest_app/client'

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
