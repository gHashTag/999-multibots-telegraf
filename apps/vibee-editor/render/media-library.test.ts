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
      /*
       * reopenUnread, statement by statement, with the conditions it relies
       * on applied rather than assumed: a double that reopened every row it
       * was shown would pass for a query that forgot `transcript IS NULL`.
       */
      if (q.startsWith('UPDATE user_media SET transcribed_at = NULL')) {
        expect(q).toContain('transcript IS NULL')
        const [owner_id, lead_id, which] = params as [string, string, string[]]
        const hit = rows.filter(
          r =>
            r.owner_id === owner_id &&
            r.lead_id === lead_id &&
            r.transcript === null &&
            (q.includes('kind = ANY($3::text[])')
              ? r.transcribed_at !== null && which.includes(r.kind)
              : q.includes('id = ANY($3::bigint[])') &&
                which.includes(String(r.id)))
        )
        for (const r of hit) r.transcribed_at = null
        return { rows: [], rowCount: hit.length }
      }
      if (q.startsWith('SELECT id, name, mime, url FROM user_media')) {
        expect(q).toContain(
          "kind = 'file' AND transcript IS NULL AND transcribed_at IS NOT NULL"
        )
        const [owner_id, lead_id] = params as [string, string]
        return {
          rows: rows.filter(
            r =>
              r.owner_id === owner_id &&
              r.lead_id === lead_id &&
              r.kind === 'file' &&
              r.transcript === null &&
              r.transcribed_at !== null
          ),
        }
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
        /*
         * `rowCount` on purpose, and it used to be missing here. The real
         * UPDATE carries `position($4 in text) = 0`, so it touches a row only
         * the first time the words arrive -- and that count is what decides
         * whether Zep is told. A double that always answers "no rows" would
         * have agreed with a caller that never told Zep anything.
         */
        if (m && !m.text.includes(words)) {
          m.text = `${m.text}\n${words}`
          return { rows: [], rowCount: 1 }
        }
        return { rows: [], rowCount: 0 }
      }
      throw new Error(`fake pool: unexpected statement: ${q.slice(0, 80)}`)
    },
  }
}

/*
 * THE TIMEOUT HERE IS THE IMPORT, NOT AN ASSERTION.
 *
 * Every test in this file resets the module registry and imports the media
 * module graph again, and that cold import crosses vitest's five-second
 * default on a busy machine -- so the run failed on tests that assert on a
 * string constant, and failed differently on each run. Twenty seconds is
 * still short enough that a genuine hang fails the build rather than waiting
 * out a CI job.
 */
vi.setConfig({ testTimeout: 20_000 })

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

  /*
   * A PDF is no longer this case (2026-09-22: it is read, see "every file
   * the sweep meets" below). A format no reader takes still is.
   */
  it('answers null for a binary document no reader takes, without fetching it', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { describeMedia } = await import('./src/agent/media-library')
    expect(
      await describeMedia(
        SHELF.replace('voice.ogg', 'blob.bin'),
        'file',
        'application/octet-stream',
        'blob.bin'
      )
    ).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  /**
   * REWRITTEN 18.09.2026, and the reason is the point of the test.
   *
   * It used to stub `fetch` and assert the document came back over HTTP --
   * and it passed, for months, while this branch could not work in
   * production for a single file. `/s3/` streams images, audio and `.json`
   * and sends every OTHER extension into an ffmpeg transcode, so a real
   * `.md` fetched through the proxy returned an ffmpeg failure. The stub
   * answered the request the shelf would have refused, so the test was
   * measuring the stub.
   *
   * The read now goes through the bucket, and what this pins is the KEY it
   * asks for -- which is the thing that can silently become wrong.
   */
  it('reads a text-like document out of the bucket, by key', async () => {
    const asked: string[] = []
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    vi.doMock('@aws-sdk/client-s3', () => {
      class GetObjectCommand {
        constructor(public input: Record<string, unknown>) {}
      }
      class PutObjectCommand {
        constructor(public input: Record<string, unknown>) {}
      }
      class S3Client {
        async send(cmd: { input: Record<string, unknown> }) {
          asked.push(String(cmd.input.Key))
          return {
            Body: (async function* () {
              yield Buffer.from('hello from the brief', 'utf8')
            })(),
          }
        }
      }
      return { S3Client, GetObjectCommand, PutObjectCommand }
    })
    const { describeMedia } = await import('./src/agent/media-library')
    expect(
      await describeMedia(
        SHELF.replace('voice.ogg', 'brief.md'),
        'file',
        'text/markdown',
        'brief.md'
      )
    ).toBe('hello from the brief')
    expect(asked).toEqual(['assets/1-brief.md'])
    // Nothing left this process over HTTP: there is no URL to aim any more.
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.doUnmock('@aws-sdk/client-s3')
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
        /*
         * The streamed attempt answers, as the production server does once it
         * is given the stream it insists on. The plain attempt must therefore
         * never be made: a second call per recording is a second minute of a
         * CPU transcriber's time.
         */
        return new Response(
          'data: {"delta":"слова из "}\n' +
            'data: {"delta":"длинной записи"}\n' +
            'data: [DONE]\n',
          { status: 200 }
        )
      })
    )
    const { describeMedia, resetWhisperForTests } = await import(
      './src/agent/media-library'
    )
    resetWhisperForTests()
    expect(await describeMedia(SHELF, 'audio', 'audio/ogg', 'voice.ogg')).toBe(
      'слова из длинной записи'
    )
    expect(
      posts,
      'the plain attempt was made although the stream answered'
    ).toHaveLength(1)
    expect(posts[0].url).toBe('https://api.openai.com/v1/audio/transcriptions')
    const form = posts[0].init.body as FormData
    expect(form.get('model')).toBe('whisper-1')
    expect(form.get('response_format')).toBe('json')
    /*
     * SAID OUT LOUD, because the server guessed wrong when it was left to a
     * default: it took its streaming path for a request that never asked for
     * one and then could not serialise a plain result, answering 200 with an
     * empty body 25 times across two different formats.
     */
    expect(form.get('stream')).toBe('true')
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

/*
 * THE SWEEP READS EVERY FILE TOO (2026-09-22).
 *
 * `describeMedia` is what the background pass and the owner-session ingest
 * call, so a reader that only the live turn knew would leave the memory as
 * blind as before. A fake bucket answers by key and refuses any other command;
 * the readers' binaries are doubled at the process boundary, and one the case
 * did not name is reported as not installed rather than as success.
 */
describe('describeMedia: every file the sweep meets', () => {
  const OBJECTS = new Map<string, Buffer>()
  const bucket = () =>
    vi.doMock('@aws-sdk/client-s3', () => {
      class GetObjectCommand {
        constructor(public input: Record<string, unknown>) {}
      }
      class PutObjectCommand {
        constructor(public input: Record<string, unknown>) {
          throw new Error('the sweep must not write to the shelf')
        }
      }
      class S3Client {
        async send(cmd: { input: Record<string, unknown> }) {
          if (!(cmd instanceof GetObjectCommand))
            throw new Error('fake bucket: only GetObject is taught')
          const body = OBJECTS.get(String(cmd.input.Key))
          if (!body)
            throw Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
          return {
            Body: (async function* () {
              yield body
            })(),
          }
        }
      }
      return { S3Client, GetObjectCommand, PutObjectCommand }
    })
  const binaries = (answers: Record<string, string>) =>
    vi.doMock('node:child_process', () => ({
      execFile: (cmd: string, _args: string[], _o: unknown, cb: Function) => {
        if (!(cmd in answers)) {
          cb(
            Object.assign(new Error(`spawn ${cmd} ENOENT`), { code: 'ENOENT' }),
            '',
            ''
          )
          return
        }
        cb(null, answers[cmd], '')
      },
    }))

  afterEach(() => {
    OBJECTS.clear()
    vi.doUnmock('@aws-sdk/client-s3')
    vi.doUnmock('node:child_process')
    delete process.env.WHISPER_API_KEY
    delete process.env.VISION_API_KEY
  })

  it('reads a PDF out of the bucket through pdftotext', async () => {
    OBJECTS.set('assets/1-brief.pdf', Buffer.from('%PDF-1.4 bytes'))
    bucket()
    binaries({ pdftotext: 'Коммерческое предложение\f' })
    const { describeMedia } = await import('./src/agent/media-library')
    expect(
      await describeMedia(
        SHELF.replace('voice.ogg', 'brief.pdf'),
        'file',
        'application/pdf',
        'brief.pdf'
      )
    ).toBe('Коммерческое предложение')
  })

  it('keeps a PDF pending while its reader is not installed: the next deploy brings it', async () => {
    OBJECTS.set('assets/1-brief.pdf', Buffer.from('%PDF-1.4 bytes'))
    bucket()
    binaries({})
    const { describeMedia, DescribeFailed } = await import(
      './src/agent/media-library'
    )
    await expect(
      describeMedia(
        SHELF.replace('voice.ogg', 'brief.pdf'),
        'file',
        'application/pdf',
        'brief.pdf'
      )
    ).rejects.toBeInstanceOf(DescribeFailed)
  })

  /*
   * THE FILES SENT BEFORE THE READERS EXISTED. Until 2026-09-22 every PDF
   * was saved as a final null, `transcribed_at` set -- and nothing reopened
   * a file, so the owner's whole backlog would have stayed unread while only
   * new files were read. `crm_lead_media reread` goes through reopenUnread.
   */
  it('reads a PDF that was closed unread before its reader existed, once reread', async () => {
    OBJECTS.set('assets/1-old.pdf', Buffer.from('%PDF-1.4 bytes'))
    bucket()
    binaries({ pdftotext: 'Договор от марта\f' })
    const lib = await import('./src/agent/media-library')
    lib.forgetMediaTableForTests()
    const pool = fakePool()
    const row = (name: string, mime: string, url: string) => ({
      lead: LEAD,
      surface: 'bot' as const,
      msgId: null,
      at: new Date('2026-09-01T10:00:00Z'),
      out: false,
      kind: 'file' as const,
      name,
      mime,
      bytes: 100,
      url,
      tgFileUniqueId: null,
      caption: null,
    })
    const oldPdf = await lib.rememberMedia(
      pool,
      OWNER,
      row('old.pdf', 'application/pdf', SHELF.replace('voice.ogg', 'old.pdf'))
    )
    const blob = await lib.rememberMedia(
      pool,
      OWNER,
      row(
        'dump.bin',
        'application/octet-stream',
        SHELF.replace('voice.ogg', 'dump.bin')
      )
    )
    // As the old code left them: attempted, nothing readable.
    await lib.saveTranscript(pool, oldPdf.id, null)
    await lib.saveTranscript(pool, blob.id, null)
    expect(await lib.pendingTranscripts(pool, OWNER, LEAD, 100)).toHaveLength(0)

    expect(await lib.reopenUnread(pool, OWNER, LEAD)).toBe(1)
    const again = await lib.pendingTranscripts(pool, OWNER, LEAD, 100)
    expect(again.map(x => x.name)).toEqual(['old.pdf'])
    await lib.transcribeAndMirror(pool, OWNER, again)

    const byId = (id: number) => pool.rows.find(r => r.id === id)
    expect(byId(oldPdf.id)?.transcript).toBe('Договор от марта')
    // A binary no reader opens is still a final answer, not reopened forever.
    expect(byId(blob.id)?.transcribed_at).not.toBeNull()
  })

  it('stores what was SAID in a video note when there is no vision endpoint', async () => {
    process.env.WHISPER_API_KEY = 'gsk_test' // secret-guard-ok: invented for this test
    OBJECTS.set('assets/1-note.mp4', Buffer.from('mp4 bytes'))
    bucket()
    binaries({})
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/s3/'))
          throw new Error('the video must come from the bucket, not the proxy')
        return new Response('data: {"text":"жду ответа"}\ndata: [DONE]\n', {
          status: 200,
        })
      })
    )
    const { describeMedia, resetWhisperForTests } = await import(
      './src/agent/media-library'
    )
    resetWhisperForTests()
    expect(
      await describeMedia(
        SHELF.replace('voice.ogg', 'note.mp4'),
        'video',
        'video/mp4',
        'note.mp4'
      )
    ).toBe('Речь в видео: жду ответа')
  })

  it('keeps the words when the vision endpoint fails on the same video', async () => {
    process.env.WHISPER_API_KEY = 'gsk_test' // secret-guard-ok: invented for this test
    process.env.VISION_API_KEY = 'v' // secret-guard-ok: invented for this test
    OBJECTS.set('assets/1-note.mp4', Buffer.from('mp4 bytes'))
    bucket()
    const { promises: fs } = await import('node:fs')
    const { setFrameExecForTests, resetVisionForTests } = await import(
      './src/agent/media-vision'
    )
    resetVisionForTests()
    const prev = setFrameExecForTests(async (bin, args) => {
      if (bin === 'ffprobe') return { stdout: '4.0\n' }
      await fs.writeFile(args[args.length - 1], Buffer.from('frame'))
      return { stdout: '' }
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = String(url)
        if (u.includes('/audio/transcriptions'))
          return new Response('data: {"text":"жду ответа"}\ndata: [DONE]\n', {
            status: 200,
          })
        if (u.includes('/s3/'))
          return new Response(Buffer.from('mp4 bytes'), { status: 200 })
        return new Response('down', { status: 500 })
      })
    )
    try {
      const { describeMedia, resetWhisperForTests } = await import(
        './src/agent/media-library'
      )
      resetWhisperForTests()
      expect(
        await describeMedia(
          SHELF.replace('voice.ogg', 'note.mp4'),
          'video',
          'video/mp4',
          'note.mp4'
        )
      ).toBe('Речь в видео: жду ответа')
    } finally {
      setFrameExecForTests(prev)
    }
  })
})

describe('the mini app surface', () => {
  it('is a surface a row may carry, and one /api/crm/media will not take from outside', async () => {
    const { MEDIA_SURFACES } = await import('./src/agent/media-library')
    expect(MEDIA_SURFACES).toContain('miniapp')
    const { handleCrmMedia } = await import('./src/agent/media-library-route')
    const pool = fakePool()
    const bad = res()
    await handleCrmMedia(
      req({
        lead: OWNER,
        surface: 'miniapp',
        items: [{ kind: 'image', name: 'a.jpg', url: SHELF }],
      }),
      bad as never,
      OWNER,
      async () => pool
    )
    expect(bad.out.code).toBe(400)
    expect(pool.rows).toHaveLength(0)
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
    expect(
      posts,
      'the plain attempt was made although the stream answered'
    ).toHaveLength(1)
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
    expect(
      posts,
      'the plain attempt was made although the stream answered'
    ).toHaveLength(1)
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

  it('a photo that gave way to a live screen stays pending and never reaches the paid provider', async () => {
    process.env.VISION_API_KEY = 'v' // secret-guard-ok: invented for this test
    const urls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (url: string, init?: { signal?: AbortSignal; body?: string }) => {
          const u = String(url)
          urls.push(u)
          if (u === shelfPhoto)
            return new Response(Buffer.from('JPEG bytes'), {
              status: 200,
              headers: { 'content-type': 'image/jpeg' },
            })
          if (
            /vision\.railway\.internal/.test(u) &&
            !String(init?.body).includes('LIVE-SCREEN')
          )
            // The background ask hangs until it is cut off, like a busy slot.
            return new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () =>
                reject(new Error('aborted'))
              )
            })
          return new Response(
            JSON.stringify({
              choices: [{ message: { content: 'screen seen' } }],
            }),
            {
              status: 200,
            }
          )
        }
      )
    )
    const { resetVisionForTests, askVision, visionConfig } = await import(
      './src/agent/media-vision'
    )
    resetVisionForTests()
    const { describeMedia, DescribeFailed } = await import(
      './src/agent/media-library'
    )
    const sweep = describeMedia(
      shelfPhoto,
      'image',
      'image/jpeg',
      'photo.jpg'
    ).catch(e => e)
    await new Promise(r => setTimeout(r, 30))
    const live = await askVision(
      visionConfig()!,
      'LIVE-SCREEN',
      ['x'],
      5000,
      undefined,
      'live'
    )
    expect(live).toBe('screen seen')
    expect(await sweep).toBeInstanceOf(DescribeFailed)
    // Only the shelf, the cut-off vision ask and the live ask: no chat provider.
    expect(
      urls.filter(u => !u.includes('vision.railway') && u !== shelfPhoto)
    ).toEqual([])
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

describe('reopenUnread', () => {
  afterEach(() => {
    delete process.env.VISION_API_KEY
    delete process.env.WHISPER_API_KEY
  })

  it('reopens image and audio; video joins once anything here can take one', async () => {
    const params: unknown[][] = []
    const pool = {
      query: async (sql: string, p?: unknown[]) => {
        if (/kind = ANY\(\$3::text\[\]\)/.test(sql)) params.push(p ?? [])
        return { rows: [], rowCount: 1 }
      },
    }
    delete process.env.VISION_API_KEY
    delete process.env.WHISPER_API_KEY
    const { reopenUnread, resetWhisperForTests } = await import(
      './src/agent/media-library'
    )
    const { resetVisionForTests } = await import('./src/agent/media-vision')
    resetVisionForTests()
    resetWhisperForTests()
    await reopenUnread(pool as never, '1', '2')
    expect(params[0][2]).toEqual(['image', 'audio'])
    process.env.VISION_API_KEY = 'v' // secret-guard-ok: invented for this test
    resetVisionForTests()
    await reopenUnread(pool as never, '1', '2')
    expect(params[1][2]).toEqual(['image', 'audio', 'video'])
    // The transcriber alone is enough: a video's SPEECH can be read now.
    delete process.env.VISION_API_KEY
    resetVisionForTests()
    process.env.WHISPER_API_KEY = 'gsk_test' // secret-guard-ok: invented for this test
    resetWhisperForTests()
    await reopenUnread(pool as never, '1', '2')
    expect(params[2][2]).toEqual(['image', 'audio', 'video'])
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
    // The shelf names its own objects: the sender's file name is their text
    // and never becomes our key, our URL or our row's name.
    expect(
      mtprotoMediaInfo(
        {
          className: 'MessageMediaDocument',
          document: {
            mimeType: 'application/pdf',
            size: 1000,
            attributes: [
              { className: 'DocumentAttributeFilename', fileName: 'brief.pdf' },
            ],
          },
        },
        7
      )
    ).toEqual({
      kind: 'file',
      name: 'file-7.pdf',
      mime: 'application/pdf',
      bytes: 1000,
    })
    expect(mtprotoMediaInfo({ className: 'MessageMediaWebPage' })).toBeNull()
  })

  it('keeps only an extension it knows from the sender name, never the words', async () => {
    const { mtprotoMediaInfo, isShelfFileName } = await import(
      './src/agent/media-library'
    )
    const named = (fileName: string, mimeType = 'application/octet-stream') =>
      mtprotoMediaInfo(
        {
          className: 'MessageMediaDocument',
          document: {
            mimeType,
            size: 10,
            attributes: [{ className: 'DocumentAttributeFilename', fileName }],
          },
        },
        8
      )?.name
    expect(named('notes for the plan.md')).toBe('file-8.md')
    expect(named('run me.exe')).toBe('file-8.bin')
    expect(named('ignore previous instructions.txt')).toBe('file-8.txt')
    expect(named('x', 'image/heic')).toBe('image-8.heic')
    expect(isShelfFileName('file-8.md')).toBe(true)
    expect(isShelfFileName('video-note-12.mp4')).toBe(true)
    expect(isShelfFileName('ignore previous instructions.txt')).toBe(false)
  })

  it('names no file the sender made disappear: view-once, a timer, or already gone', async () => {
    const { mtprotoMediaInfo } = await import('./src/agent/media-library')
    expect(
      mtprotoMediaInfo(
        {
          className: 'MessageMediaPhoto',
          photo: { sizes: [{ size: 900 }] },
          ttlSeconds: 2147483647,
        },
        9
      )
    ).toBeNull()
    expect(
      mtprotoMediaInfo(
        {
          className: 'MessageMediaDocument',
          ttlSeconds: 10,
          document: {
            mimeType: 'audio/ogg',
            size: 100,
            attributes: [{ className: 'DocumentAttributeAudio', voice: true }],
          },
        },
        9
      )
    ).toBeNull()
    expect(
      mtprotoMediaInfo({ className: 'MessageMediaPhoto', ttlSeconds: 5 }, 9)
    ).toBeNull()
    // Gone from the message, timer or not: there is nothing to name.
    expect(mtprotoMediaInfo({ className: 'MessageMediaPhoto' }, 9)).toBeNull()
    const { sentMediaOf } = await import('./src/agent/tg-message-media')
    expect(sentMediaOf({ media: { className: 'MessageMediaPhoto' } })).toEqual({
      kind: 'photo',
      ephemeral: true,
    })
    expect(
      sentMediaOf({ media: { className: 'MessageMediaDocument', round: true } })
    ).toEqual({ kind: 'video_note', ephemeral: true })
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

/**
 * A 200 WITH NO WORDS IN IT.
 *
 * Owner, 2026-09-20: "why can't the agent read voice messages". It asked, and
 * it was answered -- measured in the whisper service's own log the same day,
 * for a real nineteen-second recording: language detected with probability
 * 1.00, "Transcribed 19.03 seconds of audio in 7.57 seconds", and then
 *
 *   ERROR speaches.routers.stt:transcription_response_to_http_response
 *         Unexpected streaming transcription response type: <class 'tuple'>
 *   "POST /v1/audio/transcriptions HTTP/1.1" 200 OK
 *
 * It heard every word and failed to put them in the reply. That is the worst
 * failure shape there is: every check upstream passes and the text is simply
 * gone, so from the person's side the agent is deaf for no stated reason.
 *
 * What is pinned here is the reader, which is what makes the shape survivable:
 * whatever a server answers, the words come out or nothing does -- never a
 * server's complaint wearing a person's voice.
 */
describe('reading what a transcriber answered', () => {
  it('takes the words out of the json every OpenAI-shaped server returns', async () => {
    const { readTranscript } = await import('./src/agent/media-library')
    expect(readTranscript('{"text":"  привет, это запись  "}')).toBe(
      'привет, это запись'
    )
  })

  it('takes a plain body too, because some servers answer that way', async () => {
    const { readTranscript } = await import('./src/agent/media-library')
    expect(readTranscript('  просто слова  ')).toBe('просто слова')
  })

  /*
   * NOTHING IS NOT A WORD. An empty transcript must read as "no words", so
   * the caller says "не расслышал" rather than putting emptiness in the chat.
   */
  it('calls an empty answer nothing, in either shape', async () => {
    const { readTranscript } = await import('./src/agent/media-library')
    expect(readTranscript('{"text":"   "}')).toBeNull()
    expect(readTranscript('   ')).toBeNull()
    expect(readTranscript('')).toBeNull()
  })

  /*
   * A SERVER'S COMPLAINT IS NOT SOMEBODY'S VOICE. Some transcribers answer
   * 200 with an error object; returning its message as the transcript would
   * put the server's words into the conversation as if a person had said them.
   */
  it('refuses to pass off an error object as what somebody said', async () => {
    const { readTranscript } = await import('./src/agent/media-library')
    expect(
      readTranscript('{"error":{"message":"model is loading"}}')
    ).toBeNull()
  })

  /*
   * A body that merely STARTS with a brace and is not json is still a body.
   * Losing it would be the same silent emptiness this whole fix is about.
   */
  it('keeps a body that only looks like json', async () => {
    const { readTranscript } = await import('./src/agent/media-library')
    expect(readTranscript('{не json, но слова')).toBe('{не json, но слова')
  })
})

/**
 * THE WORDS HAVE TO REACH THE MEMORY THE AGENT ACTUALLY READS.
 *
 * Owner, 2026-09-20: "study all my voice messages in the DMs and update the
 * Zep context, so the information is current." What stood in the way was one
 * asymmetry: `mirrorNow` posts to Zep only what was FRESH in Postgres.
 *
 * A voice note is written to crm_messages as `[голосовое]` the moment the
 * ingest sees it. The transcript arrives minutes later and is APPENDED to that
 * row -- fresh = 0 -- so Postgres held what was said and Zep, which is what
 * the agent reads before answering, held the word "[голосовое]". For every
 * voice message anybody ever sent.
 */
describe('a transcript that arrives late still reaches Zep', () => {
  const zepCalls: Array<{ lead: string; texts: string[] }> = []

  beforeEach(() => {
    zepCalls.length = 0
    vi.resetModules()
    vi.doMock('./src/agent/zep-memory', () => ({
      zepConfigured: () => true,
      zepEnsureUser: async () => undefined,
      zepEnsureThread: async () => undefined,
      zepAddMessages: async (
        _owner: string,
        lead: string,
        msgs: Array<{ text: string }>
      ) => {
        zepCalls.push({ lead, texts: msgs.map(m => m.text) })
        return msgs.length
      },
      zepContext: async () => null,
    }))
  })

  const rowOf = () => ({
    lead: LEAD,
    msgId: 77,
    at: new Date(),
    out: false,
    kind: 'audio' as const,
    name: 'voice.ogg',
    mime: 'audio/ogg',
    caption: null,
  })

  it('tells Zep the words when the row was already there', async () => {
    const { mirrorTranscript } = await import('./src/agent/media-library')
    const { forgetMemoryTableForTests } = await import(
      './src/agent/chat-memory'
    )
    forgetMemoryTableForTests()
    const pool = fakePool()
    const row = rowOf()

    // The ingest got there first: the row exists, saying only what it was.
    pool.crm.push({ msg_id: 77, text: '[голосовое]' }) // cyrillic-ok: fixture text

    expect(await mirrorTranscript(pool, OWNER, row, 'привет, это запись')).toBe(
      'appended'
    )
    expect(zepCalls).toHaveLength(1)
    expect(zepCalls[0].lead).toBe(LEAD)
    expect(zepCalls[0].texts[0]).toContain('привет, это запись') // cyrillic-ok: fixture text

    /*
     * AND ONLY ONCE. A re-read that changes nothing must say nothing: the
     * same sentence posted a dozen times is worse than silence, because a
     * summary built from repetitions reads them as emphasis.
     *
     * Asserted in THIS test rather than its own. A second test needed the
     * same three-line setup and did not get it: with `vi.resetModules` in
     * between, the freshly imported module no longer saw this mock, so it
     * reported "nothing was posted" about a call that had been made. One
     * test that makes both calls cannot lie that way.
     */
    expect(await mirrorTranscript(pool, OWNER, row, 'привет, это запись')).toBe(
      'appended'
    )
    expect(zepCalls).toHaveLength(1)
  })
})

/**
 * GIVING THE SERVER THE STREAM IT INSISTS ON.
 *
 * Three fixes and 25+ failures established that this transcriber ALWAYS enters
 * its streaming responder -- with response_format=text, with json, and with
 * `stream=false` said out loud -- and then refuses to serialise the plain
 * result it holds, answering 200 with an empty body:
 *
 *   Unexpected streaming transcription response type: <class 'tuple'>
 *   ...                                               <class '...Transcription'>
 *
 * The request shape was never the variable. So it is handed what it keeps
 * reaching for, and the plain request stays as a fallback because OpenAI's own
 * whisper-1 REFUSES `stream` and would otherwise break the day somebody points
 * this at OpenAI.
 */
describe('reading a streamed transcription', () => {
  it('joins the deltas a stream arrives in', async () => {
    const { readStreamedTranscript } = await import('./src/agent/media-library')
    expect(
      readStreamedTranscript(
        'data: {"delta":"привет, "}\ndata: {"delta":"это запись"}\ndata: [DONE]\n'
      )
    ).toBe('привет, это запись')
  })

  /*
   * A FINAL `text` WINS. Servers that send both mean the deltas as a preview
   * of it; concatenating both would say everything twice.
   */
  it('prefers the whole text when the stream also carries one', async () => {
    const { readStreamedTranscript } = await import('./src/agent/media-library')
    expect(
      readStreamedTranscript(
        'data: {"delta":"при"}\ndata: {"delta":"вет"}\n' +
          'data: {"text":"привет, это запись"}\ndata: [DONE]\n'
      )
    ).toBe('привет, это запись')
  })

  /*
   * THE SENTINEL IS NOT A WORD. `[DONE]`, keep-alive blanks and comments are
   * skipped: a sentinel pasted into somebody's transcript is worse than a
   * missing word, because it reads as something they said.
   */
  it('never puts the protocol into the transcript', async () => {
    const { readStreamedTranscript } = await import('./src/agent/media-library')
    const out = readStreamedTranscript(
      ': keep-alive\n\ndata: [DONE]\ndata: {"delta":"слово"}\n'
    )
    expect(out).toBe('слово')
    expect(out).not.toContain('DONE')
    expect(readStreamedTranscript('data: [DONE]\n')).toBe('')
    expect(readStreamedTranscript('')).toBe('')
  })

  /*
   * A HALF-WRITTEN EVENT IS NOT WORDS. A stream cut mid-line must lose that
   * line, not the whole recording.
   */
  it('keeps what arrived when the stream was cut', async () => {
    const { readStreamedTranscript } = await import('./src/agent/media-library')
    expect(
      readStreamedTranscript('data: {"delta":"начало"}\ndata: {"delta":"обо')
    ).toBe('начало')
  })
})

/**
 * A GATE BUILT FOR ONE CONSUMER, APPLIED TO ANOTHER.
 *
 * `usableMediaUrl(url, 'audio')` exists for the provider path, where a file is
 * handed to a chat model as an `audio_url` part -- and there the short list is
 * right, because a model sent a container it cannot open answers confidently
 * about nothing.
 *
 * A transcriber is not a chat model: speaches, faster-whisper and OpenAI feed
 * the bytes through ffmpeg. Measured 2026-09-20: two recordings sat unread for
 * a day because they are `.mp4`, and the only log line said "not readable as
 * audio". `.oga` matters for a plainer reason -- it is what Telegram calls a
 * voice note on some paths, which is exactly the thing this feature is for.
 */
const SHELF_ORIGIN = 'https://vibee-render-production.up.railway.app'

describe('what may be handed to a transcriber', () => {
  it('takes every container ffmpeg opens, not just the four a chat model takes', async () => {
    const { transcribableUrl } = await import('./src/agent/media-library')
    for (const ext of [
      'ogg',
      'oga',
      'opus',
      'mp3',
      'wav',
      'm4a',
      'mp4',
      'webm',
      'flac',
    ]) {
      expect(
        transcribableUrl(`${SHELF_ORIGIN}/s3/assets/recording.${ext}`),
        `a transcriber can open .${ext} and this refused it`
      ).toBeTruthy()
    }
  })

  /*
   * TELEGRAM'S OWN NAME FOR A VOICE NOTE. Dropping `.oga` drops the thing the
   * whole feature exists for, and it did.
   */
  it('takes .oga, which is what a Telegram voice note is called', async () => {
    const { transcribableUrl } = await import('./src/agent/media-library')
    expect(
      transcribableUrl(`${SHELF_ORIGIN}/s3/assets/voice-1.oga`)
    ).toBeTruthy()
  })

  /*
   * AND IT IS STILL OUR SHELF ONLY. Widening what may be READ must never
   * widen WHERE it may be read from: a URL the person supplies is how a
   * server gets aimed at somebody else's network.
   */
  it('still refuses anything that is not on our own shelf', async () => {
    const { transcribableUrl } = await import('./src/agent/media-library')
    expect(transcribableUrl('https://evil.example/s3/assets/a.ogg')).toBeNull()
    expect(
      transcribableUrl('http://169.254.169.254/latest/meta-data.ogg')
    ).toBeNull()
    expect(transcribableUrl(`${SHELF_ORIGIN}/not-s3/a.ogg`)).toBeNull()
    expect(transcribableUrl(`${SHELF_ORIGIN}/s3/assets/notes.txt`)).toBeNull()
  })
})
