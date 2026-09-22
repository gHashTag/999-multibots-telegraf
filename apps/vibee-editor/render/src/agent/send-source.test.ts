import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

/**
 * A FILE SENT FROM A PERSON'S SESSION IS THE FILE THAT WAS STORED.
 *
 * Production, 2026-09-22, through the owner's own session: a 46 322 402-byte
 * mp4 on our shelf went out re-encoded (the send path fetched our `/s3/`
 * link, which transcoded it to 16 009 894 bytes); a shelf `.zip` failed with
 * "could not download the file (500)"; the same mp4 given by its bucket URL died
 * inside GramJS with "Either one of `buffer` or `filePath` should be
 * specified" -- the library's words, shown to the owner under a Send button.
 *
 * These tests hold the send path to three things:
 *   - a shelf link is read from the bucket BY KEY: the original bytes, and
 *     never an HTTP request (fetch throws here);
 *   - the file reaches GramJS as a path it can read at any size -- proved by
 *     running GramJS' own `uploadFile` on a 21 MB copy;
 *   - a foreign link is downloaded under the render's rules for fetched
 *     media, or refused in a sentence.
 */

const SHELF = 'https://render.test'

/*
 * The first import of the send path pulls GramJS and the tool registry
 * behind it -- several seconds cold, every file pays it once after
 * `resetModules`. The wait is for the import, not for anything under test.
 */
vi.setConfig({ testTimeout: 30_000 })
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')

function fixture(size: number, seed: number): Buffer {
  const out = Buffer.alloc(size)
  let x = seed >>> 0 || 1
  for (let i = 0; i < size; i++) {
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    out[i] = x & 0xff
  }
  return out
}

/*
 * The bucket double. Objects by key; the cap it is given is ENFORCED (a
 * larger object answers null, as `s3GetToFile` does), an unknown key throws
 * NoSuchKey, and every read is recorded with the key and cap it was asked.
 * `virtualSize` lets one entry claim to be larger than it is, so the cap can
 * be proved without writing half a gigabyte.
 */
const objects = new Map<string, { bytes: Buffer; virtualSize?: number }>()
const reads: Array<{ key: string; max: number }> = []

beforeEach(() => {
  vi.resetModules()
  process.env.PUBLIC_URL = SHELF
  objects.clear()
  reads.length = 0
  vi.doMock('../lib/s3-put', async importOriginal => {
    const actual = await importOriginal<typeof import('../lib/s3-put')>()
    return {
      ...actual,
      s3GetToFile: async (key: string, path: string, max: number) => {
        reads.push({ key, max })
        const o = objects.get(key)
        if (!o) {
          const e = new Error('The specified key does not exist.')
          e.name = 'NoSuchKey'
          throw e
        }
        if ((o.virtualSize ?? o.bytes.length) > max) return null
        writeFileSync(path, o.bytes)
        return o.bytes.length
      },
    }
  })
  // The shelf road must never touch HTTP. Anything that tries, fails loudly.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('HTTP was used')
    })
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.doUnmock('../lib/s3-put')
  delete process.env.PUBLIC_URL
})

type Sent = {
  to: string
  params: Record<string, any>
  bytes: Buffer | null
  path: string | null
}

/**
 * A client whose `sendFile` lives on the PROTOTYPE and reads `this`, like
 * GramJS' own. It copies the bytes at the moment of sending -- the local copy
 * is removed right after, and "what went to Telegram" is the question.
 */
class FakeClient {
  sent: Sent[] = []
  onSend?: (params: Record<string, any>) => Promise<void>
  failWith?: string
  async sendMessage() {
    return {}
  }
  async getDialogs() {
    return []
  }
  async sendFile(to: string, params: Record<string, any>) {
    if (!(this instanceof FakeClient))
      throw new Error('sendFile lost its client')
    const f = params.file
    const path =
      f && typeof f === 'object' && typeof f.path === 'string' ? f.path : null
    this.sent.push({
      to,
      params,
      bytes: path ? readFileSync(path) : null,
      path,
    })
    if (this.onSend) await this.onSend(params)
    if (this.failWith) throw new Error(this.failWith)
    return { id: 42 }
  }
}

async function load() {
  const q = await import('./tg-proposals')
  const src = await import('./send-source')
  return { send: q.sendFileWithAddressBook, src }
}

describe('our shelf: the original bytes, read by key', () => {
  it('a document goes out byte-identical under the name the caller gave', async () => {
    const zip = fixture(3 * 1024 * 1024 + 17, 5)
    objects.set('assets/1-archive.zip', { bytes: zip })
    const { send } = await load()
    const c = new FakeClient()
    await send(
      c as never,
      '@lead',
      {
        kind: 'document',
        url: `${SHELF}/s3/assets/1-archive.zip?v=2#top`,
        fileName: 'Архив проекта.zip',
      },
      'вот архив'
    )
    expect(reads.map(r => r.key)).toEqual(['assets/1-archive.zip'])
    expect(c.sent).toHaveLength(1)
    const s = c.sent[0]
    expect(sha(s.bytes!)).toBe(sha(zip))
    expect(s.params.file).toMatchObject({
      name: 'Архив проекта.zip',
      size: zip.length,
    })
    expect(s.params.file.buffer).toBeUndefined()
    expect(s.params.forceDocument).toBe(true)
    expect(s.params.caption).toBe('вот архив')
  })

  it('a video sent AS A DOCUMENT is the original, not a re-encode', async () => {
    const mp4 = fixture(4 * 1024 * 1024 + 3, 9)
    objects.set('assets/2-talk.mp4', { bytes: mp4 })
    const { send } = await load()
    const c = new FakeClient()
    await send(
      c as never,
      '@lead',
      {
        kind: 'document',
        url: `${SHELF}/s3/assets/2-talk.mp4`,
        fileName: 'talk.mp4',
      },
      undefined
    )
    expect(sha(c.sent[0].bytes!)).toBe(sha(mp4))
    expect(c.sent[0].params.file.size).toBe(mp4.length)
  })

  it('a video, a voice note and a video note are the stored bytes too', async () => {
    const clip = fixture(1_200_000, 13)
    const voice = fixture(60_000, 17)
    objects.set('assets/3-clip.mov', { bytes: clip })
    objects.set('assets/4-voice.ogg', { bytes: voice })
    objects.set('assets/5-round.mp4', { bytes: clip })
    const { send } = await load()
    const c = new FakeClient()
    await send(
      c as never,
      '@lead',
      { kind: 'video', url: `${SHELF}/s3/assets/3-clip.mov` },
      'кадр'
    )
    await send(
      c as never,
      '@lead',
      { kind: 'voice', url: `${SHELF}/s3/assets/4-voice.ogg` },
      undefined
    )
    await send(
      c as never,
      '@lead',
      {
        kind: 'video_note',
        url: `${SHELF}/s3/assets/5-round.mp4`,
        duration: 4,
      },
      undefined
    )
    expect(reads.map(r => r.key)).toEqual([
      'assets/3-clip.mov',
      'assets/4-voice.ogg',
      'assets/5-round.mp4',
    ])
    expect(sha(c.sent[0].bytes!)).toBe(sha(clip))
    expect(c.sent[0].params.supportsStreaming).toBe(true)
    expect(sha(c.sent[1].bytes!)).toBe(sha(voice))
    expect(c.sent[1].params.voiceNote).toBe(true)
    // 60 000 bytes of voice: ~10 s, measured from the ORIGINAL size.
    expect(c.sent[1].params.attributes[0]).toMatchObject({
      voice: true,
      duration: 10,
    })
    expect(c.sent[2].params.videoNote).toBe(true)
  })

  it('the private copy lives exactly as long as the send, and a send error stays the send error', async () => {
    objects.set('assets/6-a.pdf', { bytes: fixture(1000, 3) })
    const { send } = await load()
    const ok = new FakeClient()
    await send(
      ok as never,
      '@lead',
      { kind: 'document', url: `${SHELF}/s3/assets/6-a.pdf` },
      undefined
    )
    expect(ok.sent[0].path).toBeTruthy()
    expect(existsSync(ok.sent[0].path!)).toBe(false)

    const bad = new FakeClient()
    bad.failWith = 'USER_IS_BLOCKED'
    await expect(
      send(
        bad as never,
        '@lead',
        { kind: 'document', url: `${SHELF}/s3/assets/6-a.pdf` },
        undefined
      )
    ).rejects.toThrow(/^USER_IS_BLOCKED$/)
    expect(existsSync(bad.sent[0].path!)).toBe(false)
  })

  it('a file over 20 MB uploads through GramJS itself, every byte, without the library crash', async () => {
    /*
     * GramJS reads an upload above 20 MB from `CustomFile.path` and ONLY from
     * there. Its real `uploadFile` runs here against a sender that records
     * each part, and the parts are put back together and compared with the
     * stored object.
     */
    const big = fixture(21 * 1024 * 1024 + 5, 21)
    objects.set('assets/7-big.mp4', { bytes: big })
    const { send } = await load()
    const { uploadFile } = await import('telegram/client/uploads')
    const parts: Buffer[] = []
    const c = new FakeClient()
    c.onSend = async params => {
      const tg = {
        session: { dcId: 2 },
        getSender: async () => ({
          isConnected: () => true,
          send: async (req: { filePart: number; bytes: Buffer }) => {
            parts[req.filePart] = Buffer.from(req.bytes)
            return true
          },
        }),
      }
      await uploadFile(tg as never, { file: params.file, workers: 4 } as never)
    }
    await send(
      c as never,
      '@lead',
      {
        kind: 'document',
        url: `${SHELF}/s3/assets/7-big.mp4`,
        fileName: 'big.mp4',
      },
      undefined
    )
    const joined = Buffer.concat(parts)
    expect(joined.length).toBe(big.length)
    expect(sha(joined)).toBe(sha(big))
  }, 60_000)

  it('a photo and an album stay links for Telegram to fetch: nothing is read from the bucket', async () => {
    const { send } = await load()
    const c = new FakeClient()
    await send(
      c as never,
      '@lead',
      { kind: 'photo', url: `${SHELF}/s3/assets/p.jpg` },
      'фото'
    )
    await send(
      c as never,
      '@lead',
      {
        kind: 'album',
        urls: [`${SHELF}/s3/assets/1.jpg`, `${SHELF}/s3/assets/2.jpg`],
      },
      undefined
    )
    expect(reads).toEqual([])
    expect(c.sent[0].params.file).toBe(`${SHELF}/s3/assets/p.jpg`)
    expect(c.sent[1].params.file).toEqual([
      `${SHELF}/s3/assets/1.jpg`,
      `${SHELF}/s3/assets/2.jpg`,
    ])
  })

  it('a missing key and an oversized object are refused in words, with the send never reached', async () => {
    objects.set('assets/8-huge.zip', {
      bytes: fixture(10, 1),
      virtualSize: 600 * 1024 * 1024,
    })
    const { send, src } = await load()
    const c = new FakeClient()
    await expect(
      send(
        c as never,
        '@lead',
        { kind: 'document', url: `${SHELF}/s3/assets/none.zip` },
        undefined
      )
    ).rejects.toThrow('нет на полке')
    await expect(
      send(
        c as never,
        '@lead',
        { kind: 'document', url: `${SHELF}/s3/assets/8-huge.zip` },
        undefined
      )
    ).rejects.toThrow('больше 512 МБ')
    expect(reads.at(-1)?.max).toBe(src.SHELF_SEND_MAX_BYTES)
    expect(c.sent).toEqual([])
  })
})

describe('anywhere else: the render rules for fetched media, or a sentence', () => {
  it('a host that resolves to a private address is refused before any socket opens', async () => {
    const { send, src } = await load()
    src.useDownloadForTests({
      lookupImpl: async () => [{ address: '10.1.2.3', family: 4 }],
    })
    const c = new FakeClient()
    const run = send(
      c as never,
      '@lead',
      { kind: 'document', url: 'https://files.example/report.pdf' },
      undefined
    )
    await expect(run).rejects.toThrow('внутреннюю сеть')
    await expect(run).rejects.not.toThrow(/Either one of/)
    // A literal link-local address needs no DNS at all to be refused.
    await expect(
      send(
        c as never,
        '@lead',
        { kind: 'video', url: 'https://169.254.169.254/latest/x.mp4' },
        undefined
      )
    ).rejects.toThrow('внутреннюю сеть')
    expect(c.sent).toEqual([])
    expect(reads).toEqual([])
  })

  it('a public file is downloaded, capped and sent byte-identical, without following redirects', async () => {
    const doc = fixture(2 * 1024 * 1024, 31)
    const seen: Array<RequestInit | undefined> = []
    const { send, src } = await load()
    src.useDownloadForTests({
      fetchImpl: (async (_u: unknown, init?: RequestInit) => {
        seen.push(init)
        return new Response(new Uint8Array(doc), { status: 200 })
      }) as typeof fetch,
    })
    const c = new FakeClient()
    await send(
      c as never,
      '@lead',
      {
        kind: 'document',
        url: 'https://files.example/a/b/report.pdf',
        fileName: 'Отчёт.pdf',
      },
      undefined
    )
    expect(sha(c.sent[0].bytes!)).toBe(sha(doc))
    expect(c.sent[0].params.file.name).toBe('Отчёт.pdf')
    expect(seen[0]?.redirect).toBe('error')
    expect(existsSync(c.sent[0].path!)).toBe(false)
  })

  it('a dot in a directory of the foreign path does not break the local copy', async () => {
    const doc = fixture(40_000, 37)
    const { send, src } = await load()
    src.useDownloadForTests({
      fetchImpl: (async () =>
        new Response(new Uint8Array(doc), { status: 200 })) as typeof fetch,
    })
    const c = new FakeClient()
    await send(
      c as never,
      '@lead',
      { kind: 'document', url: 'https://files.example/files.v2/report' },
      undefined
    )
    expect(sha(c.sent[0].bytes!)).toBe(sha(doc))
    expect(src.localExtension('/files.v2/report')).toBe('')
    expect(src.localExtension('/a/b/Report.PDF')).toBe('pdf')
    expect(src.localExtension('/a/b/x.tar.gz')).toBe('tgz')
  })

  it('a redirect, a 404 and an oversized answer each become a sentence', async () => {
    const { send, src } = await load()
    const c = new FakeClient()
    const doc = {
      kind: 'document' as const,
      url: 'https://files.example/x.pdf',
    }

    src.useDownloadForTests({
      fetchImpl: (async () => {
        throw new TypeError('fetch failed', {
          cause: new Error('unexpected redirect'),
        })
      }) as typeof fetch,
    })
    await expect(send(c as never, '@lead', doc, undefined)).rejects.toThrow(
      'перенаправляет'
    )

    src.useDownloadForTests({
      fetchImpl: (async () =>
        new Response('no', { status: 404 })) as typeof fetch,
    })
    await expect(send(c as never, '@lead', doc, undefined)).rejects.toThrow(
      'не удалось скачать файл (404)'
    )

    src.useDownloadForTests({
      fetchImpl: (async () =>
        new Response('x', {
          status: 200,
          headers: { 'content-length': String(60 * 1024 * 1024) },
        })) as typeof fetch,
    })
    await expect(send(c as never, '@lead', doc, undefined)).rejects.toThrow(
      'больше 50 МБ'
    )
    expect(c.sent).toEqual([])
  })

  it('an http link is refused before anything is fetched', async () => {
    const { send } = await load()
    const c = new FakeClient()
    await expect(
      send(
        c as never,
        '@lead',
        { kind: 'voice', url: 'http://files.example/v.ogg' },
        undefined
      )
    ).rejects.toThrow(/https/)
    expect(c.sent).toEqual([])
  })
})
