/**
 * Simple Test Function
 * Basic Inngest function for testing the platform
 */

import { inngest } from '@/core/inngest/clients'
import { createInngestLogger, safeAsync } from '@/inngest_app/common'
import { baseEventSchema } from '@/inngest_app/common'

export const testSimpleFunction = inngest.createFunction(
  {
    id: 'test-simple',
    name: '🧪 Test Simple Function',
    retries: 2,
  },
  { event: 'test/simple' },
  async ({ event }) => {
    const { telegramId } = baseEventSchema.parse(event.data)
    const logger = createInngestLogger('testSimpleFunction', telegramId)

    logger.functionStart(event.name, event.data)

    const result = await safeAsync(
      async () => {
        logger.stepStart('simple-step')
        const stepResult = 'Test step executed successfully'
        logger.stepComplete('simple-step', { result: stepResult })
        return { status: 'success', stepResult }
      },
      {
        functionName: 'testSimpleFunction',
        stepName: 'simple-step',
        telegramId,
        context: event.data,
      }
    )

    logger.functionComplete(result)
    return result
  }
)
