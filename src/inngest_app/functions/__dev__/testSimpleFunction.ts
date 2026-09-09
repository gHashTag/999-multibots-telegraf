import { inngest } from '@/inngest_app/client'

export const testSimpleFunction = inngest.createFunction(
  {
    id: 'test-simple',
    name: 'Test Simple Function',
    retries: 0,
  },
  { event: 'test/simple' },
  async ({ event, step }) => {
    return await step.run('run-simple-test', async () => {
      console.log('[TEST] Simple function executed', event.data)
      return { success: true, data: event.data }
    })
  }
)
