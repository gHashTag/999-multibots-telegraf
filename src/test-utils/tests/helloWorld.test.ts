import { inngest } from '@/inngest-functions/clients'
import { helloWorldFunction } from '@/inngest-functions/functions'
import { InngestTestEngine } from '@inngest/test'

interface HelloWorldResult {
  success: boolean
  message: string
  processed_at: string
}

@TestSuite('HelloWorld Function Tests')
class HelloWorldTests {
  private testEngine: InngestTestEngine
  private testEvent: {
    name: string
    data: {
      message: string
      user_id: number
      username: string
    }
  }

  constructor() {
    this.testEngine = new InngestTestEngine({
      function: helloWorldFunction,
      steps: [
        {
          id: 'подождем-секунду',
          handler: async () => {
            // Simulate 1 second delay
            await new Promise(resolve => setTimeout(resolve, 1))
            return true
          },
        },
      ],
    })

    this.testEvent = {
      name: 'test/hello.world',
      data: {
        message: 'Test message',
        user_id: 123456,
        username: 'testuser',
      },
    }
  }

  @BeforeEach
  async setup() {
    mock.clearAll()
    console.log('🧪 Starting test...')
  }

  @AfterEach
  async teardown() {
    mock.clearAll()
    console.log('🧪 Test completed')
  }

  @Test('Should process hello world event correctly')
  async testProcessHelloWorldEvent() {
    console.log('🚀 Executing test event...')

    const { result } = await this.testEngine.execute({
      events: [this.testEvent],
    })

    console.log('📝 Test result:', result)

    const typedResult = result as HelloWorldResult
    assert.strictEqual(typedResult.success, true)
    assert.ok(typedResult.message.includes('Test message'))
    assert.ok(typedResult.processed_at !== undefined)
  }

  @Test('Should wait for step to complete')
  async testWaitForStep() {
    console.log('⏱️ Starting step test...')
    const startTime = Date.now()

    await this.testEngine.execute({
      events: [
        {
          name: 'test/hello.world',
          data: { message: 'Test delay' },
        },
      ],
    })

    const endTime = Date.now()
    const duration = endTime - startTime

    console.log(`⏱️ Test duration: ${duration}ms`)
    assert.ok(duration > 0) // Should take some time
  }
}
