import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  createPinnedLookup,
  downloadBoundedMediaToFile,
  isPublicInternetAddress,
  resolvePublicAddress,
} from './remoteMediaDuration'

const response = (body: Uint8Array, declared?: number) => {
  const copy = new ArrayBuffer(body.byteLength)
  new Uint8Array(copy).set(body)
  return new Response(copy, {
    status: 200,
    headers: declared == null ? {} : { 'content-length': String(declared) },
  })
}

const destination = () =>
  path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vibee-media-')), 'audio.bin')

describe('downloadBoundedMedia', () => {
  it('streams media to a private file without retaining a second full copy', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(response(new Uint8Array([1, 2, 3])))
    const file = destination()
    const result = await downloadBoundedMediaToFile(
      new URL('https://media.example/a.mp3'),
      file,
      {
        fetchImpl,
        maxBytes: 8,
      }
    )
    expect(result).toBe(3)
    expect([...fs.readFileSync(file)]).toEqual([1, 2, 3])
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL('https://media.example/a.mp3'),
      expect.objectContaining({ redirect: 'error' })
    )
  })

  it('rejects an oversized declared body before reading it', async () => {
    const body = response(new Uint8Array([1]), 99)
    const cancel = vi.spyOn(body.body!, 'cancel')
    const fetchImpl = vi.fn().mockResolvedValue(body)
    const file = destination()
    await expect(
      downloadBoundedMediaToFile(new URL('https://media.example/a.mp3'), file, {
        fetchImpl,
        maxBytes: 8,
      })
    ).rejects.toThrow(/too large/)
    expect(cancel).toHaveBeenCalled()
    expect(fs.existsSync(file)).toBe(false)
  })

  it('rejects a body that exceeds the limit without a length header', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(new Uint8Array(9)))
    const file = destination()
    await expect(
      downloadBoundedMediaToFile(new URL('https://media.example/a.mp3'), file, {
        fetchImpl,
        maxBytes: 8,
      })
    ).rejects.toThrow(/too large/)
    expect(fs.existsSync(file)).toBe(false)
  })

  it('rejects an empty media body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(new Uint8Array()))
    const file = destination()
    await expect(
      downloadBoundedMediaToFile(new URL('https://media.example/a.mp3'), file, {
        fetchImpl,
        maxBytes: 8,
      })
    ).rejects.toThrow(/empty/)
    expect(fs.existsSync(file)).toBe(false)
  })
})

describe('public media network boundary', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '100.64.0.1',
    '169.254.1.1',
    '192.0.2.1',
    '::1',
    'fc00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '2001:db8::1',
  ])('rejects non-public address %s', address => {
    expect(isPublicInternetAddress(address)).toBe(false)
  })

  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])(
    'accepts public unicast address %s',
    address => {
      expect(isPublicInternetAddress(address)).toBe(true)
    }
  )

  it('rejects a hostname when any DNS answer is private', async () => {
    const lookupImpl = vi.fn().mockResolvedValue([
      { address: '8.8.8.8', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ])
    await expect(
      resolvePublicAddress('rebinding.example', lookupImpl)
    ).rejects.toThrow(/forbidden network/)
  })

  it('rejects bracketed and IPv4-mapped IPv6 literals without DNS', async () => {
    const lookupImpl = vi.fn()
    await expect(resolvePublicAddress('[::1]', lookupImpl)).rejects.toThrow(
      /forbidden network/
    )
    await expect(
      resolvePublicAddress('[::ffff:127.0.0.1]', lookupImpl)
    ).rejects.toThrow(/forbidden network/)
    expect(lookupImpl).not.toHaveBeenCalled()
  })

  it('includes DNS resolution in the single download deadline', async () => {
    const lookupImpl = vi.fn().mockReturnValue(new Promise(() => undefined))
    await expect(
      downloadBoundedMediaToFile(
        new URL('https://stalled.example/audio.mp3'),
        destination(),
        { lookupImpl, timeoutMs: 10 }
      )
    ).rejects.toThrow(/timed out/)
  })

  it('validates all records then selects and pins one public address', async () => {
    const lookupImpl = vi.fn().mockResolvedValue([
      { address: '2606:4700:4700::1111', family: 6 },
      { address: '8.8.8.8', family: 4 },
    ])
    const resolved = await resolvePublicAddress('media.example', lookupImpl)
    expect(resolved).toEqual({ address: '8.8.8.8', family: 4 })

    const pinnedLookup = createPinnedLookup(resolved)
    const callback = vi.fn()
    pinnedLookup('rebinding.example', {}, callback)
    expect(callback).toHaveBeenCalledWith(null, '8.8.8.8', 4)
    const allCallback = vi.fn()
    pinnedLookup('different.example', { all: true }, allCallback)
    expect(allCallback).toHaveBeenCalledWith(null, [resolved])
    expect(lookupImpl).toHaveBeenCalledWith('media.example', {
      all: true,
      verbatim: true,
    })
  })
})
