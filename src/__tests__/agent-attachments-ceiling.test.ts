import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

const shelf = vi.hoisted(() => ({ streamed: [] as number[] }))
vi.mock('@/services/contentFactory/storage', () => ({
  putBytes: vi.fn(async () => ({ url: 'https://shelf.example/s3/bytes' })),
  putStream: vi.fn(async (body: ReadableStream<Uint8Array>, name: string) => {
    let bytes = 0
    const reader = body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
    }
    shelf.streamed.push(bytes)
    return { url: `https://shelf.example/s3/${name}` }
  }),
}))

import {
  attachmentRefused,
  attachmentToLine,
} from '@/services/agentAttachments'

/**
 * THE REFUSAL NAMES THE CEILING THIS BOT ACTUALLY HAS.
 *
 * Before our own Bot API server there was one number, 20 MB, and a sentence
 * could hard-code it. Now a bot on our server takes up to 2000 MB from
 * Telegram and 100 MB onto our shelf, while its neighbour on the cloud still
 * stops at 20. A sentence that says "20" for the first one refuses a file it
 * could have taken; one that says "2000" for the second promises what the
 * cloud will not deliver.
 */
const MOVED = '900000011:ZZmovedmovedmovedmovedmovedmovedmoved'
const STAYS = '900000022:ZZstaysstaysstaysstaysstaysstaysstays'
const MB = 1024 * 1024
const ABS = `/var/lib/telegram-bot-api/${MOVED}/videos/file_9.mp4`

let server: Server
let base = ''
beforeAll(async () => {
  server = createServer((req, res) => {
    const body = Buffer.alloc(4096, 5)
    res.writeHead(req.url === ABS ? 200 : 404, {
      'Content-Length': String(body.length),
    })
    res.end(body)
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>(r => server.close(() => r())))

const saved = { ...process.env }
beforeEach(() => {
  shelf.streamed.length = 0
  process.env = {
    ...saved,
    TELEGRAM_API_ROOT: 'http://127.0.0.1:1',
    TELEGRAM_API_FILES_ROOT: base,
    BOT_API_LOCAL_BOTS: '900000011',
  }
  return () => {
    process.env = saved
  }
})

const telegram = (token: string) => ({
  token,
  getFile: vi.fn(async () => ({ file_path: ABS })),
  getFileLink: vi.fn(async () => 'https://cloud.invalid/x'),
})

const video = (bytes: number) => ({
  kind: 'video' as const,
  name: 'clip.mp4',
  mimeType: 'video/mp4',
  fileId: 'f',
  fileUniqueId: 'u',
  bytes,
})

describe('the ceiling in the refusal is the bot’s own', () => {
  it('a cloud bot: 30 MB is over its 20 MB, and the sentence says 20', async () => {
    const out = await attachmentToLine(telegram(STAYS), video(30 * MB))
    expect(attachmentRefused(out)).toBe(true)
    if (!attachmentRefused(out)) return
    expect(out.reason).toBe('too-big')
    expect(out.message).toContain('20 МБ')
  })

  it('a bot on our server: the same 30 MB is TAKEN, streamed to the shelf', async () => {
    const t = telegram(MOVED)
    const out = await attachmentToLine(t, video(30 * MB))
    expect(attachmentRefused(out)).toBe(false)
    if (attachmentRefused(out)) return
    expect(out.url).toBe('https://shelf.example/s3/clip.mp4')
    expect(out.line).not.toContain('ZZmoved')
    expect(t.getFile).toHaveBeenCalledWith('f')
    expect(shelf.streamed).toEqual([4096])
  })

  it('a bot on our server, over its 2000 MB: the sentence says 2000', async () => {
    const out = await attachmentToLine(telegram(MOVED), video(2500 * MB))
    expect(attachmentRefused(out)).toBe(true)
    if (!attachmentRefused(out)) return
    expect(out.message).toContain('2000 МБ')
    expect(out.message).not.toContain('20 МБ,')
  })

  it('a bot on our server, over the shelf: the sentence names the shelf’s 100, not Telegram', async () => {
    const out = await attachmentToLine(telegram(MOVED), video(150 * MB))
    expect(attachmentRefused(out)).toBe(true)
    if (!attachmentRefused(out)) return
    expect(out.reason).toBe('too-big')
    expect(out.message).toContain('100 МБ')
    expect(out.message).not.toContain('Telegram')
  })

  it('no token at all (a double, an old caller): the cloud’s 20, as before', async () => {
    const out = await attachmentToLine(
      { getFileLink: async () => 'x' },
      video(30 * MB)
    )
    expect(attachmentRefused(out)).toBe(true)
    if (!attachmentRefused(out)) return
    expect(out.message).toContain('20 МБ')
  })

  it('a file our server cannot hand over is a download refusal, not an exception', async () => {
    const t = telegram(MOVED)
    t.getFile.mockResolvedValueOnce({
      file_path: '/var/lib/telegram-bot-api/missing',
    })
    const out = await attachmentToLine(t, video(1 * MB))
    expect(attachmentRefused(out)).toBe(true)
    if (!attachmentRefused(out)) return
    expect(out.reason).toBe('download')
  })
})
