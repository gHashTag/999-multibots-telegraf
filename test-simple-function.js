const { Inngest } = require('inngest')

const inngest = new Inngest({
  name: 'test-client',
  id: 'test-client',
})

async function testSimple() {
  console.log('🧪 Testing Simple Function...')

  try {
    const result = await inngest.send({
      name: 'test/simple',
      data: {
        message: 'Hello from test!',
      },
    })

    console.log('✅ Simple event sent successfully')
    console.log('🔍 Check logs for function execution')
  } catch (error) {
    console.error('❌ Error sending simple event:', error)
  }
}

testSimple()
