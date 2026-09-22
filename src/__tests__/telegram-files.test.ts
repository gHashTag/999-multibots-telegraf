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

/*
 * The shelf is a double that READS the stream it is handed, the way the real
 * `/upload` does -- a double that ignored the body would let a stream that
 * never flows look like a stored file.
 */
const shelf = vi.hoisted(() => ({
  received: [] as { name: string; bytes: number }[],
}))
vi.mock('@/services/contentFactory/storage', () => ({
  putStream: vi.fn(async (body: ReadableStream<Uint8Array>, name: string) => {
    let bytes = 0
    const reader = body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
    }
    shelf.received.push({ name, bytes })
    return { url: `https://shelf.example/s3/${name}` }
  }),
}))

import {
  TelegramFileDownloadFailed,
  TelegramFileTooBig,
  errorCode,
  forgetMirroredForTests,
  installLocalFileLinks,
  mirrorTelegramFile,
  telegramFileLink,
} from '@/services/telegramFiles'

/**
 * READING A FILE FROM OUR OWN BOT API SERVER.
 *
 * The file endpoint is a real HTTP server on loopback (a double of
 * deployment/telegram-bot-api/file-server.mjs): it records which path was
 * asked for and answers with bytes, chunked or with a length.
 */
const MOVED = '900000011:ZZmovedmovedmovedmovedmovedmovedmoved'
const STAYS = '900000022:ZZstaysstaysstaysstaysstaysstaysstays'
const ABS = `/var/lib/telegram-bot-api/${MOVED}/videos/file_3.mp4`

let server: Server
let base = ''
const asked: string[] = []
let answer: { status: number; body: Buffer; length: boolean } = {
  status: 200,
  body: Buffer.alloc(0),
  length: true,
}

beforeAll(async () => {
  server = createServer((req, res) => {
    asked.push(req.url || '')
    const headers: Record<string, string> = {}
    if (answer.length) headers['Content-Length'] = String(answer.body.length)
    res.writeHead(answer.status, headers)
    // Two writes: the body arrives in chunks, like a real stream.
    const half = Math.floor(answer.body.length / 2)
    res.write(answer.body.subarray(0, half))
    res.end(answer.body.subarray(half))
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>(r => server.close(() => r())))

const saved = { ...process.env }
beforeEach(() => {
  asked.length = 0
  shelf.received.length = 0
  forgetMirroredForTests()
  answer = { status: 200, body: Buffer.alloc(3000, 7), length: true }
  process.env = {
    ...saved,
    TELEGRAM_API_ROOT: 'http://127.0.0.1:1',
    TELEGRAM_API_FILES_ROOT: base,
    BOT_API_LOCAL_BOTS: 'moved_bot=900000011',
  }
  return () => {
    process.env = saved
  }
})

describe('a bot on our server: the bytes come from the file endpoint', () => {
  it('the absolute path getFile answered is what is asked for, and the bytes reach the shelf', async () => {
    const out = await mirrorTelegramFile(MOVED, ABS, 'clip.mp4', {
      declaredBytes: 3000,
    })
    expect(asked).toEqual([ABS])
    expect(shelf.received).toEqual([{ name: 'clip.mp4', bytes: 3000 }])
    expect(out).toEqual({
      url: 'https://shelf.example/s3/clip.mp4',
      bytes: 3000,
    })
  })

  it('a file declared over the limit is refused before any byte moves', async () => {
    await expect(
      mirrorTelegramFile(MOVED, ABS, 'big.mp4', {
        declaredBytes: 101 * 1024 * 1024,
      })
    ).rejects.toBeInstanceOf(TelegramFileTooBig)
    expect(asked).toEqual([])
  })

  it('a Content-Length over the limit is refused without reading the body', async () => {
    await expect(
      mirrorTelegramFile(MOVED, ABS, 'big.mp4', { limit: 1000 })
    ).rejects.toBeInstanceOf(TelegramFileTooBig)
    expect(shelf.received).toEqual([])
  })

  /*
   * No size anywhere: only the byte counter stands between a 2 GB video and
   * the shelf. It must stop the stream mid-flight.
   */
  it('an UNDECLARED oversized stream is stopped by the counter', async () => {
    answer = { status: 200, body: Buffer.alloc(5000, 1), length: false }
    const err = await mirrorTelegramFile(MOVED, ABS, 'x.mp4', {
      limit: 1000,
    }).catch(e => e)
    expect(err).toBeInstanceOf(TelegramFileTooBig)
    expect(shelf.received).toEqual([])
  })

  it('a failed download names no URL and no token', async () => {
    answer = { status: 404, body: Buffer.from('not found'), length: true }
    const err = await mirrorTelegramFile(MOVED, ABS, 'x.mp4').catch(e => e)
    expect(err).toBeInstanceOf(TelegramFileDownloadFailed)
    expect(String(err.message)).toContain('404')
    expect(String(err.message)).not.toContain('ZZmoved')
    expect(String(err.message)).not.toContain('telegram-bot-api')
  })
})

describe('a streamed file that fails says which end broke', () => {
  // A body that gives one chunk and then dies, like a reset connection.
  const breaking = () =>
    new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array(1000))
      },
      pull(c) {
        c.error(
          Object.assign(new TypeError('terminated'), {
            cause: { code: 'ECONNRESET' },
          })
        )
      },
    })
  const reading = async (body: ReadableStream<Uint8Array>) => {
    const r = body.getReader()
    for (;;) if ((await r.read()).done) break
    return { url: 'https://shelf.example/s3/x', meta: {} }
  }

  it('a download cut mid-stream is a download failure, with the byte count and the code', async () => {
    const err = await mirrorTelegramFile(MOVED, ABS, 'x.zip', {
      fetchImpl: (async () => new Response(breaking())) as typeof fetch,
      put: reading as never,
    }).catch(e => e)
    expect(err).toBeInstanceOf(TelegramFileDownloadFailed)
    expect(String(err.message)).toContain('after 1000 bytes')
    expect(String(err.message)).toContain('ECONNRESET')
    expect(String(err.message)).not.toContain('ZZmoved')
  })

  it('a shelf that breaks is the shelf s failure, and its code is readable', async () => {
    const whole = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array(10))
        c.close()
      },
    })
    const err = await mirrorTelegramFile(MOVED, ABS, 'x.zip', {
      fetchImpl: (async () => new Response(whole)) as typeof fetch,
      put: (async () => {
        throw Object.assign(new TypeError('fetch failed'), {
          cause: { code: 'UND_ERR_SOCKET' },
        })
      }) as never,
    }).catch(e => e)
    expect(err).not.toBeInstanceOf(TelegramFileDownloadFailed)
    expect(err.name).toBe('TypeError')
    expect(errorCode(err)).toBe('UND_ERR_SOCKET')
  })

  it('errorCode never hands back a message', () => {
    expect(
      errorCode(new Error(`GET https://x/file/bot${MOVED}/y failed`))
    ).toBe('Error')
    expect(errorCode(null)).toBe('error')
  })
})

describe('telegramFileLink: the URL a third party can fetch', () => {
  it('cloud bot: the cloud URL, unchanged, and nothing is fetched', async () => {
    const url = await telegramFileLink(STAYS, {
      file_path: 'photos/file_1.jpg',
    })
    expect(url).toBe(
      `https://api.telegram.org/file/bot${STAYS}/photos/file_1.jpg`
    )
    expect(asked).toEqual([])
  })

  it('bot on our server: the shelf copy -- the private URL never leaves', async () => {
    const url = await telegramFileLink(MOVED, {
      file_path: ABS,
      file_size: 3000,
    })
    expect(url).toBe('https://shelf.example/s3/file_3.mp4')
    expect(url).not.toContain('ZZmoved')
    // Asked twice, uploaded once.
    await telegramFileLink(MOVED, { file_path: ABS, file_size: 3000 })
    expect(asked).toEqual([ABS])
  })
})

describe("Telegraf's getFileLink, taught our server", () => {
  class FakeTelegram {
    constructor(readonly token: string) {}
    async getFile(fileId: string) {
      return { file_id: fileId, file_path: ABS, file_size: 3000 }
    }
    async getFileLink(): Promise<URL> {
      return new URL('file:///the-original-answer')
    }
  }
  installLocalFileLinks(FakeTelegram)

  it('a cloud bot gets the original, untouched', async () => {
    const link = await new FakeTelegram(STAYS).getFileLink('f' as never)
    expect(String(link)).toBe('file:///the-original-answer')
  })

  it('a bot on our server gets the shelf URL instead of a useless file: URL', async () => {
    const link = await new FakeTelegram(MOVED).getFileLink('f' as never)
    expect(String(link)).toBe('https://shelf.example/s3/file_3.mp4')
    expect(asked).toEqual([ABS])
  })

  it('installing twice does not wrap twice', () => {
    const before = FakeTelegram.prototype.getFileLink
    installLocalFileLinks(FakeTelegram)
    expect(FakeTelegram.prototype.getFileLink).toBe(before)
  })
})
