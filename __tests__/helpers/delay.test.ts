import { delay } from '@/helpers/delay'

describe('delay', () => {
  beforeAll(() => {
    jest.useFakeTimers()
  })
  afterAll(() => {
    jest.useRealTimers()
  })

  it('should resolve after given milliseconds', async () => {
    const promise = delay(500)
    jest.advanceTimersByTime(500)
    await expect(promise).resolves.toBeUndefined()
  })
})
