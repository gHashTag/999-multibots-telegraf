import { ruPaymentProcessPayment } from '../ruPayment.service'
import { mockBot } from '@/test-utils/mocks/bot'
import { describe, expect, it } from '@jest/globals'
import { InngestTestEngine } from '@inngest/test'

describe('ruPaymentProcessPayment', () => {
  const testEngine = new InngestTestEngine()

  it('should process payment successfully', async () => {
    const { result } = await testEngine.execute({
      events: [{
        name: 'ru.payment.process',
        data: {
          invoice_id: '123',
          telegram_id: 123456,
          amount: 100,
          bot_name: 'test_bot'
        }
      }],
      function: ruPaymentProcessPayment
    })

    expect(result.success).toBe(true)
  })

  // Add more test cases as needed
}) 