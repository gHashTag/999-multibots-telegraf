/**
 * THE TALKING HEAD, TESTED WHERE THE MONEY IS.
 *
 * Nothing here reaches a network. `fetch` is replaced wholesale and the pool is
 * a small in-memory table, so every one of these runs for 0.00 credits — which
 * matters more than usual, because the thing under test costs about 26 credits
 * per second of output and a suite that exercised it for real would bill the
 * owner on every CI run.
 *
 * THE DOUBLES ARE AS DUMB AS THE REAL THING, and two of them are deliberately
 * dumber-than-permissive:
 *
 *   - the Kie double answers `recordInfo` in the shape recordInfo actually
 *     uses: `resultJson` as a JSON STRING, never a ready-made array. A double
 *     that returned the convenient shape would hide the parse;
 *   - in the ceiling tests the double COUNTS every request to omnihuman and
 *     then throws. An assertion about the refusal message would pass even if
 *     the expensive call had already gone out, so the first assertion in those
 *     tests is `faceCalls === 0`.
 *
 * WHY A COUNT AND NOT JUST A THROW, measured rather than reasoned: the first
 * mutation run of this file raised the ceiling above the fixture, the tool duly
 * called omnihuman, the double threw — and `kieCall` caught it, turned it into
 * an ordinary `input-refused`, and the test failed on a stage mismatch instead
 * of on the money. A throw the code under test is allowed to swallow is not a
 * tripwire. The count cannot be swallowed.
 *
 * WHAT EACH TEST WOULD LOOK LIKE IF THE CODE WERE WRONG is recorded beside it,
 * because a check nobody has seen go red is a check nobody should trust. The
 * load-bearing ones were each broken once against a /tmp copy of the source,
 * confirmed red, and restored.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  readWavSeconds,
  priceOfSeconds,
  priceDrift,
  CREDITS_PER_SECOND,
  DEFAULT_MAX_SECONDS,
  HARD_MAX_SECONDS,
  MAX_CHARS_PER_SECOND,
} from './src/kie-face'
import { TOOLS_BY_NAME, faceSpeakTokens } from './src/agent/tools'
import { модельПоId } from './src/agent/kie-run'

/* ------------------------------------------------------------- wav fixture */

/**
 * A real RIFF/WAVE file of a chosen length. 24000 Hz, 16-bit, mono — the exact
 * shape Kie's TTS returns, so the reader is exercised on the format it will
 * meet rather than on a convenient one.
 */
function wav(
  seconds: number,
  o: { sampleRate?: number; bits?: number; channels?: number; extraChunk?: boolean } = {}
): Uint8Array {
  const sampleRate = o.sampleRate ?? 24000
  const bits = o.bits ?? 16
  const channels = o.channels ?? 1
  const byteRate = (sampleRate * bits * channels) / 8
  const dataSize = Math.round(byteRate * seconds)
  // An optional odd-length LIST chunk between `fmt ` and `data`: real encoders
  // emit these, and a reader that assumes the canonical 44-byte layout — or
  // forgets the pad byte after an odd chunk — desynchronises on the next one.
  const extra = o.extraChunk ? 8 + 5 + 1 : 0
  const out = Buffer.alloc(44 + extra + dataSize)
  let p = 0
  out.write('RIFF', p); p += 4
  out.writeUInt32LE(36 + extra + dataSize, p); p += 4
  out.write('WAVE', p); p += 4
  out.write('fmt ', p); p += 4
  out.writeUInt32LE(16, p); p += 4
  out.writeUInt16LE(1, p); p += 2
  out.writeUInt16LE(channels, p); p += 2
  out.writeUInt32LE(sampleRate, p); p += 4
  out.writeUInt32LE(byteRate, p); p += 4
  out.writeUInt16LE((bits * channels) / 8, p); p += 2
  out.writeUInt16LE(bits, p); p += 2
  if (o.extraChunk) {
    out.write('LIST', p); p += 4
    out.writeUInt32LE(5, p); p += 4
    out.write('INFO\0', p); p += 5
    out.writeUInt8(0, p); p += 1 // pad byte, not counted in the chunk size
  }
  out.write('data', p); p += 4
  out.writeUInt32LE(dataSize, p); p += 4
  return new Uint8Array(out)
}

describe('длительность речи читается из файла, без ffmpeg', () => {
  it('канонический 44-байтный заголовок', () => {
    expect(readWavSeconds(wav(7.4))).toBeCloseTo(7.4, 6)
  })

  it('чужой чанк между fmt и data не сбивает счёт', () => {
    expect(readWavSeconds(wav(2, { extraChunk: true }))).toBeCloseTo(2, 6)
  })

  it('другая частота и разрядность считаются по byteRate, а не по догадке', () => {
    expect(
      readWavSeconds(wav(3.5, { sampleRate: 44100, bits: 8, channels: 2 }))
    ).toBeCloseTo(3.5, 6)
  })

  it('ОБРЕЗАННЫЙ файл — отказ, а не более короткий ролик', () => {
    /**
     * The direction matters. Measuring the bytes that arrived would report a
     * SHORTER clip, sail under the ceiling, and then be billed for the full
     * length the provider re-fetches from the URL. Over-reporting is safe;
     * under-reporting is the one direction that spends money.
     */
    const full = wav(9)
    expect(readWavSeconds(full.slice(0, full.length - 1000))).toBeNull()
  })

  it('не WAV — отказ', () => {
    expect(readWavSeconds(new Uint8Array([1, 2, 3]))).toBeNull()
    expect(readWavSeconds(new Uint8Array(Buffer.from('RIFFxxxxAVI ')))).toBeNull()
  })
})

describe('цена выводится из секунд, а не назначается', () => {
  it('кредиты провайдера = секунды x измеренная ставка', () => {
    expect(priceOfSeconds(2)).toBe(2 * CREDITS_PER_SECOND)
    expect(priceOfSeconds(8)).toBe(8 * CREDITS_PER_SECOND)
  })

  it('токены человека растут вместе с секундами', () => {
    expect(faceSpeakTokens(2)).toBeLessThan(faceSpeakTokens(8))
    expect(faceSpeakTokens(2)).toBeGreaterThan(0)
  })

  it('расхождение с реальным счётом называется вслух', () => {
    expect(priceDrift(2, 2 * CREDITS_PER_SECOND)).toBeUndefined()
    // If omnihuman ever prices by resolution the way veed/fabric-1 does, every
    // ceiling in this module is wrong while every test stays green. This is the
    // one thing that would say so.
    expect(priceDrift(2, 200)).toMatch(/кредитов за секунду/)
  })
})

describe('реестр знает контракт самой дорогой модели', () => {
  it('omnihuman-1-5 требует image_url и audio_url', () => {
    /**
     * THIS TEST FAILED WHEN IT WAS WRITTEN, and that is the point. The registry
     * said `needs: []` because all three free probes answer the identical
     * opaque "This field is required"; чегоНеХватает filters an empty list,
     * returns null, and waves ANY payload through to a 26-credit-per-second
     * call. The guard shipped under the words "check every provider function
     * before a single credit is spent" was inert on exactly this model.
     */
    const m = модельПоId('omnihuman-1-5')!
    expect(m.needs).toContain('image_url')
    expect(m.needs).toContain('audio_url')
    // `prompt` is NOT required — measured, and inventing a requirement would
    // refuse calls the provider would have accepted.
    expect(m.needs).not.toContain('prompt')
  })
})

/* --------------------------------------------------------- the fake service */

const TID = '5550001'
const KIE = 'https://api.kie.ai/api/v1'
const SELF = 'http://self.invalid'

/** Every query the tools issue, in order, so an ordering claim is a fact. */
interface FakeDb {
  sql: string[]
  balance: number
  faceJobs: any[]
  assets: any[]
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>
}

function fakeDb(startBalance = 1000): FakeDb {
  const db: FakeDb = {
    sql: [],
    balance: startBalance,
    faceJobs: [],
    assets: [],
    query: async (sql: string, params: unknown[] = []) => {
      db.sql.push(sql.replace(/\s+/g, ' ').trim())
      const s = sql.replace(/\s+/g, ' ')
      if (/^\s*CREATE (TABLE|INDEX)/i.test(s)) return { rows: [] }
      if (/^\s*ALTER TABLE/i.test(s)) return { rows: [] }
      if (/COUNT\(\*\)::int AS n FROM assets/.test(s)) return { rows: [{ n: 0 }] }
      if (/INSERT INTO user_tokens/.test(s))
        return { rows: [{ balance: db.balance }] }
      if (/UPDATE user_tokens SET balance = balance - /.test(s)) {
        const amount = Number(params[1])
        if (db.balance < amount) return { rows: [] }
        db.balance -= amount
        return { rows: [{ balance: db.balance }] }
      }
      if (/UPDATE user_tokens SET balance = balance \+ /.test(s)) {
        db.balance += Number(params[1])
        return { rows: [] }
      }
      if (/SUM\(planned_credits\)/.test(s)) {
        const credits = db.faceJobs
          .filter(j => j.state !== 'refused')
          .reduce((a, j) => a + Number(j.planned_credits || 0), 0)
        return { rows: [{ credits }] }
      }
      if (/INSERT INTO agent_face_jobs/.test(s)) {
        db.faceJobs.push({
          id: params[0],
          telegram_id: params[1],
          state: 'intent',
          seconds: params[2],
          planned_credits: params[3],
          audio_url: params[4],
          image_url: params[5],
          text: params[6],
          task_id: null,
        })
        return { rows: [] }
      }
      if (/UPDATE agent_face_jobs/.test(s)) {
        const row = db.faceJobs.find(j => j.id === params[0])
        if (row) {
          if (/task_id = \$2/.test(s)) {
            row.task_id = params[1]
            row.state = 'running'
          } else if (/state = 'delivered'/.test(s)) {
            row.state = 'delivered'
            row.video_url = params[1]
            row.asset_id = params[2]
            row.charged_tokens = params[3]
            row.reason = params[4]
          } else if (/SET state = \$2/.test(s)) {
            row.state = params[1]
            row.reason = params[2]
          } else {
            row.state = /state = '(\w+)'/.exec(s)?.[1] ?? row.state
            row.reason = params[1]
          }
        }
        return { rows: [] }
      }
      if (/SELECT \* FROM agent_face_jobs WHERE task_id/.test(s)) {
        return {
          rows: db.faceJobs.filter(
            j => j.task_id === params[0] && j.telegram_id === params[1]
          ),
        }
      }
      if (/SELECT \* FROM agent_face_jobs/.test(s)) {
        return {
          rows: db.faceJobs
            .filter(
              j =>
                j.telegram_id === params[0] &&
                (j.state === 'intent' || j.state === 'running')
            )
            .slice(-1),
        }
      }
      if (/INSERT INTO assets/.test(s)) {
        db.assets.push({ type: params[0], telegram_id: params[1], url: params[2] })
        return { rows: [{ id: 900 + db.assets.length }] }
      }
      throw new Error(`фейковая база не знает запроса: ${s.slice(0, 90)}`)
    },
  }
  return db
}

interface FakeNet {
  calls: string[]
  /**
   * How many times omnihuman was ASKED, counted before the double reacts.
   *
   * A double that merely throws is not enough on its own: kieCall wraps every
   * request in try/catch and turns a thrown error into an ordinary
   * `input-refused` outcome, so "the expensive call went out" would arrive
   * disguised as a refusal. Measured — the first mutation run of this file
   * showed exactly that. The count is a recorded fact nothing can swallow.
   */
  faceCalls: number
  /** Runs on every request to a Kie createTask for omnihuman. */
  onFace: (input: any) => { taskId?: string; refusal?: string }
  faceState: 'success' | 'fail' | 'running'
  faceCredits: number
  ttsSeconds: number
  balance: number
}

function reply(body: unknown, status = 200): Response {
  return {
    ok: status < 400,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
    arrayBuffer: async () => new ArrayBuffer(0),
    headers: new Headers(),
  } as unknown as Response
}

function bytesReply(bytes: Uint8Array, contentType: string): Response {
  return {
    ok: true,
    status: 200,
    text: async () => '',
    json: async () => null,
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    headers: new Headers({ 'content-type': contentType }),
  } as unknown as Response
}

/**
 * The service as the tools see it: Kie, our own /upload, and the TTS file.
 * Every branch is explicit; an unknown URL throws rather than returning a
 * plausible empty answer, because a double that shrugs turns a wiring mistake
 * into a passing test.
 */
function fakeNet(o: Partial<FakeNet> = {}): FakeNet & { fetch: any } {
  const net: FakeNet = {
    calls: [],
    faceCalls: 0,
    onFace: () => ({ taskId: 'FACE-1' }),
    faceState: 'success',
    faceCredits: 52,
    ttsSeconds: 2,
    balance: 6000,
    ...o,
  } as FakeNet
  const f = vi.fn(async (url: any, init: any = {}) => {
    const u = String(url)
    net.calls.push(`${init?.method || 'GET'} ${u}`)
    if (u.startsWith(`${KIE}/chat/credit`))
      return reply({ code: 200, data: net.balance })
    if (u.startsWith(`${KIE}/jobs/createTask`)) {
      const body = JSON.parse(String(init.body))
      if (body.model === 'google/gemini-3-1-flash-tts')
        return reply({ code: 200, data: { taskId: 'TTS-1' } })
      net.faceCalls += 1
      const r = net.onFace(body.input)
      return r.taskId
        ? reply({ code: 200, data: { taskId: r.taskId } })
        : reply({ code: 500, msg: r.refusal })
    }
    if (u.startsWith(`${KIE}/jobs/recordInfo`)) {
      const id = new URL(u).searchParams.get('taskId')
      if (id === 'TTS-1')
        return reply({
          code: 200,
          data: {
            state: 'success',
            creditsConsumed: 1.04,
            resultJson: '{"resultUrls":["https://kie.invalid/tts.wav"]}',
          },
        })
      if (net.faceState === 'running') return reply({ code: 200, data: { state: 'waiting' } })
      if (net.faceState === 'fail')
        return reply({
          code: 200,
          data: { state: 'fail', failMsg: 'internal error', creditsConsumed: 0 },
        })
      return reply({
        code: 200,
        data: {
          state: 'success',
          creditsConsumed: net.faceCredits,
          resultJson: '{"resultUrls":["https://kie.invalid/face.mp4"]}',
        },
      })
    }
    if (u === 'https://kie.invalid/tts.wav')
      return bytesReply(wav(net.ttsSeconds), 'audio/wav')
    if (u === 'https://kie.invalid/face.mp4')
      return bytesReply(new Uint8Array([0, 1, 2, 3]), 'video/mp4')
    if (u === `${SELF}/upload`) {
      const name = String(init?.headers?.get?.('X-Filename') || 'f')
      return reply({ success: true, directUrl: `${SELF}/s3/${name}` })
    }
    throw new Error(`фейковая сеть не знает адреса: ${u}`)
  })
  return Object.assign(net, { fetch: f })
}

const face = () => TOOLS_BY_NAME.get('face_speak')!
const status = () => TOOLS_BY_NAME.get('face_speak_status')!

beforeEach(() => {
  process.env.KIE_AI_API_KEY = 'test-key-not-a-secret' // secret-guard-ok: literal placeholder, no provider accepts it
  process.env.SELF_URL = SELF
  // The shipped poll interval is four seconds; waiting it out here would buy
  // nothing but wall-clock. The path under test is unchanged.
  process.env.KIE_POLL_MS = '1'
  delete process.env.RENDER_API_KEY
})
afterEach(() => vi.unstubAllGlobals())

/* ------------------------------------------------------------- the ceiling */

describe('ПОТОЛОК: дорогой вызов недостижим, а не маловероятен', () => {
  it('речь длиннее потолка — omnihuman не трогают вовсе', async () => {
    const db = fakeDb()
    const net = fakeNet({
      ttsSeconds: DEFAULT_MAX_SECONDS + 0.001,
      onFace: () => {
        // NOT an assertion about a message: the double refuses to exist for
        // this test. If the tool reaches the provider at all, the run dies.
        throw new Error('omnihuman вызван, хотя потолок должен был отказать')
      },
    })
    vi.stubGlobal('fetch', net.fetch)

    const r: any = await face().handler(
      { text: 'a'.repeat(100), image_url: 'https://x.invalid/p.jpg' },
      { telegramId: TID, pool: db } as any
    )

    // THE MONEY ASSERTION COMES FIRST, and it is a count rather than a message:
    // omnihuman was asked exactly zero times.
    expect(net.faceCalls).toBe(0)
    expect(r.done).toBe(false)
    expect(r.stage).toBe('over-ceiling')
    // The numbers are QUOTED, not summarised: "too long" teaches the caller
    // nothing about how much to cut.
    // Rounded UP: 8.001 printed as "8.00 с при потолке 8 с" reads like a bug
    // and invites the caller to resend the identical text.
    expect(r.reason).toMatch(/8\.01 с/)
    expect(r.reason).toMatch(new RegExp(`${DEFAULT_MAX_SECONDS} с`))
    expect(r.reason).toMatch(/символов/)
    expect(r.seconds).toBeCloseTo(DEFAULT_MAX_SECONDS + 0.001, 2)
    expect(r.wouldCostCredits).toBe(priceOfSeconds(DEFAULT_MAX_SECONDS + 0.001))
    // Nothing was taken from the person. About one credit went on the TTS that
    // produced the measurement, and it is named rather than hidden.
    expect(r.charged).toBe(0)
    expect(db.balance).toBe(1000)
    expect(r.providerCreditsSpent).toBeGreaterThan(0)
    // And the money assertion as a recorded fact rather than an absence: no
    // omnihuman request appears in the call log at all.
    expect(net.calls.filter(c => /createTask/.test(c))).toHaveLength(1)
  })

  it('аргумент выше жёсткого максимума не поднимает потолок', async () => {
    const db = fakeDb()
    const net = fakeNet({
      ttsSeconds: HARD_MAX_SECONDS + 0.5,
      onFace: () => {
        throw new Error('omnihuman вызван поверх жёсткого максимума')
      },
    })
    vi.stubGlobal('fetch', net.fetch)
    const r: any = await face().handler(
      { text: 'a'.repeat(200), image_url: 'https://x.invalid/p.jpg', max_seconds: 60 },
      { telegramId: TID, pool: db } as any
    )
    expect(net.faceCalls).toBe(0)
    expect(r.done).toBe(false)
    expect(r.stage).toBe('over-ceiling')
    expect(r.reason).toMatch(new RegExp(`${HARD_MAX_SECONDS} с`))
  })

  it('очевидно длинный текст отказан ДО озвучки — ноль кредитов', async () => {
    const db = fakeDb()
    const net = fakeNet({
      onFace: () => {
        throw new Error('omnihuman вызван на заведомо длинном тексте')
      },
    })
    vi.stubGlobal('fetch', net.fetch)
    const r: any = await face().handler(
      {
        text: 'э'.repeat(HARD_MAX_SECONDS * MAX_CHARS_PER_SECOND + 1),
        image_url: 'https://x.invalid/p.jpg',
        max_seconds: HARD_MAX_SECONDS,
      },
      { telegramId: TID, pool: db } as any
    )
    expect(net.faceCalls).toBe(0)
    expect(r.done).toBe(false)
    expect(r.providerCreditsSpent).toBe(0)
    expect(net.calls.filter(c => /createTask/.test(c))).toHaveLength(0)
  })
})

/* -------------------------------------------------------------- the charge */

describe('СНАЧАЛА ПРОВАЙДЕР, ПОТОМ ДЕНЬГИ', () => {
  it('провайдер отказал — баланс не двинулся и возврат не понадобился', async () => {
    const db = fakeDb(1000)
    const net = fakeNet({ ttsSeconds: 2, faceState: 'fail' })
    vi.stubGlobal('fetch', net.fetch)

    const r: any = await face().handler(
      { text: 'привет', image_url: 'https://x.invalid/p.jpg' },
      { telegramId: TID, pool: db } as any
    )

    expect(r.done).toBe(false)
    expect(r.stage).toBe('provider-failed')
    // Byte-identical, not "roughly the same": a charge followed by a refund
    // would end here too, and the two are not the same thing. A refund is a
    // promise; not charging is a fact.
    expect(db.balance).toBe(1000)
    expect(db.sql.filter(q => /balance = balance \+/.test(q))).toEqual([])
    expect(db.sql.filter(q => /balance = balance - /.test(q))).toEqual([])
  })

  it('провайдер выдал — списано ровно по измеренным секундам, и ПОСЛЕ выдачи', async () => {
    const db = fakeDb(1000)
    const net = fakeNet({ ttsSeconds: 2 })
    vi.stubGlobal('fetch', net.fetch)

    const r: any = await face().handler(
      { text: 'привет', image_url: 'https://x.invalid/p.jpg' },
      { telegramId: TID, pool: db } as any
    )

    expect(r.done).toBe(true)
    expect(r.charged).toBe(faceSpeakTokens(2))
    expect(db.balance).toBe(1000 - faceSpeakTokens(2))
    // ORDER, read off the recorded queries: the debit is issued after the row
    // that proves the file exists.
    const debit = db.sql.findIndex(q => /balance = balance - /.test(q))
    const insert = db.sql.findIndex(q => /INSERT INTO assets/.test(q))
    expect(insert).toBeGreaterThanOrEqual(0)
    expect(debit).toBeGreaterThan(insert)
  })

  it('файл попадает в витрину, а не только в бакет', async () => {
    const db = fakeDb(1000)
    vi.stubGlobal('fetch', fakeNet({ ttsSeconds: 2 }).fetch)
    const r: any = await face().handler(
      { text: 'привет', image_url: 'https://x.invalid/p.jpg' },
      { telegramId: TID, pool: db } as any
    )
    expect(r.inGallery).toBe(true)
    expect(db.assets).toHaveLength(1)
    expect(db.assets[0].type).toBe('generated_video')
    // OUR copy, never the provider's link: a Kie URL dies within the hour and
    // the gallery would show a broken video tomorrow.
    expect(db.assets[0].url).toContain(SELF)
    expect(r.url).toContain(SELF)
  })

  it('пустой кошелёк отказывает до озвучки — ни кредита, ни токена', async () => {
    const db = fakeDb(1)
    const net = fakeNet({
      onFace: () => {
        throw new Error('omnihuman вызван при пустом кошельке')
      },
    })
    vi.stubGlobal('fetch', net.fetch)
    const r: any = await face().handler(
      { text: 'привет', image_url: 'https://x.invalid/p.jpg' },
      { telegramId: TID, pool: db } as any
    )
    expect(net.faceCalls).toBe(0)
    expect(r.done).toBe(false)
    expect(db.balance).toBe(1)
    expect(net.calls.filter(c => /createTask/.test(c))).toHaveLength(0)
  })

  it('нет портрета — честный отказ, а не чужое лицо', async () => {
    const db = fakeDb()
    const net = fakeNet({
      onFace: () => {
        throw new Error('omnihuman вызван без портрета')
      },
    })
    // ownerAvatarUrl returns '' when Telegram has no photo for this person.
    net.fetch.mockImplementation(async (u: any) => {
      if (String(u).includes('api.telegram.org'))
        return reply({ ok: true, result: { photos: [] } })
      throw new Error(`не должно было вызываться: ${u}`)
    })
    vi.stubGlobal('fetch', net.fetch)
    process.env.TELEGRAM_BOT_TOKEN = 'x:y' // secret-guard-ok: placeholder, not a token
    const r: any = await face().handler(
      { text: 'привет' },
      { telegramId: TID, pool: db } as any
    )
    delete process.env.TELEGRAM_BOT_TOKEN
    expect(r.done).toBe(false)
    expect(r.reason).toMatch(/аватарка/)
  })
})

/* ------------------------------------------------------------ the long job */

describe('долгая работа: id переживает ответ', () => {
  it('wait:false отдаёт taskId и оставляет ДОЛГОВЕЧНУЮ строку', async () => {
    const db = fakeDb(1000)
    const net = fakeNet({ ttsSeconds: 2, faceState: 'running' })
    vi.stubGlobal('fetch', net.fetch)

    const r: any = await face().handler(
      { text: 'привет', image_url: 'https://x.invalid/p.jpg', wait: false },
      { telegramId: TID, pool: db } as any
    )

    expect(r.started).toBe(true)
    expect(r.taskId).toBe('FACE-1')
    expect(db.balance).toBe(1000) // nothing charged for an unfinished job
    const row = db.faceJobs[0]
    expect(row.task_id).toBe('FACE-1')
    expect(Number(row.planned_credits)).toBe(priceOfSeconds(2))
    expect(row.audio_url).toContain('.wav')
  })

  it('строка пишется ДО createTask, поэтому отказ провайдера тоже учтён', async () => {
    const db = fakeDb(1000)
    const net = fakeNet({
      ttsSeconds: 2,
      onFace: () => ({ refusal: 'File type not supported' }),
    })
    vi.stubGlobal('fetch', net.fetch)
    const r: any = await face().handler(
      { text: 'привет', image_url: 'https://x.invalid/p.jpg' },
      { telegramId: TID, pool: db } as any
    )
    expect(r.done).toBe(false)
    expect(r.reason).toMatch(/File type not supported/)
    // The intent exists even though the provider never took the job: a ceiling
    // that sums intents cannot be walked around by failing on purpose.
    expect(db.faceJobs).toHaveLength(1)
    expect(db.faceJobs[0].state).toBe('refused')
    expect(db.balance).toBe(1000)
  })

  it('status ведётся ТОЛЬКО от строки: ни памяти, ни аргументов от вызывающего', async () => {
    const db = fakeDb(1000)
    const net = fakeNet({ ttsSeconds: 2, faceState: 'running' })
    vi.stubGlobal('fetch', net.fetch)
    await face().handler(
      { text: 'привет', image_url: 'https://x.invalid/p.jpg', wait: false },
      { telegramId: TID, pool: db } as any
    )

    // Still working: not a failure, and the difference is the whole point.
    const pending: any = await status().handler({}, { telegramId: TID, pool: db } as any)
    expect(pending.done).toBe(false)
    expect(pending.state).toBe('running')
    expect(db.balance).toBe(1000)

    // Now it finishes. The recovery path — not the call that started the job —
    // delivers the file, registers it and takes the money.
    net.faceState = 'success'
    const done: any = await status().handler({}, { telegramId: TID, pool: db } as any)
    expect(done.done).toBe(true)
    expect(done.inGallery).toBe(true)
    expect(db.assets).toHaveLength(1)
    expect(db.balance).toBe(1000 - faceSpeakTokens(2))

    // And it settles ONCE. A second look must not sell the same clip twice.
    const again: any = await status().handler(
      { taskId: 'FACE-1' },
      { telegramId: TID, pool: db } as any
    )
    expect(again.done).toBe(true)
    expect(db.balance).toBe(1000 - faceSpeakTokens(2))
    expect(db.assets).toHaveLength(1)
  })

  it('чужой taskId не находится: расчёт шёл бы по чужому кошельку', async () => {
    const db = fakeDb(1000)
    const net = fakeNet({ ttsSeconds: 2, faceState: 'running' })
    vi.stubGlobal('fetch', net.fetch)
    await face().handler(
      { text: 'привет', image_url: 'https://x.invalid/p.jpg', wait: false },
      { telegramId: TID, pool: db } as any
    )
    const r: any = await status().handler(
      { taskId: 'FACE-1' },
      { telegramId: '7770002', pool: db } as any
    )
    expect(r.found).toBe(false)
  })
})
