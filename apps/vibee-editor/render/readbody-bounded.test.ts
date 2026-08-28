import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import type { IncomingMessage } from 'node:http'
import { readBody } from './src/agent/routes'

/**
 * readBody is the shared body reader for ~10 POST/DELETE routes. It used to
 * accumulate with no cap, no deadline and no error handler (#901): a huge body
 * exhausted memory; a client that never sent `end` left the promise pending
 * forever; a socket error left it pending. This exercises each bound on a mock
 * request stream — no server, just the stream contract readBody relies on.
 */

function mockReq(): IncomingMessage & { destroy: ReturnType<typeof vi.fn> } {
  const ee = new EventEmitter() as any
  ee.destroy = vi.fn()
  return ee
}

describe('readBody is bounded (#901)', () => {
  it('resolves with the concatenated body on a normal stream', async () => {
    const req = mockReq()
    const p = readBody(req)
    req.emit('data', Buffer.from('{"a":'))
    req.emit('data', Buffer.from('1}'))
    req.emit('end')
    await expect(p).resolves.toBe('{"a":1}')
  })

  it('rejects and destroys the request when the body exceeds the cap', async () => {
    const req = mockReq()
    const p = readBody(req, 8) // 8-byte cap
    req.emit('data', Buffer.from('0123456789')) // 10 bytes > 8
    await expect(p).rejects.toThrow(/too large/)
    expect(req.destroy).toHaveBeenCalled()
  })

  it('rejects and destroys the request when the client never finishes', async () => {
    const req = mockReq()
    const p = readBody(req, 1024, 20) // 20ms deadline
    req.emit('data', Buffer.from('{')) // starts but never ends
    await expect(p).rejects.toThrow(/timed out/)
    expect(req.destroy).toHaveBeenCalled()
  })

  it('rejects on a stream error instead of hanging', async () => {
    const req = mockReq()
    const p = readBody(req)
    req.emit('error', new Error('socket boom'))
    await expect(p).rejects.toThrow(/socket boom/)
  })

  it('rejects on client abort instead of hanging', async () => {
    const req = mockReq()
    const p = readBody(req)
    req.emit('aborted')
    await expect(p).rejects.toThrow(/aborted/)
  })

  it('ignores events after it has already settled', async () => {
    const req = mockReq()
    const p = readBody(req)
    req.emit('data', Buffer.from('ok'))
    req.emit('end')
    await expect(p).resolves.toBe('ok')
    // a late error must not turn a resolved promise into an unhandled rejection
    expect(() => req.emit('error', new Error('late'))).not.toThrow()
  })
})
