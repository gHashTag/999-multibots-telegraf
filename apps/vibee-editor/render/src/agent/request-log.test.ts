import { describe, expect, it } from 'vitest'
import { redactedRequestPath } from './request-log'

describe('agent webhook request logging', () => {
  it('redacts webhook path secrets and all query values', () => {
    expect(redactedRequestPath('/api/telegram/stars-wh/pay-secret')).toBe(
      '/api/telegram/stars-wh/[redacted]'
    )
    expect(
      redactedRequestPath(
        '/api/telegram/stars-wh/super-secret?token=also-secret'
      )
    ).toBe('/api/telegram/stars-wh/[redacted]')
    expect(redactedRequestPath('/api/agent/history?telegramId=forbidden')).toBe(
      '/api/agent/history'
    )
  })
})
