const { Inngest } = require('inngest')
const path = require('path')

// Загрузка переменных окружения
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })

const inngest = new Inngest({
  id: 'test-kling-morph-script',
  name: 'Test Script for Kling Morph v7',
  eventKey: process.env.INNGEST_EVENT_KEY,
})

const runTest = async () => {
  console.log('🚀 Starting Kling morphing loop test script v7...')

  try {
    const telegramId = '144022504'
    const imageUrls = [
      'https://replicate.delivery/pbxt/4T2Rqx2dogvA2AIV2pEesq3aVnls23sGYIeCg2mB0E8tJg5I/comfy-ui-423-1.png',
      'https://replicate.delivery/pbxt/CGI3xHwH6s7fC4MHe1D2cTf3yWOKb3FfH7LpEzXNmMtSJg5I/comfy-ui-423-1.png',
      'https://replicate.delivery/pbxt/54J58r5zXG0E0vMAQaEZ2j2jSPOZgT4vY2GAY2j2jSPOZgT/comfy-ui-423-1.png',
    ]
    const musicUrl =
      'https://replicate.delivery/pbxt/J1yB3GZ4Q3B3A5E5E2A5B3GZ4Q/daeneilo_-_the_weeknd_future_-_low_life_(slowed).mp3'

    const eventPayload = {
      name: 'reels/generate-advanced-loop',
      data: {
        telegram_id: telegramId,
        image_urls: imageUrls,
        music_url: musicUrl,
        bot_token: process.env.AI_KOSHEY_BOT_TOKEN,
        model_version:
          'ffefc3b4a7c5a1ee3f8e5f9c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e', // kwaivgi/kling-v1.6-pro
        prompt: 'a beautiful woman, cinematic, morphing into the next person',
      },
    }

    console.log('🕊️ Sending event to Inngest:', eventPayload.name)
    console.log('Payload:', {
      ...eventPayload.data,
      bot_token: '***',
    })

    await inngest.send(eventPayload)

    console.log(
      '✅ Event sent successfully! Check the Inngest dashboard for progress.'
    )
    console.log('🔗 http://localhost:8288')
  } catch (error) {
    console.error('❌ Error sending Inngest event:', error)
  }
}

runTest()
