import { once } from 'node:events'
import { PassThrough, Readable } from 'node:stream'
import {
  GetObjectCommand,
  HeadObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3'
import { describe, expect, it, vi } from 'vitest'
import {
  isPublicMediaKey,
  mediaObjectKey,
  parseMediaRange,
  publicMediaPrefixes,
  serveMediaRequest,
  type MediaProxyLimits,
} from './mediaProxy'

class TestResponse extends PassThrough {
  status = 0
  responseHeaders: Record<string, string> = {}
  headersSent = false

  writeHead(status: number, headers: Record<string, string>) {
    this.status = status
    this.responseHeaders = headers
    this.headersSent = true
    return this
  }
}

const request = (
  method: 'GET' | 'HEAD',
  range?: string,
  url = '/media/images/relaunch/noir-close.jpg'
) => {
  const req = Object.assign(new PassThrough(), {
    method,
    url,
    headers: range ? { range } : {},
    complete: true,
    aborted: false,
  })
  return req as unknown as import('node:http').IncomingMessage
}

const tightLimits: MediaProxyLimits = {
  headTimeoutMs: 25,
  getTimeoutMs: 25,
  streamTimeoutMs: 25,
  maxObjectBytes: 100,
  maxUnrangedBytes: 80,
  maxRangeBytes: 20,
}

describe('stable media proxy contract', () => {
  it('defaults to the narrow public template prefix', () => {
    expect(publicMediaPrefixes({})).toEqual(['images/relaunch/'])
    expect(
      isPublicMediaKey('images/relaunch/noir-close.jpg', ['images/relaunch/'])
    ).toBe(true)
    expect(
      isPublicMediaKey('ai-training/voice-reference.wav', ['images/relaunch/'])
    ).toBe(false)
  })

  it('maps a percent-encoded /media URL to one bucket key', () => {
    expect(
      mediaObjectKey('/media/images/relaunch/hero%20canon.jpg?download=1')
    ).toBe('images/relaunch/hero canon.jpg')
  })

  it.each([
    '/media/',
    '/media/../private',
    '/media/images/%2e%2e/private',
    '/media/images\\private',
    '/media/images/%00bad',
  ])('rejects an unsafe or empty key: %s', target => {
    expect(() => mediaObjectKey(target)).toThrow(/media key/i)
  })

  it('returns null for an unrelated route', () => {
    expect(mediaObjectKey('/health')).toBeNull()
  })

  it.each([
    ['bytes=0-99', 1000, { start: 0, end: 99, length: 100 }],
    ['bytes=900-', 1000, { start: 900, end: 999, length: 100 }],
    ['bytes=-100', 1000, { start: 900, end: 999, length: 100 }],
    ['bytes=0-9999', 1000, { start: 0, end: 999, length: 1000 }],
  ])('parses the single range %s', (header, size, expected) => {
    expect(parseMediaRange(header as string, size as number)).toEqual(expected)
  })

  it.each(['bytes=1000-', 'bytes=4-3', 'bytes=0-1,4-5', 'items=0-1'])(
    'rejects an invalid or unsatisfiable range: %s',
    header => {
      expect(() => parseMediaRange(header, 1000)).toThrow(/range/i)
    }
  )

  it('answers HEAD from object metadata without downloading the object', async () => {
    const send = vi.fn(async command => {
      expect(command).toBeInstanceOf(HeadObjectCommand)
      return {
        ContentLength: 1000,
        ContentType: 'image/jpeg',
        ETag: 'fixture-etag',
      }
    })
    const res = new TestResponse()

    expect(
      await serveMediaRequest(
        request('HEAD'),
        res as unknown as import('node:http').ServerResponse,
        { send } as unknown as S3Client,
        'public-media'
      )
    ).toBe(true)
    expect(send).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(200)
    expect(res.responseHeaders['Accept-Ranges']).toBe('bytes')
    expect(res.responseHeaders['Content-Length']).toBe('1000')
  })

  it('forwards exactly one bounded Range to S3', async () => {
    const send = vi.fn(async command => {
      if (command instanceof HeadObjectCommand) {
        return {
          ContentLength: 1000,
          ContentType: 'video/mp4',
          ETag: 'fixture-etag',
        }
      }
      expect(command).toBeInstanceOf(GetObjectCommand)
      expect((command as GetObjectCommand).input.Range).toBe('bytes=100-199')
      expect((command as GetObjectCommand).input.IfMatch).toBe('fixture-etag')
      return { Body: Readable.from(Buffer.from('fixture')) }
    })
    const res = new TestResponse()
    const finished = once(res, 'finish')

    await serveMediaRequest(
      request('GET', 'bytes=100-199'),
      res as unknown as import('node:http').ServerResponse,
      { send } as unknown as S3Client,
      'public-media'
    )
    await finished

    expect(send).toHaveBeenCalledTimes(2)
    expect(res.status).toBe(206)
    expect(res.responseHeaders['Content-Range']).toBe('bytes 100-199/1000')
    expect(res.responseHeaders['Content-Length']).toBe('100')
  })

  it('returns a terminal 416 without downloading on an invalid range', async () => {
    const send = vi.fn(async () => ({
      ContentLength: 1000,
      ContentType: 'video/mp4',
    }))
    const res = new TestResponse()

    await serveMediaRequest(
      request('GET', 'bytes=1000-'),
      res as unknown as import('node:http').ServerResponse,
      { send } as unknown as S3Client,
      'public-media'
    )

    expect(send).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(416)
    expect(res.responseHeaders['Content-Range']).toBe('bytes */1000')
  })

  it('returns one redacted 404 on an object-store failure', async () => {
    const send = vi.fn(async () => {
      throw new Error('private object-store detail')
    })
    const res = new TestResponse()
    let body = ''
    res.on('data', chunk => {
      body += chunk.toString()
    })
    const finished = once(res, 'finish')

    await serveMediaRequest(
      request('GET'),
      res as unknown as import('node:http').ServerResponse,
      { send } as unknown as S3Client,
      'public-media'
    )
    await finished

    expect(send).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(404)
    expect(body).toContain('media_not_found')
    expect(body).not.toContain('private object-store detail')
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])(
    'rejects invalid object metadata length %s before download',
    async contentLength => {
      const send = vi.fn(async () => ({
        ContentLength: contentLength,
        ContentType: 'image/jpeg',
      }))
      const res = new TestResponse()

      await serveMediaRequest(
        request('GET'),
        res as unknown as import('node:http').ServerResponse,
        { send } as unknown as S3Client,
        'public-media',
        ['images/relaunch/'],
        tightLimits
      )

      expect(send).toHaveBeenCalledTimes(1)
      expect(res.status).toBe(502)
    }
  )

  it.each([
    ['object', 101, undefined],
    ['unranged response', 81, undefined],
    ['range response', 100, 'bytes=0-20'],
  ])(
    'returns a redacted 413 for an oversized %s',
    async (_kind, contentLength, range) => {
      const send = vi.fn(async command => {
        expect(command).toBeInstanceOf(HeadObjectCommand)
        return { ContentLength: contentLength, ContentType: 'video/mp4' }
      })
      const res = new TestResponse()
      let body = ''
      res.on('data', chunk => {
        body += chunk.toString()
      })
      const finished = once(res, 'finish')

      await serveMediaRequest(
        request('GET', range),
        res as unknown as import('node:http').ServerResponse,
        { send } as unknown as S3Client,
        'public-media',
        ['images/relaunch/'],
        tightLimits
      )
      await finished

      expect(send).toHaveBeenCalledTimes(1)
      expect(res.status).toBe(413)
      expect(body).toContain('media_too_large')
    }
  )

  it('times out a hung HEAD lookup with a redacted 504', async () => {
    const send = vi.fn(
      async (_command: unknown, options?: { abortSignal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options?.abortSignal?.addEventListener('abort', () => {
            reject(new Error('private timeout detail'))
          })
        })
    )
    const res = new TestResponse()
    let body = ''
    res.on('data', chunk => {
      body += chunk.toString()
    })
    const finished = once(res, 'finish')

    await serveMediaRequest(
      request('GET'),
      res as unknown as import('node:http').ServerResponse,
      { send } as unknown as S3Client,
      'public-media',
      ['images/relaunch/'],
      tightLimits
    )
    await finished

    expect(res.status).toBe(504)
    expect(body).toContain('media_timeout')
    expect(body).not.toContain('private timeout detail')
  })

  it('times out a hung GET lookup before response headers', async () => {
    const send = vi.fn(
      async (command: unknown, options?: { abortSignal?: AbortSignal }) => {
        if (command instanceof HeadObjectCommand) {
          return { ContentLength: 20, ContentType: 'video/mp4' }
        }
        return new Promise((_resolve, reject) => {
          options?.abortSignal?.addEventListener('abort', () => {
            reject(new Error('private get timeout detail'))
          })
        })
      }
    )
    const res = new TestResponse()
    const finished = once(res, 'finish')

    await serveMediaRequest(
      request('GET'),
      res as unknown as import('node:http').ServerResponse,
      { send } as unknown as S3Client,
      'public-media',
      ['images/relaunch/'],
      tightLimits
    )
    await finished

    expect(res.status).toBe(504)
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('cancels and closes a body that never completes', async () => {
    const objectBody = new PassThrough()
    objectBody.on('error', () => undefined)
    const bodyClosed = new Promise<void>(resolve => {
      objectBody.once('close', () => resolve())
    })
    const send = vi.fn(async command =>
      command instanceof HeadObjectCommand
        ? { ContentLength: 20, ContentType: 'video/mp4' }
        : { Body: objectBody as unknown as Readable }
    )
    const res = new TestResponse()

    await expect(
      serveMediaRequest(
        request('GET'),
        res as unknown as import('node:http').ServerResponse,
        { send } as unknown as S3Client,
        'public-media',
        ['images/relaunch/'],
        tightLimits
      )
    ).resolves.toBe(true)
    await bodyClosed

    expect(res.status).toBe(200)
    expect(res.destroyed).toBe(true)
    expect(objectBody.destroyed).toBe(true)
  })

  it('closes a body that exceeds the metadata-declared transfer bound', async () => {
    const send = vi.fn(async command =>
      command instanceof HeadObjectCommand
        ? { ContentLength: 20, ContentType: 'video/mp4' }
        : { Body: Readable.from(Buffer.alloc(21)) }
    )
    const res = new TestResponse()

    await expect(
      serveMediaRequest(
        request('GET'),
        res as unknown as import('node:http').ServerResponse,
        { send } as unknown as S3Client,
        'public-media',
        ['images/relaunch/'],
        tightLimits
      )
    ).resolves.toBe(true)

    expect(res.status).toBe(200)
    expect(res.destroyed).toBe(true)
  })

  it('aborts a pending object-store request when the client disconnects', async () => {
    let observedAbort = false
    const send = vi.fn(
      async (_command: unknown, options?: { abortSignal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options?.abortSignal?.addEventListener('abort', () => {
            observedAbort = true
            reject(new Error('private disconnect detail'))
          })
        })
    )
    const req = request('GET')
    const res = new TestResponse()

    const handled = serveMediaRequest(
      req,
      res as unknown as import('node:http').ServerResponse,
      { send } as unknown as S3Client,
      'public-media',
      ['images/relaunch/'],
      tightLimits
    )
    setTimeout(() => {
      Object.assign(req, { complete: false, aborted: true })
      req.emit('close')
    }, 0)

    await expect(handled).resolves.toBe(true)
    expect(observedAbort).toBe(true)
    expect(res.status).toBe(0)
  })

  it('contains a mid-transfer source failure without an unhandled process error', async () => {
    const objectBody = new PassThrough()
    objectBody.on('error', () => undefined)
    const send = vi.fn(async command =>
      command instanceof HeadObjectCommand
        ? { ContentLength: 1000, ContentType: 'video/mp4' }
        : { Body: objectBody as unknown as Readable }
    )
    const res = new TestResponse()
    const bodyClosed = new Promise<void>(resolve => {
      objectBody.once('close', () => resolve())
    })

    const handled = serveMediaRequest(
      request('GET'),
      res as unknown as import('node:http').ServerResponse,
      { send } as unknown as S3Client,
      'public-media'
    )
    setTimeout(
      () => objectBody.destroy(new Error('transient object-store failure')),
      0
    )

    await expect(handled).resolves.toBe(true)
    await bodyClosed
    expect(res.destroyed).toBe(true)
  })

  it('does not query S3 for a key outside the public prefix allowlist', async () => {
    const send = vi.fn()
    const res = new TestResponse()

    await serveMediaRequest(
      request('HEAD', undefined, '/media/ai-training/voice-reference.wav'),
      res as unknown as import('node:http').ServerResponse,
      { send } as unknown as S3Client,
      'shared-bucket'
    )

    expect(send).not.toHaveBeenCalled()
    expect(res.status).toBe(404)
  })

  it.each(['text/html', 'application/javascript', 'image/svg+xml'])(
    'refuses active same-origin content type %s before object download',
    async contentType => {
      const send = vi.fn(async command => {
        expect(command).toBeInstanceOf(HeadObjectCommand)
        return { ContentLength: 20, ContentType: contentType }
      })
      const res = new TestResponse()

      await serveMediaRequest(
        request('GET'),
        res as unknown as import('node:http').ServerResponse,
        { send } as unknown as S3Client,
        'public-media'
      )

      expect(send).toHaveBeenCalledTimes(1)
      expect(res.status).toBe(415)
    }
  )
})
