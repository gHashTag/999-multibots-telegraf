import { delay } from '@/helpers/delay'

describe('delay', () => {
  beforeAll(() => {
    jest.useFakeTimers()
  })

  afterAll(() => {
    jest.useRealTimers()
  })

  it('resolves after given ms', async () => {
    const promise = delay(1000)
    jest.advanceTimersByTime(1000)
    await expect(promise).resolves.toBeUndefined()
  })

  it('resolves on zero ms', async () => {
    const promise = delay(0)
    jest.runAllTimers()
    await expect(promise).resolves.toBeUndefined()
  })
})