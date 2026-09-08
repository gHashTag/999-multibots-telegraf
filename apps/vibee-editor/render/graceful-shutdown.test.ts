import { describe, it, expect, vi, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import type { Server } from 'node:http'
import { installGracefulShutdown } from './src/graceful-shutdown'

/**
 * SIGTERM waits for the requests in flight, bounded.
 *
 * 08.09.2026: a deploy killed the render process while an agent stream was
 * running and the person saw "Load failed". The contract below is what makes
 * a deploy invisible to a stream that ends within the drain window: listener
 * closed at once, exit only when in-flight reaches zero or the window ends.
 */
function fakeServer() {
  const s = new EventEmitter() as EventEmitter & {
    close: ReturnType<typeof vi.fn>
    closeIdleConnections: ReturnType<typeof vi.fn>
  }
  s.close = vi.fn((cb?: () => void) => cb?.())
  s.closeIdleConnections = vi.fn()
  return s
}
const request = (server: EventEmitter) => {
  const res = new EventEmitter()
  server.emit('request', {}, res)
  return () => res.emit('close')
}

afterEach(() => {
  vi.useRealTimers()
  process.removeAllListeners('SIGTERM')
  process.removeAllListeners('SIGINT')
})

describe('graceful shutdown', () => {
  it('closes the listener at once and exits only when the last request finishes', () => {
    vi.useFakeTimers()
    const server = fakeServer()
    const exit = vi.fn()
    const log = vi.fn()
    const g = installGracefulShutdown(server as unknown as Server, {
      drainMs: 25_000,
      exit,
      log,
    })
    const finishA = request(server)
    const finishB = request(server)
    expect(g.inFlight()).toBe(2)
    g.shutdown('SIGTERM')
    expect(server.close).toHaveBeenCalledTimes(1)
    expect(server.closeIdleConnections).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(3_000)
    expect(exit).not.toHaveBeenCalled()
    finishA()
    vi.advanceTimersByTime(3_000)
    expect(exit).not.toHaveBeenCalled()
    finishB()
    vi.advanceTimersByTime(300)
    expect(exit).toHaveBeenCalledWith(0)
    expect(
      log.mock.calls.some(c => /drained in \d+ms/.test(String(c[0])))
    ).toBe(true)
  })

  it('exits at the end of the drain window even if a request never finishes, and says so', () => {
    vi.useFakeTimers()
    const server = fakeServer()
    const exit = vi.fn()
    const log = vi.fn()
    installGracefulShutdown(server as unknown as Server, {
      drainMs: 5_000,
      exit,
      log,
    })
    request(server)
    process.emit('SIGTERM' as never)
    vi.advanceTimersByTime(4_900)
    expect(exit).not.toHaveBeenCalled()
    vi.advanceTimersByTime(400)
    expect(exit).toHaveBeenCalledWith(0)
    expect(log.mock.calls.some(c => /still open/.test(String(c[0])))).toBe(true)
  })

  it('a second signal does not restart the drain', () => {
    vi.useFakeTimers()
    const server = fakeServer()
    const exit = vi.fn()
    const g = installGracefulShutdown(server as unknown as Server, {
      drainMs: 5_000,
      exit,
      log: () => undefined,
    })
    g.shutdown('SIGTERM')
    g.shutdown('SIGINT')
    expect(server.close).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(300)
    expect(exit).toHaveBeenCalledTimes(1)
  })
})
