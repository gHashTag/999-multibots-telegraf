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
  mayOrderImage,
  sourceOk,
  videoRoute,
} from './agent-neuro-kie.logic'
import { priceForModel } from '../agent/billing-shared'
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

  it("VERSION says what the header's last note says", () => {
    expect(SPEC.VERSION).toBe(1)
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
