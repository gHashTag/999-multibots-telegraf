import { Transform } from 'node:stream'

export class UploadTooLargeError extends Error {
  constructor() {
    super('upload exceeds the configured byte limit')
    this.name = 'UploadTooLargeError'
  }
}

export class UploadConcurrencyGate {
  private active = 0

  constructor(private readonly maximum: number) {
    if (!Number.isInteger(maximum) || maximum < 1) {
      throw new Error('upload concurrency must be a positive integer')
    }
  }

  tryAcquire(): (() => void) | undefined {
    if (this.active >= this.maximum) return undefined
    this.active += 1
    let released = false
    return () => {
      if (released) return
      released = true
      this.active -= 1
    }
  }

  inFlight(): number {
    return this.active
  }
}

export function boundedUploadTransform(maxBytes: number): {
  stream: Transform
  receivedBytes: () => number
} {
  if (!Number.isFinite(maxBytes) || maxBytes < 1) {
    throw new Error('upload byte limit must be positive')
  }
  let received = 0
  const stream = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length
      if (received > maxBytes) {
        callback(new UploadTooLargeError())
        return
      }
      callback(null, chunk)
    },
  })
  return { stream, receivedBytes: () => received }
}
