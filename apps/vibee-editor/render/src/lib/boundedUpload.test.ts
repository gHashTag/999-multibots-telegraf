import { Readable, Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { describe, expect, it } from 'vitest'
import {
  boundedUploadTransform,
  UploadConcurrencyGate,
  UploadTooLargeError,
} from './boundedUpload'

describe('bounded upload stream', () => {
  it('streams chunks with backpressure and counts bytes without concatenating', async () => {
    const { stream, receivedBytes } = boundedUploadTransform(8)
    const written: Buffer[] = []
    await pipeline(
      Readable.from([Buffer.from([1, 2]), Buffer.from([3, 4, 5])]),
      stream,
      new Writable({
        write(chunk, _encoding, callback) {
          written.push(Buffer.from(chunk))
          callback()
        },
      })
    )
    expect(receivedBytes()).toBe(5)
    expect(Buffer.concat(written)).toEqual(Buffer.from([1, 2, 3, 4, 5]))
  })

  it('aborts a chunked stream as soon as the byte limit is crossed', async () => {
    const { stream, receivedBytes } = boundedUploadTransform(4)
    await expect(
      pipeline(
        Readable.from([Buffer.alloc(3), Buffer.alloc(2), Buffer.alloc(20)]),
        stream,
        new Writable({
          write(_chunk, _encoding, callback) {
            callback()
          },
        })
      )
    ).rejects.toBeInstanceOf(UploadTooLargeError)
    expect(receivedBytes()).toBe(5)
  })
})

describe('upload concurrency gate', () => {
  it('rejects parallel work above the cap and releases idempotently', () => {
    const gate = new UploadConcurrencyGate(2)
    const releaseFirst = gate.tryAcquire()
    const releaseSecond = gate.tryAcquire()
    expect(releaseFirst).toBeTypeOf('function')
    expect(releaseSecond).toBeTypeOf('function')
    expect(gate.inFlight()).toBe(2)
    expect(gate.tryAcquire()).toBeUndefined()

    releaseFirst?.()
    releaseFirst?.()
    expect(gate.inFlight()).toBe(1)
    expect(gate.tryAcquire()).toBeTypeOf('function')
  })
})
