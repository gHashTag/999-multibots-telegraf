import { Inngest } from 'inngest'
import { Telegraf } from 'telegraf'

const inngest = new Inngest({
  name: '999-multibots-telegraf',
  id: '999-multibots-telegraf',
  eventKey: process.env.BOT_INNGEST_EVENT_KEY,
})

export const testSimpleMessageFunction = inngest.createFunction(
  {
    id: 'test-simple-message',
    name: 'Test Simple Message',
    retries: 1,
  },
  { event: 'test/simple-message' },
  async ({ event, step }) => {
    return await step.run('send-test-message', async () => {
      const { userId, message } = event.data

      console.log(`🧪 Sending test message to user ${userId}: ${message}`)

      const bot = new Telegraf(process.env.BOT_TOKEN!)

      await bot.telegram.sendMessage(userId, message)

      console.log('✅ Test message sent successfully!')

      return { success: true, message: 'Test message sent' }
    })
  }
)
