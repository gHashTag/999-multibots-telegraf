const { Inngest } = require('inngest')

// Создаем клиент Inngest для отправки событий
const inngest = new Inngest({
  name: 'test-client',
  id: 'test-client',
})

async function testAdvancedLooping() {
  console.log('🎬 Testing Advanced Looping Video Function...')

  try {
    // Отправляем событие через Inngest SDK
    const result = await inngest.send({
      name: 'reels/generate-advanced-loop',
      data: {
        telegram_id: '144022504',
        image_urls: [
          'http://localhost:2999/assets/examples/cocoage/coco01.jpeg',
          'http://localhost:2999/assets/examples/cocoage/coco02.jpeg',
        ],
        music_url:
          'http://localhost:2999/assets/examples/cocoage/daeneilo%20-%20the%20weeknd%20future%20-%20low%20life%20(slowed).MP3',
        bot_token: process.env.BOT_TOKEN,
        model_version: 'kwaivgi/kling-v1.6-pro',
        prompt:
          'smooth morphing transition between elegant woman portraits, cinematic, hd',
      },
    })

    console.log('✅ Event sent successfully:', result)
    console.log('📝 Event ID:', result.ids?.[0])
    console.log('🔍 Check Inngest dashboard at http://localhost:8288')
  } catch (error) {
    console.error('❌ Error sending event:', error)
  }
}

testAdvancedLooping()
