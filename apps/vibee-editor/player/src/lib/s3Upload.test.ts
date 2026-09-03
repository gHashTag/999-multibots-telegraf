import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./apiFetch', () => ({
  authHeaders: (extra?: HeadersInit) => {
    const headers = new Headers(extra)
    headers.set('Authorization', 'Bearer test-session')
    return headers
  },
}))

import { uploadToS3 } from './s3Upload'

describe('uploadToS3', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('authenticates the upload and resolves the returned proxy path on render origin', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ success: true, url: '/s3/assets/frame.jpg' }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await uploadToS3(
      new File(['frame'], 'frame.jpg', { type: 'image/jpeg' }),
      'frame.jpg',
      'https://render.example'
    )

    expect(result).toBe('https://render.example/s3/assets/frame.jpg')
    const [, init] = (
      fetchMock.mock.calls as unknown as Array<[string, RequestInit]>
    )[0]
    const headers = new Headers(init?.headers as HeadersInit)
    expect(headers.get('Authorization')).toBe('Bearer test-session')
    expect(headers.get('Content-Type')).toBe('image/jpeg')
    expect(headers.get('X-Filename')).toBe('frame.jpg')
  })

  it('returns null on a non-success response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        json: async () => ({ error: 'forbidden' }),
      }))
    )

    await expect(
      uploadToS3(
        new File(['frame'], 'frame.jpg', { type: 'image/jpeg' }),
        'frame.jpg',
        'https://render.example'
      )
    ).resolves.toBeNull()
  })

  it('propagates cancellation instead of reporting a removed file as failed', async () => {
    const controller = new AbortController()
    controller.abort()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new DOMException('cancelled', 'AbortError')
      })
    )

    await expect(
      uploadToS3(
        new File(['frame'], 'frame.jpg', { type: 'image/jpeg' }),
        'frame.jpg',
        'https://render.example',
        controller.signal
      )
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
})
