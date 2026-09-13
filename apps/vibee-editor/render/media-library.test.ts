import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Readable } from 'node:stream'

/**
 * THE PER-USER MEDIA LIBRARY.
 *
 * Four things this file pins, each a way the feature could rot silently:
 *
 *   1. the table shape -- one row per (owner, lead, url), a transcript column;
 *   2. the token guard -- a Telegram file link is refused at the write AND at
 *      the route, and a fake pool that parses SQL proves the INSERT never ran;
 *   3. idempotence -- the same file twice is one row, `fresh` only once;
 *   4. honesty -- a video is stored but `describeMedia` answers null WITHOUT
 *      calling any provider (fetch is spied and must not be touched).
 *
 * The pool is fake but it reads its statements: an INSERT into user_media
 * upserts by the unique key and reports `fresh` the way Postgres' `xmax = 0`
 * would; anything it does not understand throws, so a wrong statement fails
 * the test instead of passing on an empty `rows: []`.
 */
process.env.MEDIA_RETRY_BASE_MS = '0'
process.env.MEDIA_DESCRIBE_PAUSE_MS = '0'
const OWNER = '144022504'
const LEAD = '900000001'
const SHELF =
  'https://vibee-render-production.up.railway.app/s3/assets/1-voice.ogg'

interface Row {
  id: number
  owner_id: string
  lead_id: string
  url: string
  caption: string | null
  msg_id: number | null
  kind: string
  transcript: string | null
  transcribed_at: Date | null
  [k: string]: unknown
}

function fakePool() {
  const rows: Row[] = []
  const crm: Array<{ msg_id: number; text: string }> = []
  const seen: string[] = []
  let nextId = 1
  const flat = (s: string) => s.replace(/\s+/g, ' ').trim()
  return {
    rows,
    crm,
    seen,
    async query(sql: string, params: unknown[] = []) {
      const q = flat(sql)
      seen.push(q)
      if (q.startsWith('CREATE TABLE IF NOT EXISTS user_media'))
        return { rows: [] }
      if (q.startsWith('CREATE INDEX IF NOT EXISTS user_media_lead_at'))
        return { rows: [] }
      if (q.startsWith('INSERT INTO user_media')) {
        expect(q).toContain('ON CONFLICT (owner_id, lead_id, url) DO UPDATE')
        expect(q).toContain('RETURNING id, (xmax = 0) AS fresh')
        const [
          owner_id,
          lead_id,
          surface,
          msg_id,
          at,
          out,
          kind,
          name,
          mime,
          bytes,
          url,
          tg,
          caption,
        ] = params as any[]
        const have = rows.find(
          r => r.owner_id === owner_id && r.lead_id === lead_id && r.url === url
        )
        if (have) {
          have.caption = caption ?? have.caption
          have.msg_id = have.msg_id ?? msg_id
          return { rows: [{ id: have.id, fresh: false }] }
        }
        const row: Row = {
          id: nextId++,
          owner_id,
          lead_id,
          surface,
          msg_id,
          at,
          out,
          kind,
          name,
          mime,
          bytes,
          url,
          tg_file_unique_id: tg,
          caption,
          transcript: null,
          transcribed_at: null,
        }
        rows.push(row)
        return { rows: [{ id: row.id, fresh: true }] }
      }
      if (q.startsWith('UPDATE user_media SET transcript')) {
        const [id, text] = params as [number, string | null]
        const r = rows.find(x => x.id === id)
        if (r) {
          r.transcript = text
          r.transcribed_at = new Date()
        }
        return { rows: [] }
      }
      if (q.startsWith('SELECT') && q.includes('FROM user_media')) {
        const [owner_id, lead_id, limit] = params as [string, string, number]
        let out = rows.filter(
          r => r.owner_id === owner_id && r.lead_id === lead_id
        )
        if (q.includes('transcribed_at IS NULL'))
          out = out.filter(r => !r.transcribed_at)
        if (q.includes('AND kind = $4'))
          out = out.filter(r => r.kind === params[3])
        return { rows: out.slice(0, limit) }
      }
      // crm_messages, as chat-memory writes it (mirrorNow -> rememberMessagesFresh).
      if (q.startsWith('CREATE TABLE IF NOT EXISTS crm_')) return { rows: [] }
      if (q.startsWith('CREATE INDEX') && q.includes('crm_messages'))
        return { rows: [] }
      if (q.startsWith('INSERT INTO crm_messages')) {
        expect(q).toContain(
          'ON CONFLICT (owner_id, lead_id, msg_id) DO NOTHING'
        )
        const fresh: Array<{ msg_id: number }> = []
        for (let i = 0; i + 5 < params.length; i += 6) {
          const msg_id = Number(params[i + 2])
          const text = String(params[i + 5] ?? '')
          if (!Number.isFinite(msg_id) || !text) continue
          if (crm.some(m => m.msg_id === msg_id)) continue
          crm.push({ msg_id, text })
          fresh.push({ msg_id })
        }
        return { rows: fresh }
      }
      if (q.startsWith('UPDATE crm_messages SET text = left(text ||')) {
        const [, , msg_id, words] = params as [string, string, number, string]
        const m = crm.find(x => x.msg_id === Number(msg_id))
        if (m && !m.text.includes(words)) m.text = `${m.text}\n${words}`
        return { rows: [] }
      }
      throw new Error(`fake pool: unexpected statement: ${q.slice(0, 80)}`)
    },
  }
}

beforeEach(() => {
  vi.resetModules()
  vi.doMock('./src/agent/zep-memory', () => ({
    zepConfigured: () => false,
    zepEnsureUser: async () => undefined,
    zepEnsureThread: async () => undefined,
    zepAddMessages: async () => 0,
    zepContext: async () => null,
  }))
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('user_media table', () => {
  it('is keyed by (owner, lead, url) and carries a transcript column', async () => {
    const { USER_MEDIA_TABLE_SQL } = await import('./src/agent/media-library')
    expect(USER_MEDIA_TABLE_SQL).toMatch(
      /CREATE TABLE IF NOT EXISTS user_media/
    )
    expect(USER_MEDIA_TABLE_SQL).toMatch(/UNIQUE \(owner_id, lead_id, url\)/)
    for (const col of [
      'owner_id',
      'lead_id',
      'surface',
      'msg_id',
      'kind',
      'name',
      'mime',
      'bytes',
      'url',
      'tg_file_unique_id',
      'caption',
      'transcript',
      'transcribed_at',
    ]) {
      expect(USER_MEDIA_TABLE_SQL).toContain(col)
    }
  })
})

describe('forgetTranscripts', () => {
  it('clears only the asked kind of one lead and reports the count', async () => {
    const { forgetTranscripts } = await import('./src/agent/media-library')
    const seen: Array<{ sql: string; params: unknown[] }> = []
    const pool = {
      async query(sql: string, params: unknown[] = []) {
        seen.push({ sql: sql.replace(/\s+/g, ' ').trim(), params })
        return { rows: [], rowCount: /UPDATE user_media/.test(sql) ? 4 : 0 }
      },
    }
    expect(await forgetTranscripts(pool as never, OWNER, LEAD, 'image')).toBe(4)
    const upd = seen.find(q => q.sql.startsWith('UPDATE user_media'))!
    expect(upd.sql).toContain('SET transcript = NULL, transcribed_at = NULL')
    expect(upd.sql).toContain('kind = $3 AND transcript IS NOT NULL')
    expect(upd.params).toEqual([OWNER, LEAD, 'image'])
  })
})

describe('the token guard', () => {
  it('rememberMedia refuses a Telegram file link before touching the database', async () => {
    const { rememberMedia, forgetMediaTableForTests } = await import(
      './src/agent/media-library'
    )
    forgetMediaTableForTests()
    const pool = fakePool()
    await expect(
      rememberMedia(pool, OWNER, {
        lead: LEAD,
        surface: 'business',
        msgId: 1,
        at: new Date(),
        out: false,
        kind: 'audio',
        name: 'voice.ogg',
        mime: 'audio/ogg',
        bytes: 100,
        url: 'https://api.telegram.org/file/bot123456:SECRET/voice/file_1.oga',
        tgFileUniqueId: null,
        caption: null,
      })
    ).rejects.toThrow(/Telegram file link/)
    expect(pool.seen.some(q => q.startsWith('INSERT'))).toBe(false)
  })

  it('the route answers 400 for the whole batch when any url is on api.telegram.org', async () => {
    const { handleCrmMedia } = await import('./src/agent/media-library-route')
    const pool = fakePool()
    const r = res()
    await handleCrmMedia(
      req({
        lead: LEAD,
        surface: 'business',
        items: [
          {
            msg_id: 1,
            kind: 'image',
            name: 'a.jpg',
            url: SHELF.replace('voice.ogg', 'a.jpg'),
          },
          {
            msg_id: 2,
            kind: 'audio',
            name: 'voice.ogg',
            url: 'HTTPS://API.TELEGRAM.ORG/file/bot1:X/voice.oga',
          },
        ],
      }),
      r as never,
      OWNER,
      async () => pool
    )
    expect(r.out.code).toBe(400)
    expect(r.out.body.error).toMatch(/api\.telegram\.org/)
    expect(pool.rows).toHaveLength(0)
  })
})

describe('idempotence', () => {
  it('the same file twice is one row; fresh only the first time; the caption fills in', async () => {
    const { rememberMedia, listMedia, forgetMediaTableForTests } = await import(
      './src/agent/media-library'
    )
    forgetMediaTableForTests()
    const pool = fakePool()
    const base = {
      lead: LEAD,
      surface: 'business' as const,
      msgId: 41,
      at: new Date('2026-09-13T09:00:00Z'),
      out: false,
      kind: 'audio' as const,
      name: 'voice.ogg',
      mime: 'audio/ogg',
      bytes: 4096,
      url: SHELF,
      tgFileUniqueId: 'AQAD',
      caption: null,
    }
    const first = await rememberMedia(pool, OWNER, base)
    const second = await rememberMedia(pool, OWNER, {
      ...base,
      caption: 'вот запись',
    })
    expect(first.fresh).toBe(true)
    expect(second.fresh).toBe(false)
    expect(second.id).toBe(first.id)
    const items = await listMedia(pool, OWNER, LEAD)
    expect(items).toHaveLength(1)
    expect(items[0].caption).toBe('вот запись')
    expect(items[0].url).toBe(SHELF)
  })

  it('the route stores the rows for the verified owner and reports fresh + ids', async () => {
    const { handleCrmMedia } = await import('./src/agent/media-library-route')
    const { forgetMediaTableForTests } = await import(
      './src/agent/media-library'
    )
    forgetMediaTableForTests()
    const pool = fakePool()
    // The background describe must not reach a provider in a test.
    const fetchSpy = vi.fn(async () => new Response('{}', { status: 500 }))
    vi.stubGlobal('fetch', fetchSpy)
    const r = res()
    await handleCrmMedia(
      req({
        lead: LEAD,
        surface: 'business',
        items: [
          {
            msg_id: 7,
            at: 1757348157,
            out: false,
            kind: 'video',
            name: 'clip.mp4',
            mime: 'video/mp4',
            url: SHELF.replace('voice.ogg', 'clip.mp4'),
          },
        ],
      }),
      r as never,
      OWNER,
      async () => pool
    )
    expect(r.out.code).toBe(200)
    expect(r.out.body).toMatchObject({ ok: true, fresh: 1, ids: [1] })
    expect(pool.rows[0]).toMatchObject({
      owner_id: OWNER,
      lead_id: LEAD,
      kind: 'video',
    })
    // Let the fire-and-forget describe run: a video is marked attempted, no fetch.
    await new Promise(r => setTimeout(r, 10))
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(pool.rows[0].transcribed_at).not.toBeNull()
    expect(pool.rows[0].transcript).toBeNull()
  })

  it('a business DM may not name the owner as the lead; the bot surface must', async () => {
    const { handleCrmMedia } = await import('./src/agent/media-library-route')
    const pool = fakePool()
    const bad = res()
    await handleCrmMedia(
      req({
        lead: OWNER,
        surface: 'business',
        items: [{ kind: 'image', name: 'a.jpg', url: SHELF }],
      }),
      bad as never,
      OWNER,
      async () => pool
    )
    expect(bad.out.code).toBe(400)
    const ok = res()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 500 }))
    )
    await handleCrmMedia(
      req({
        lead: OWNER,
        surface: 'bot',
        items: [{ kind: 'video', name: 'a.mp4', url: SHELF }],
      }),
      ok as never,
      OWNER,
      async () => pool
    )
    expect(ok.out.code).toBe(200)
  })
})

describe('describeMedia', () => {
  it('answers null for a video without calling any provider', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { describeMedia } = await import('./src/agent/media-library')
    const out = await describeMedia(
      SHELF.replace('voice.ogg', 'clip.mp4'),
      'video',
      'video/mp4',
      'clip.mp4'
    )
    expect(out).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('answers null for a binary document without fetching it', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { describeMedia } = await import('./src/agent/media-library')
    expect(
      await describeMedia(
        SHELF.replace('voice.ogg', 'brief.pdf'),
        'file',
        'application/pdf',
        'brief.pdf'
      )
    ).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('reads a text-like document as text, capped', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('hello from the brief', { status: 200 }))
    )
    const { describeMedia } = await import('./src/agent/media-library')
    expect(
      await describeMedia(
        SHELF.replace('voice.ogg', 'brief.md'),
        'file',
        'text/markdown',
        'brief.md'
      )
    ).toBe('hello from the brief')
  })

  it('audio goes to Whisper when a key is set: the bytes are fetched from OUR shelf and posted as a file', async () => {
    process.env.OPENAI_API_KEY = 'w' // secret-guard-ok: invented for this test
    delete process.env.WHISPER_API_KEY
    delete process.env.WHISPER_BASE_URL
    delete process.env.OPENAI_BASE_URL
    const posts: Array<{ url: string; init: RequestInit }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url) === SHELF)
          return new Response(Buffer.from('OggS voice bytes'), {
            status: 200,
            headers: { 'content-type': 'audio/ogg' },
          })
        posts.push({ url: String(url), init: init ?? {} })
        return new Response('  слова из длинной записи  ', { status: 200 })
      })
    )
    const { describeMedia, resetWhisperForTests } = await import(
      './src/agent/media-library'
    )
    resetWhisperForTests()
    expect(await describeMedia(SHELF, 'audio', 'audio/ogg', 'voice.ogg')).toBe(
      'слова из длинной записи'
    )
    expect(posts).toHaveLength(1)
    expect(posts[0].url).toBe('https://api.openai.com/v1/audio/transcriptions')
    const form = posts[0].init.body as FormData
    expect(form.get('model')).toBe('whisper-1')
    expect(form.get('response_format')).toBe('text')
    expect((form.get('file') as File).name).toBe('voice.ogg')
    expect(
      (posts[0].init.headers as Record<string, string>).Authorization
    ).toBe('Bearer w')
  })

  it('a Groq key alone (gsk_) lands on Groq with its turbo Whisper; an explicit base or model wins', async () => {
    delete process.env.WHISPER_BASE_URL
    delete process.env.WHISPER_MODEL
    delete process.env.OPENAI_BASE_URL
    process.env.WHISPER_API_KEY = 'gsk_test' // secret-guard-ok: invented for this test
    const { whisperConfig, resetWhisperForTests } = await import(
      './src/agent/media-library'
    )
    resetWhisperForTests()
    expect(whisperConfig()).toEqual({
      base: 'https://api.groq.com/openai/v1',
      key: 'gsk_test',
      model: 'whisper-large-v3-turbo',
    })
    process.env.WHISPER_MODEL = 'whisper-large-v3'
    expect(whisperConfig()?.model).toBe('whisper-large-v3')
    process.env.WHISPER_BASE_URL = 'https://stt.example.com/v1/'
    expect(whisperConfig()?.base).toBe('https://stt.example.com/v1')
    delete process.env.WHISPER_API_KEY
    delete process.env.WHISPER_BASE_URL
    delete process.env.WHISPER_MODEL
  })

  it('a refused Whisper key falls back to the chat provider and is not asked again', async () => {
    process.env.OPENAI_API_KEY = 'w' // secret-guard-ok: invented for this test
    process.env.NVIDIA_API_KEY = 'n' // secret-guard-ok: invented for this test
    delete process.env.WHISPER_API_KEY
    const urls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(String(url))
        if (String(url) === SHELF)
          return new Response(Buffer.from('OggS'), { status: 200 })
        if (/audio\/transcriptions/.test(String(url)))
          return new Response('{"error":"Incorrect API key"}', { status: 401 })
        return new Response(
          JSON.stringify({ choices: [{ message: { content: 'из чата' } }] }),
          { status: 200 }
        )
      })
    )
    const { describeMedia, resetWhisperForTests, whisperConfig } = await import(
      './src/agent/media-library'
    )
    resetWhisperForTests()
    expect(await describeMedia(SHELF, 'audio', 'audio/ogg', 'a.ogg')).toBe(
      'из чата'
    )
    expect(urls.filter(u => /audio\/transcriptions/.test(u))).toHaveLength(1)
    expect(whisperConfig()).toBeNull()
    // Second file: Whisper is skipped outright.
    expect(await describeMedia(SHELF, 'audio', 'audio/ogg', 'b.ogg')).toBe(
      'из чата'
    )
    expect(urls.filter(u => /audio\/transcriptions/.test(u))).toHaveLength(1)
  })

  it('a throttled provider (503) is asked again, and the second answer counts', async () => {
    process.env.NVIDIA_API_KEY = 'n' // secret-guard-ok: invented for this test
    delete process.env.OPENAI_API_KEY
    let calls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1
        if (calls === 1)
          return new Response('{"error":"ResourceExhausted"}', { status: 503 })
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: 'слова из записи' } }],
          }),
          { status: 200 }
        )
      })
    )
    const { describeMedia } = await import('./src/agent/media-library')
    expect(await describeMedia(SHELF, 'audio', 'audio/ogg', 'voice.ogg')).toBe(
      'слова из записи'
    )
    expect(calls).toBe(2)
  })

  it('a provider that fails is retryable: DescribeFailed, and the row stays pending', async () => {
    process.env.NVIDIA_API_KEY = 'n' // secret-guard-ok: invented for this test
    delete process.env.OPENAI_API_KEY
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('404 page not found', { status: 404 }))
    )
    const { describeMedia, DescribeFailed, transcribeAndMirror } = await import(
      './src/agent/media-library'
    )
    await expect(
      describeMedia(SHELF, 'audio', 'audio/ogg', 'voice.ogg')
    ).rejects.toBeInstanceOf(DescribeFailed)
    const updates: string[] = []
    const pool = {
      async query(sql: string) {
        if (/UPDATE user_media SET transcript/.test(sql)) updates.push(sql)
        return { rows: [], rowCount: 0 }
      },
    }
    const r = await transcribeAndMirror(pool as never, OWNER, [
      {
        id: 7,
        lead: LEAD,
        surface: 'ingest',
        msgId: 1,
        at: new Date(),
        out: false,
        kind: 'audio',
        name: 'voice.ogg',
        mime: 'audio/ogg',
        bytes: 10,
        url: SHELF,
        tgFileUniqueId: null,
        caption: null,
      } as never,
    ])
    expect(r).toEqual({ described: 0, mirrored: 0 })
    expect(updates).toEqual([])
  })
})

describe('describeMedia with a vision endpoint', () => {
  const shelfPhoto = SHELF.replace('voice.ogg', 'photo.jpg')
  const shelfClip = SHELF.replace('voice.ogg', 'clip.mp4')

  afterEach(() => {
    delete process.env.VISION_API_KEY
    delete process.env.VISION_BASE_URL
    delete process.env.VISION_MODEL
  })

  it('visionConfig: no key -> null; defaults to the Railway private host; explicit base and model win', async () => {
    delete process.env.VISION_API_KEY
    const { visionConfig, resetVisionForTests } = await import(
      './src/agent/media-vision'
    )
    resetVisionForTests()
    expect(visionConfig()).toBeNull()
    process.env.VISION_API_KEY = 'v' // secret-guard-ok: invented for this test
    expect(visionConfig()).toEqual({
      base: 'http://vision.railway.internal:8000/v1',
      key: 'v',
      model: 'qwen3-vl-2b-instruct',
    })
    process.env.VISION_BASE_URL = 'https://vlm.example.com/v1/'
    process.env.VISION_MODEL = 'other-vlm'
    expect(visionConfig()).toEqual({
      base: 'https://vlm.example.com/v1',
      key: 'v',
      model: 'other-vlm',
    })
  })

  it('a photo is fetched from OUR shelf, inlined as a data URL and posted to the vision endpoint', async () => {
    process.env.VISION_API_KEY = 'v' // secret-guard-ok: invented for this test
    const posts: Array<{ url: string; body: any }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url) === shelfPhoto)
          return new Response(Buffer.from('JPEG bytes'), {
            status: 200,
            headers: { 'content-type': 'image/jpeg' },
          })
        posts.push({ url: String(url), body: JSON.parse(String(init?.body)) })
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: '  На фото кот.  ' } }],
          }),
          { status: 200 }
        )
      })
    )
    const { resetVisionForTests } = await import('./src/agent/media-vision')
    resetVisionForTests()
    const { describeMedia } = await import('./src/agent/media-library')
    expect(
      await describeMedia(shelfPhoto, 'image', 'image/jpeg', 'photo.jpg')
    ).toBe('На фото кот.')
    expect(posts).toHaveLength(1)
    expect(posts[0].url).toBe(
      'http://vision.railway.internal:8000/v1/chat/completions'
    )
    const parts = posts[0].body.messages[0].content
    expect(parts[0].type).toBe('text')
    expect(parts[1].type).toBe('image_url')
    expect(parts[1].image_url.url).toBe(
      `data:image/jpeg;base64,${Buffer.from('JPEG bytes').toString('base64')}`
    )
  })

  it('a video is sampled into frames with ffmpeg and described from those frames in ONE request', async () => {
    process.env.VISION_API_KEY = 'v' // secret-guard-ok: invented for this test
    const { promises: fs } = await import('node:fs')
    const calls: Array<{ bin: string; args: string[] }> = []
    const { setFrameExecForTests, resetVisionForTests, VIDEO_FRAMES } =
      await import('./src/agent/media-vision')
    resetVisionForTests()
    const prev = setFrameExecForTests(async (bin, args) => {
      calls.push({ bin, args })
      if (bin === 'ffprobe') return { stdout: '60.0\n' }
      // ffmpeg: the output path is the last argument.
      await fs.writeFile(args[args.length - 1], Buffer.from('frame'))
      return { stdout: '' }
    })
    const posts: Array<{ body: any }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url) === shelfClip)
          return new Response(Buffer.from('MP4 bytes'), {
            status: 200,
            headers: { 'content-type': 'video/mp4' },
          })
        posts.push({ body: JSON.parse(String(init?.body)) })
        return new Response(
          JSON.stringify({
            choices: [
              { message: { content: 'Видео: человек идёт по пляжу.' } },
            ],
          }),
          { status: 200 }
        )
      })
    )
    try {
      const { describeMedia } = await import('./src/agent/media-library')
      expect(
        await describeMedia(shelfClip, 'video', 'video/mp4', 'clip.mp4')
      ).toBe('Видео: человек идёт по пляжу.')
    } finally {
      setFrameExecForTests(prev)
    }
    const ffmpegCalls = calls.filter(c => c.bin === 'ffmpeg')
    expect(calls[0].bin).toBe('ffprobe')
    expect(ffmpegCalls).toHaveLength(VIDEO_FRAMES)
    // Centres of equal slices of a 60 s clip.
    expect(ffmpegCalls.map(c => c.args[c.args.indexOf('-ss') + 1])).toEqual([
      '7.500',
      '22.500',
      '37.500',
      '52.500',
    ])
    expect(posts).toHaveLength(1)
    const parts = posts[0].body.messages[0].content
    expect(parts.filter((p: any) => p.type === 'image_url')).toHaveLength(
      VIDEO_FRAMES
    )
  })

  it('a video with no vision endpoint is still an honest null without any call', async () => {
    delete process.env.VISION_API_KEY
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { describeMedia } = await import('./src/agent/media-library')
    expect(
      await describeMedia(shelfClip, 'video', 'video/mp4', 'clip.mp4')
    ).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('a refused vision key falls back to the chat provider for photos and is not asked again', async () => {
    process.env.VISION_API_KEY = 'v' // secret-guard-ok: invented for this test
    const urls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(String(url))
        if (String(url) === shelfPhoto)
          return new Response(Buffer.from('JPEG bytes'), {
            status: 200,
            headers: { 'content-type': 'image/jpeg' },
          })
        if (/vision\.railway\.internal/.test(String(url)))
          return new Response('no', { status: 401 })
        return new Response(
          JSON.stringify({ choices: [{ message: { content: 'кот' } }] }),
          { status: 200 }
        )
      })
    )
    const { resetVisionForTests, visionConfig } = await import(
      './src/agent/media-vision'
    )
    resetVisionForTests()
    const { describeMedia } = await import('./src/agent/media-library')
    expect(
      await describeMedia(shelfPhoto, 'image', 'image/jpeg', 'photo.jpg')
    ).toBe('кот')
    expect(urls.filter(u => /vision\.railway/.test(u))).toHaveLength(1)
    expect(visionConfig()).toBeNull()
    await describeMedia(shelfPhoto, 'image', 'image/jpeg', 'photo.jpg')
    expect(urls.filter(u => /vision\.railway/.test(u))).toHaveLength(1)
  })
})

describe('mirrorTranscript', () => {
  it('inserts a new crm_messages row for an unknown msg_id and appends once to a known one', async () => {
    const { mirrorTranscript } = await import('./src/agent/media-library')
    const { forgetMemoryTableForTests } = await import(
      './src/agent/chat-memory'
    )
    forgetMemoryTableForTests()
    const pool = fakePool()
    const row = {
      lead: LEAD,
      msgId: 41,
      at: new Date(),
      out: false,
      kind: 'audio' as const,
      name: 'voice.ogg',
      mime: 'audio/ogg',
      caption: null,
    }
    expect(await mirrorTranscript(pool, OWNER, row, 'сколько стоит рилс')).toBe(
      'inserted'
    )
    expect(pool.crm[0].text).toBe('[голосовое]\nсколько стоит рилс')
    expect(await mirrorTranscript(pool, OWNER, row, 'сколько стоит рилс')).toBe(
      'appended'
    )
    expect(pool.crm[0].text.split('сколько стоит рилс')).toHaveLength(2)
    expect(
      await mirrorTranscript(pool, OWNER, { ...row, msgId: null }, 'x')
    ).toBe('skipped')
  })
})

describe('mtprotoMediaInfo', () => {
  it('names a photo, a voice note and a file from gramjs-shaped objects', async () => {
    const { mtprotoMediaInfo } = await import('./src/agent/media-library')
    expect(
      mtprotoMediaInfo(
        {
          className: 'MessageMediaPhoto',
          photo: { sizes: [{ size: 900 }, { size: 42000 }] },
        },
        5
      )
    ).toEqual({
      kind: 'image',
      name: 'photo-5.jpg',
      mime: 'image/jpeg',
      bytes: 42000,
    })
    expect(
      mtprotoMediaInfo(
        {
          className: 'MessageMediaDocument',
          document: {
            mimeType: 'audio/ogg',
            size: { toJSNumber: () => 51200 },
            attributes: [{ className: 'DocumentAttributeAudio', voice: true }],
          },
        },
        6
      )
    ).toEqual({
      kind: 'audio',
      name: 'voice-6.ogg',
      mime: 'audio/ogg',
      bytes: 51200,
    })
    expect(
      mtprotoMediaInfo({
        className: 'MessageMediaDocument',
        document: {
          mimeType: 'application/pdf',
          size: 1000,
          attributes: [
            { className: 'DocumentAttributeFilename', fileName: 'brief.pdf' },
          ],
        },
      })
    ).toMatchObject({
      kind: 'file',
      name: 'brief.pdf',
      mime: 'application/pdf',
    })
    expect(mtprotoMediaInfo({ className: 'MessageMediaWebPage' })).toBeNull()
  })
})

function req(body: unknown, method = 'POST') {
  const r = Readable.from([Buffer.from(JSON.stringify(body))])
  return Object.assign(r, {
    url: '/api/crm/media',
    method,
    headers: {},
  }) as never
}
function res() {
  const out = { code: 0, body: null as any }
  return {
    out,
    writeHead: (code: number) => {
      out.code = code
    },
    end: (s: string) => {
      out.body = JSON.parse(s)
    },
  }
}
