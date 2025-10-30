import { Inngest } from 'inngest'
import { Telegraf } from 'telegraf'

const inngest = new Inngest({
  name: '999-multibots-telegraf',
  id: '999-multibots-telegraf',
  eventKey: process.env.BOT_INNGEST_EVENT_KEY,
})

export const testAdvancedLoopFunction = inngest.createFunction(
  {
    id: 'test-advanced-loop',
    name: 'Test Advanced Loop',
    retries: 1,
  },
  { event: 'test/advanced-loop' },
  async ({ event, step }) => {
    return await step.run('send-test-message', async () => {
      const { telegram_id, image_base64s } = event.data

      console.log(
        `🧪 Test Advanced Loop Function started for user ${telegram_id}`
      )
      console.log(`🧪 Received ${image_base64s?.length || 0} images`)

      const bot = new Telegraf(process.env.BOT_TOKEN!)

      await bot.telegram.sendMessage(
        telegram_id,
        `🧪 Тест Advanced Loop функции работает!\n` +
          `📸 Получено изображений: ${image_base64s?.length || 0}\n` +
          `⏰ Время: ${new Date().toLocaleString('ru-RU')}`
      )

      console.log('✅ Test message sent successfully')

      return {
        success: true,
        telegram_id,
        images_received: image_base64s?.length || 0,
        message: 'Test advanced loop function completed',
      }
    })
  }
)
