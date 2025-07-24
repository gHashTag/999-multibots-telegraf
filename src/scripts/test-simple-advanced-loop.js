require('dotenv').config()
const { Inngest } = require('inngest')
const fs = require('fs')
const path = require('path')

const inngest = new Inngest({
  id: 'test-simple-advanced-loop-script',
  name: 'Test Script for Simple Advanced Loop',
  eventKey: process.env.INNGEST_EVENT_KEY,
})

const runTest = async () => {
  console.log('🚀 Starting simple advanced loop test...')

  try {
    const telegramId = '144022504'
    const imagePaths = [
      path.join(__dirname, 'assets/examples/cocoage/coco01.jpeg'),
      path.join(__dirname, 'assets/examples/cocoage/coco02.jpeg'),
    ]

    const image_base64s = imagePaths.map(p =>
      fs.readFileSync(p, { encoding: 'base64' })
    )

    console.log(`🏞️  Loaded ${image_base64s.length} images as base64.`)

    const eventPayload = {
      name: 'test/advanced-loop',
      data: {
        telegram_id: telegramId,
        image_base64s: image_base64s,
      },
    }

    console.log('📤 Sending event to Inngest:', eventPayload.name)

    await inngest.send(eventPayload)

    console.log(
      '✅ Event sent successfully! Check the Inngest dashboard for progress.'
    )
    console.log('🔗 http://localhost:8288')
  } catch (error) {
    console.error('❌ An error occurred:', error)
    process.exit(1)
  }
}

runTest()
