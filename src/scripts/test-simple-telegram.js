require('dotenv').config()
const { Inngest } = require('inngest')

const inngest = new Inngest({
  id: 'test-simple-telegram-script',
  name: 'Test Script for Simple Telegram',
  eventKey: process.env.INNGEST_EVENT_KEY,
})

async function testTelegram() {
  console.log('🧪 Testing Telegram message...')

  try {
    const eventPayload = {
      name: 'test/simple-message',
      data: {
        userId: '144022504',
        message: '🧪 Тест простого сообщения из функции!',
      },
    }

    console.log('📤 Sending event to Inngest:', eventPayload.name)

    await inngest.send(eventPayload)

    console.log(
      '✅ Event sent successfully! Check the Inngest dashboard for progress.'
    )
    console.log('🔗 http://localhost:8288')
  } catch (error) {
    console.error('❌ Error:', error)
  }
}

testTelegram()
