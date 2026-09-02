import { describe, expect, it, vi } from 'vitest'
import { downloadBoundedMedia } from './remoteMediaDuration'

const response = (body: Uint8Array, declared?: number) => {
  const copy = new ArrayBuffer(body.byteLength)
  new Uint8Array(copy).set(body)
  return new Response(copy, {
    status: 200,
    headers: declared == null ? {} : { 'content-length': String(declared) },
  })
}

describe('downloadBoundedMedia', () => {
  it('returns media bytes without exposing a provider credential', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(response(new Uint8Array([1, 2, 3])))
    const result = await downloadBoundedMedia(
      new URL('https://media.example/a.mp3'),
      {
        fetchImpl,
        maxBytes: 8,
      }
    )
    expect([...result]).toEqual([1, 2, 3])
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL('https://media.example/a.mp3'),
      expect.objectContaining({ redirect: 'error' })
    )
  })

  it('rejects an oversized declared body before reading it', async () => {
    const body = response(new Uint8Array([1]), 99)
    const getReader = vi.spyOn(body.body!, 'getReader')
    const fetchImpl = vi.fn().mockResolvedValue(body)
    await expect(
      downloadBoundedMedia(new URL('https://media.example/a.mp3'), {
        fetchImpl,
        maxBytes: 8,
      })
    ).rejects.toThrow(/too large/)
    expect(getReader).not.toHaveBeenCalled()
  })

  it('rejects a body that exceeds the limit without a length header', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(new Uint8Array(9)))
    await expect(
      downloadBoundedMedia(new URL('https://media.example/a.mp3'), {
        fetchImpl,
        maxBytes: 8,
      })
    ).rejects.toThrow(/too large/)
  })

  it('rejects an empty media body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(new Uint8Array()))
    await expect(
      downloadBoundedMedia(new URL('https://media.example/a.mp3'), {
        fetchImpl,
        maxBytes: 8,
      })
    ).rejects.toThrow(/empty/)
  })
})
