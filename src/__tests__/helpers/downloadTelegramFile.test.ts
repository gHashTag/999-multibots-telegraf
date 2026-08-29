/**
 * downloadTelegramFileBuffer must reject a non-OK response instead of turning
 * the error body into "image" bytes.
 *
 * The bug it replaces: a bare `fetch(url)` then `response.arrayBuffer()` treats
 * a 404/500 body (an expired Telegram file_path, a bad token) as file content.
 * aiPhotoshop pushed that into the morphing collection, so a failed download
 * became a corrupt photo the user was charged to process.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { downloadTelegramFileBuffer } from '@/helpers/downloadTelegramFile'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('downloadTelegramFileBuffer', () => {
  it('returns the bytes on a 200 response', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: async () => bytes.buffer,
      }))
    )
    const buf = await downloadTelegramFileBuffer(
      'https://api.telegram.org/file/x'
    )
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(Array.from(buf)).toEqual([1, 2, 3, 4])
  })

  it('throws on a non-OK response instead of returning the error body', async () => {
    const arrayBuffer = vi.fn(async () => new Uint8Array([60, 33]).buffer) // "<!" — an HTML error page
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        arrayBuffer,
      }))
    )
    await expect(
      downloadTelegramFileBuffer('https://api.telegram.org/file/expired')
    ).rejects.toThrow(/HTTP 404/)
    // the error body must never be read as image bytes
    expect(arrayBuffer).not.toHaveBeenCalled()
  })

  it('passes an abort signal so a hung download cannot wedge the caller', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      arrayBuffer: async () => new Uint8Array([0]).buffer,
    }))
    vi.stubGlobal('fetch', fetchMock)
    await downloadTelegramFileBuffer('https://api.telegram.org/file/x')
    const opts = fetchMock.mock.calls[0][1] as any
    expect(opts?.signal).toBeInstanceOf(AbortSignal)
  })
})
