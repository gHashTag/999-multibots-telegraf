import { inngest } from '@/inngest-functions/clients'
import { helloWorldFunction } from '@/inngest-functions/functions'
import { InngestTestEngine } from '@inngest/test'

interface HelloWorldResult {
  success: boolean
  message: string
  processed_at: string
}

describe('helloWorldFunction', () => {
  const testEngine = new InngestTestEngine({
    function: helloWorldFunction,
    steps: [{
      id: 'подождем-секунду',
      handler: async () => {
        // Simulate 1 second delay
        await new Promise(resolve => setTimeout(resolve, 1))
        return true
      }
    }]
  })

  const testEvent = {
    name: 'test/hello.world',
    data: {
      message: 'Test message',
      user_id: 123456,
      username: 'testuser'
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
    console.log('🧪 Starting test...')
  })

  afterEach(() => {
    jest.clearAllMocks()
    console.log('🧪 Test completed')
  })

  test('should process hello world event correctly', async () => {
    console.log('🚀 Executing test event...')
    
    const { result } = await testEngine.execute({
      events: [testEvent]
    })

    console.log('📝 Test result:', result)

    const typedResult = result as HelloWorldResult
    expect(typedResult.success).toBe(true)
    expect(typedResult.message).toContain('Test message')
    expect(typedResult.processed_at).toBeDefined()
  })

  test('should wait for step to complete', async () => {
    console.log('⏱️ Starting step test...')
    const startTime = Date.now()
    
    await testEngine.execute({
      events: [{
        name: 'test/hello.world',
        data: { message: 'Test delay' }
      }]
    })

    const endTime = Date.now()
    const duration = endTime - startTime

    console.log(`⏱️ Test duration: ${duration}ms`)
    expect(duration).toBeGreaterThan(0) // Should take some time
  })
}) 