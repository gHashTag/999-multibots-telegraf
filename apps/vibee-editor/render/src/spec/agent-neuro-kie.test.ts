/**
 * Spec agent-neuro-kie.t27 (gHashTag/t27#8090), every test block run against
 * the compiled logic the host calls, then the tools themselves (#3924): the
 * source tools ARE the rows of the spec's table, a source tool without a
 * source charges nothing, every Kie order is charged the app's own price, and
 * a picture given to video_generate makes the clip on the spec's model.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as SPEC from './agent-neuro-kie.gen'
import {
  editUsesGpt25,
  musicKeepsWaiting,
  mayOrderImage,
  sourceOk,
  speechUnits,
  ttsModelApplies,
  ttsNamedOk,
  videoRoute,
} from './agent-neuro-kie.logic'
import { priceForModel, TOKEN_PRICES } from '../agent/billing-shared'
import { SOURCE_TOOLS, kieImageOrder } from '../agent/agent-neuro'

describe('spec agent-neuro-kie.t27', () => {
  it('a Kie picture model is ordered only with its bill named first', () => {
    expect(mayOrderImage(true, true)).toBe(true)
    expect(mayOrderImage(false, true)).toBe(false)
    expect(mayOrderImage(true, false)).toBe(false)
  })

  it('a source tool without a source is refused, a tool without one needs none', () => {
    expect(sourceOk(true, true)).toBe(true)
    expect(sourceOk(true, false)).toBe(false)
    expect(sourceOk(false, false)).toBe(true)
    expect(sourceOk(false, true)).toBe(true)
  })

  it('a picture given makes the clip from the picture', () => {
    expect(SPEC.VIDEO_FROM_WORDS).toBe(0)
    expect(SPEC.VIDEO_FROM_IMAGE).toBe(1)
    expect(videoRoute(true)).toBe(SPEC.VIDEO_FROM_IMAGE)
    expect(videoRoute(false)).toBe(SPEC.VIDEO_FROM_WORDS)
  })

  it('a picture from a photo is GPT Image 2.5 unless another model is named', () => {
    expect(SPEC.EDIT_DEFAULT_IS_GPT25).toBe(true)
    expect(editUsesGpt25(false, false)).toBe(true)
    expect(editUsesGpt25(true, false)).toBe(true)
    expect(editUsesGpt25(false, true)).toBe(false)
    expect(SPEC.EDIT_DEFAULT_ASPECT).toBe('9:16')
  })

  it('a song is waited for a bounded time, then it is still writing', () => {
    expect(SPEC.MUSIC_WAIT_SECONDS).toBe(120)
    expect(SPEC.MUSIC_COST_MICRO_USD).toBe(60000)
    expect(musicKeepsWaiting(0, false)).toBe(true)
    expect(musicKeepsWaiting(119, false)).toBe(true)
    expect(musicKeepsWaiting(120, false)).toBe(false)
    expect(musicKeepsWaiting(10, true)).toBe(false)
  })

  it('a Kie voice model is a row, and a clone takes none', () => {
    expect(ttsNamedOk(false, false)).toBe(true)
    expect(ttsNamedOk(true, true)).toBe(true)
    expect(ttsNamedOk(true, false)).toBe(false)
    expect(ttsModelApplies(false)).toBe(true)
    expect(ttsModelApplies(true)).toBe(false)
    expect(SPEC.TTS_MODELS[0]).toBe(SPEC.TTS_DEFAULT_MODEL)
  })

  it('speech is charged per started thousand characters', () => {
    expect(SPEC.SPEECH_UNIT_CHARS).toBe(1000)
    expect(SPEC.SPEECH_MAX_UNITS).toBe(3600)
    for (const [chars, units] of [
      [0, 1],
      [1, 1],
      [1000, 1],
      [1001, 2],
      [2000, 2],
      [20000, 20],
      [3600000, 3600],
      [3600001, 3600],
      [4000000000, 3600],
    ])
      expect(speechUnits(chars), String(chars)).toBe(units)
  })

  it("VERSION says what the header's last note says", () => {
    expect(SPEC.VERSION).toBe(2)
  })
})

/** A wallet that answers the ledger's statements by reading them. */
function wallet(start: number) {
  let balance = start
  const debits: number[] = []
  const credits: number[] = []
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      const q = sql.replace(/\s+/g, ' ')
      if (/SELECT balance FROM user_tokens/i.test(q))
        return { rows: [{ balance }] }
      if (/SET balance = balance - \$2/i.test(q)) {
        const amount = Number(params[1])
        if (/balance >= \$2/i.test(q) && balance < amount) return { rows: [] }
        balance -= amount
        debits.push(amount)
        return { rows: [{ balance }] }
      }
      if (/SET balance = balance \+ \$2/i.test(q)) {
        balance += Number(params[1])
        credits.push(Number(params[1]))
        return { rows: [{ balance }] }
      }
      if (/INSERT INTO token_ledger/i.test(q)) return { rows: [{ id: 1 }] }
      return { rows: [] }
    },
  }
  return { pool, debits, credits }
}

const BUYER = '900000777'
const SRC = 'https://vibee-render-production.up.railway.app/s3/assets/a.png'

describe('the source tools are the rows of the table (#3924)', () => {
  let calls: { url: string; body: any }[]
  beforeEach(() => {
    calls = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown, init?: { body?: unknown }) => {
        calls.push({
          url: String(url),
          body: JSON.parse(String(init?.body ?? 'null')),
        })
        return {
          ok: false,
          status: 503,
          json: async () => ({ error: 'down' }),
          text: async () => 'down',
        }
      })
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  const tool = async (name: string) => {
    const { TOOLS } = await import('../agent/tools')
    const t = TOOLS.find(x => x.name === name)
    if (!t) throw new Error(`no tool ${name}`)
    return t
  }

  it('every row of the table is a tool, told what the row says', async () => {
    expect(SOURCE_TOOLS.map(r => r.name)).toEqual([...SPEC.SOURCE_TOOL_NAMES])
    for (const [i, name] of SPEC.SOURCE_TOOL_NAMES.entries()) {
      const t = await tool(name)
      expect(t.description).toBe(SPEC.SOURCE_TOOL_HELP[i])
      expect(
        priceForModel('image_generate', SPEC.SOURCE_TOOL_MODELS[i])
      ).toBeGreaterThan(0)
    }
  })

  it('without a source: refused, nothing charged, nothing asked', async () => {
    const w = wallet(500)
    const r: any = await (
      await tool('image_upscale')
    ).handler({ image_url: '' }, { telegramId: BUYER, pool: w.pool } as never)
    expect(r[Object.keys(r)[0]]).toBe(false)
    expect(w.debits).toEqual([])
    expect(calls).toEqual([])
  })

  it("with a source: the row's model, charged the app's price, refunded when Kie fails", async () => {
    for (const [i, name] of SPEC.SOURCE_TOOL_NAMES.entries()) {
      calls = []
      const w = wallet(500)
      await (
        await tool(name)
      ).handler({ image_url: SRC }, {
        telegramId: BUYER,
        pool: w.pool,
      } as never)
      const model = SPEC.SOURCE_TOOL_MODELS[i]
      expect(w.debits, name).toEqual([priceForModel('image_generate', model)])
      expect(w.credits, name).toEqual(w.debits)
      const asked = calls.find(c => c.url.endsWith('/api/generate/image'))!
      expect(asked.body).toMatchObject({ model, image_url: SRC })
    }
  })

  it('image_generate takes a Kie model by name at that model’s price', async () => {
    const w = wallet(500)
    await (
      await tool('image_generate')
    ).handler({ prompt: 'a cow in a meadow', model: 'kie/google/imagen4' }, {
      telegramId: BUYER,
      pool: w.pool,
    } as never)
    expect(w.debits).toEqual([
      priceForModel('image_generate', 'kie/google/imagen4'),
    ])
    const asked = calls.find(c => c.url.endsWith('/api/generate/image'))!
    expect(asked.body.model).toBe('kie/google/imagen4')
  })

  it('a Kie name with spaces around it reaches the route as the model', async () => {
    const w = wallet(500)
    await (
      await tool('image_generate')
    ).handler({ prompt: 'a cow', model: '  kie/google/imagen4 ' }, {
      telegramId: BUYER,
      pool: w.pool,
    } as never)
    const asked = calls.find(c => c.url.endsWith('/api/generate/image'))!
    expect(asked.body.model).toBe('kie/google/imagen4')
  })

  it('a Kie name with no price is refused before anything is spent', async () => {
    expect(kieImageOrder('kie/no/such-model')).toMatchObject({
      refused: expect.any(String),
    })
    expect(kieImageOrder('fal-ai/flux/dev')).toBeNull()
    const w = wallet(500)
    await (
      await tool('image_generate')
    ).handler({ prompt: 'x', model: 'kie/no/such-model' }, {
      telegramId: BUYER,
      pool: w.pool,
    } as never)
    expect(w.debits).toEqual([])
    expect(calls).toEqual([])
  })

  it("a picture given to video_generate makes the clip on the spec's model", async () => {
    const w = wallet(1000)
    await (
      await tool('video_generate')
    ).handler({ prompt: 'the cow walks', image_url: SRC }, {
      telegramId: BUYER,
      pool: w.pool,
    } as never)
    expect(w.debits).toEqual([
      priceForModel('video_generate', SPEC.IMAGE_TO_VIDEO_MODEL),
    ])
    const asked = calls.find(c => c.url.endsWith('/api/generate/video'))!
    expect(asked.body).toMatchObject({
      model: SPEC.IMAGE_TO_VIDEO_MODEL,
      image_url: SRC,
    })
  })
})

/** A wallet and the music task table, answering what their SQL names. */
function studio(start: number) {
  const w = wallet(start)
  const tasks = new Map<string, any>()
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      const q = sql.replace(/\s+/g, ' ')
      if (/CREATE TABLE IF NOT EXISTS agent_music_tasks/.test(q))
        return { rows: [] }
      if (/INSERT INTO agent_music_tasks/.test(q)) {
        const [task_id, telegram_id, spent] = params as [string, string, number]
        if (!tasks.has(task_id))
          tasks.set(task_id, {
            task_id,
            telegram_id,
            spent,
            state: 'writing',
            url: null,
          })
        return { rows: [] }
      }
      if (/SELECT task_id, spent, state, url FROM agent_music_tasks/.test(q)) {
        const t = tasks.get(String(params[0]))
        return {
          rows: t && t.telegram_id === String(params[1]) ? [{ ...t }] : [],
        }
      }
      if (/UPDATE agent_music_tasks SET state = 'failed'/.test(q)) {
        const t = tasks.get(String(params[0]))
        if (!t || (/AND state = 'writing'/.test(q) && t.state !== 'writing'))
          return { rows: [] }
        t.state = 'failed'
        return { rows: [{ task_id: t.task_id }] }
      }
      if (/UPDATE agent_music_tasks SET state = 'done'/.test(q)) {
        const t = tasks.get(String(params[0]))
        if (t) Object.assign(t, { state: 'done', url: params[1] })
        return { rows: [] }
      }
      return w.pool.query(sql, params)
    },
  }
  return { ...w, pool, tasks }
}

describe('music on Kie Suno (#3924)', () => {
  let reads: number
  let script: { create: any; states: any[] }
  beforeEach(async () => {
    reads = 0
    const { setMusicPollMsForTests } = await import('../agent/tools')
    setMusicPollMsForTests(1)
    process.env.KIE_AI_API_KEY = 'test-key'
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        const u = String(url)
        const json = (body: unknown, status = 200) => ({
          ok: status < 400,
          status,
          json: async () => body,
          text: async () => '',
          headers: new Headers({ 'content-type': 'audio/mpeg' }),
          arrayBuffer: async () => new ArrayBuffer(4),
        })
        if (u.endsWith('/api/v1/generate')) return json(script.create)
        if (u.includes('/api/v1/generate/record-info'))
          return json(
            script.states[Math.min(reads++, script.states.length - 1)]
          )
        if (u.endsWith('/upload'))
          return json({ directUrl: 'https://s3.example/song.mp3' })
        return json({}) // the provider's audio file
      })
    )
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.KIE_AI_API_KEY
  })

  const tool = async (name: string) => {
    const { TOOLS } = await import('../agent/tools')
    return TOOLS.find(x => x.name === name)!
  }
  const ready = {
    data: {
      status: 'SUCCESS',
      response: { sunoData: [{ audioUrl: 'https://cdn.kie/song.mp3' }] },
    },
  }
  const writing = { data: { status: 'PENDING' } }
  const failed = {
    data: { status: 'GENERATE_AUDIO_FAILED', errorMessage: 'blocked words' },
  }
  const first = (r: any) => r[Object.keys(r)[0]]

  it('the tools are the spec rows, priced one request', async () => {
    expect((await tool(SPEC.MUSIC_TOOL_NAME)).description).toBe(SPEC.MUSIC_HELP)
    expect((await tool(SPEC.MUSIC_STATUS_TOOL_NAME)).description).toBe(
      SPEC.MUSIC_STATUS_HELP
    )
    expect(TOKEN_PRICES.music_generate).toBe(24)
  })

  it('a song that comes in time: charged once, kept in our S3', async () => {
    script = { create: { data: { taskId: 't1' } }, states: [writing, ready] }
    const st = studio(500)
    const r: any = await (
      await tool('music_generate')
    ).handler({ prompt: 'a song about a cow' }, {
      telegramId: BUYER,
      pool: st.pool,
    } as never)
    expect(first(r)).toBe(true)
    expect(r.url).toBe('https://s3.example/song.mp3')
    expect(st.debits).toEqual([TOKEN_PRICES.music_generate])
    expect(st.credits).toEqual([])
    expect(st.tasks.get('t1').state).toBe('done')
  })

  it('a song still writing after the wait: pending with its id, no refund, music_status fetches it', async () => {
    script = { create: { data: { taskId: 't2' } }, states: [writing] }
    const st = studio(500)
    const r: any = await (
      await tool('music_generate')
    ).handler({ prompt: 'a lullaby' }, {
      telegramId: BUYER,
      pool: st.pool,
    } as never)
    expect(first(r)).toBe(false)
    expect(r.pending).toBe(true)
    expect(r.task_id).toBe('t2')
    expect(reads).toBeGreaterThanOrEqual(SPEC.MUSIC_WAIT_SECONDS)
    expect(st.credits).toEqual([])
    script.states = [ready]
    reads = 0
    const later: any = await (
      await tool('music_status')
    ).handler({ task_id: 't2' }, { telegramId: BUYER, pool: st.pool } as never)
    expect(first(later)).toBe(true)
    expect(later.url).toBe('https://s3.example/song.mp3')
  })

  it('a song that fails is refunded exactly once, however often it is asked about', async () => {
    script = { create: { data: { taskId: 't3' } }, states: [failed] }
    const st = studio(500)
    const r: any = await (
      await tool('music_generate')
    ).handler({ prompt: 'x' }, { telegramId: BUYER, pool: st.pool } as never)
    expect(first(r)).toBe(false)
    expect(st.credits).toEqual([TOKEN_PRICES.music_generate])
    await (
      await tool('music_status')
    ).handler({ task_id: 't3' }, { telegramId: BUYER, pool: st.pool } as never)
    expect(st.credits).toEqual([TOKEN_PRICES.music_generate])
  })

  it('two asks at once about a song that failed refund it once', async () => {
    script = { create: { data: { taskId: 't6' } }, states: [writing] }
    const st = studio(500)
    await (
      await tool('music_generate')
    ).handler({ prompt: 'x' }, { telegramId: BUYER, pool: st.pool } as never)
    expect(st.credits).toEqual([])
    script.states = [failed]
    const status = await tool('music_status')
    await Promise.all([
      status.handler({ task_id: 't6' }, {
        telegramId: BUYER,
        pool: st.pool,
      } as never),
      status.handler({ task_id: 't6' }, {
        telegramId: BUYER,
        pool: st.pool,
      } as never),
    ])
    expect(st.credits).toEqual([TOKEN_PRICES.music_generate])
  })

  it('a song that does not start is refunded; an empty prompt costs nothing', async () => {
    script = { create: { msg: 'insufficient credits' }, states: [writing] }
    const st = studio(500)
    await (
      await tool('music_generate')
    ).handler({ prompt: 'x' }, { telegramId: BUYER, pool: st.pool } as never)
    expect(st.credits).toEqual(st.debits)
    const empty = studio(500)
    await (
      await tool('music_generate')
    ).handler({ prompt: '  ' }, {
      telegramId: BUYER,
      pool: empty.pool,
    } as never)
    expect(empty.debits).toEqual([])
  })

  it("the request is the spec's Suno model, instrumental only when asked", async () => {
    script = { create: { data: { taskId: 't5' } }, states: [ready] }
    const bodies = () =>
      (fetch as any).mock.calls
        .filter((c: any[]) => String(c[0]).endsWith('/api/v1/generate'))
        .map((c: any[]) => JSON.parse(c[1].body))
    const st = studio(500)
    await (
      await tool('music_generate')
    ).handler({ prompt: 'rain', instrumental: true }, {
      telegramId: BUYER,
      pool: st.pool,
    } as never)
    await (
      await tool('music_generate')
    ).handler({ prompt: 'sun', instrumental: 'yes' }, {
      telegramId: BUYER,
      pool: st.pool,
    } as never)
    expect(
      bodies().map((b: any) => [b.model, b.instrumental, b.prompt])
    ).toEqual([
      [SPEC.SUNO_MODEL, true, 'rain'],
      [SPEC.SUNO_MODEL, false, 'sun'],
    ])
  })

  it("somebody else's song is not theirs to fetch", async () => {
    script = { create: { data: { taskId: 't4' } }, states: [writing] }
    const st = studio(500)
    await (
      await tool('music_generate')
    ).handler({ prompt: 'x' }, { telegramId: BUYER, pool: st.pool } as never)
    script.states = [ready]
    const r: any = await (
      await tool('music_status')
    ).handler({ task_id: 't4' }, {
      telegramId: '900000888',
      pool: st.pool,
    } as never)
    expect(first(r)).toBe(false)
    expect(st.tasks.get('t4').state).toBe('writing')
  })
})

describe('the voice on Kie (#3928)', () => {
  let calls: { url: string; body: any }[]
  beforeEach(() => {
    calls = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown, init?: { body?: unknown }) => {
        calls.push({
          url: String(url),
          body: JSON.parse(String(init?.body ?? 'null')),
        })
        return {
          ok: true,
          status: 200,
          json: async () => ({ url: 'https://s3.example/line.mp3' }),
          text: async () => '',
        }
      })
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  const speak = async (args: Record<string, unknown>, pool: unknown) => {
    const { TOOLS } = await import('../agent/tools')
    return (await TOOLS.find(x => x.name === 'audio_generate')!.handler(args, {
      telegramId: BUYER,
      pool,
    } as never)) as any
  }
  const asked = () =>
    calls.find(c => c.url.endsWith('/api/generate/audio'))?.body

  it('a preset voice speaks on the default Kie model, per started thousand characters', async () => {
    const w = wallet(500)
    const r = await speak(
      { text: 'a'.repeat(2500), voice_id: 'Rachel' },
      w.pool
    )
    expect(r.url).toBe('https://s3.example/line.mp3')
    expect(asked()).toMatchObject({ model: SPEC.TTS_DEFAULT_MODEL })
    const per = priceForModel('audio_generate', SPEC.TTS_DEFAULT_MODEL)!
    expect(per).toBe(TOKEN_PRICES.audio_generate)
    expect(w.debits).toEqual([per * 3])
  })

  it('the richer voice by name, at its own price', async () => {
    const rich = SPEC.TTS_MODELS[1]
    const w = wallet(500)
    await speak(
      { text: 'hello', voice_id: 'Rachel', model: ` ${rich} ` },
      w.pool
    )
    expect(asked()).toMatchObject({ model: rich })
    expect(w.debits).toEqual([priceForModel('audio_generate', rich)])
    expect(w.debits[0]).toBeGreaterThan(TOKEN_PRICES.audio_generate)
  })

  it('a voice model that is not a row is refused before anything is spent', async () => {
    const w = wallet(500)
    // A Kie model WITH a price, so only the row rule can refuse it.
    const notAVoice = SPEC.SOURCE_TOOL_MODELS[0]
    expect(priceForModel('audio_generate', notAVoice)).toBeGreaterThan(0)
    const r = await speak(
      { text: 'hello', voice_id: 'Rachel', model: notAVoice },
      w.pool
    )
    expect(r[Object.keys(r)[0]]).toBe(false)
    expect(w.debits).toEqual([])
    expect(calls).toEqual([])
  })

  it('a clone takes no Kie model, and is charged per thousand characters too', async () => {
    const w = wallet(500)
    const pool = {
      query: async (sql: string, params: unknown[] = []) =>
        /SELECT voice_id, seconds FROM lead_voices/.test(sql)
          ? { rows: [{ voice_id: 'minimax-own-voice', seconds: 30 }] }
          : w.pool.query(sql, params),
    }
    await speak(
      { text: 'b'.repeat(1500), for_lead: BUYER, model: SPEC.TTS_MODELS[1] },
      pool
    )
    const body = asked()
    expect(body.clone_voice).toBe('minimax-own-voice')
    expect(body.model).toBeUndefined()
    expect(w.debits).toEqual([TOKEN_PRICES.audio_generate * 2])
  })

  it('the prompt says what Kie does not sell', async () => {
    const { systemPrompt } = await import('../agent/chat')
    expect(systemPrompt('bot')).toContain(SPEC.NOT_ON_KIE_NOTE)
  })
})
