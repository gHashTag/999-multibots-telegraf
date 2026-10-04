/**
 * Owner, 2026-10-05: drafts go to the free z.ai flash models; the paid
 * reserve route only when both fail. Measured 2026-10-04 16:14Z: the reserve
 * key ran out of funds and every engage draft came back null.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { writeDraft, DRAFT_ORDER, setDraftRetryMs } from './reddit-wiring'

setDraftRetryMs(0)

const env = { ...process.env }
afterEach(() => {
  process.env = { ...env }
  vi.unstubAllGlobals()
})

function setKeys() {
  process.env.GLM_API_KEY = 'stub-' + Math.random().toString(36).slice(2)
  process.env.RESERVE_BASE_URL = 'https://reserve.invalid/api/v1'
  process.env.RESERVE_API_KEY = 'stub-' + Math.random().toString(36).slice(2)
  process.env.RESERVE_MODEL = 'paid/model'
  delete process.env.AGENT_PROVIDER
}

const ok = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
  })

describe('writeDraft', () => {
  it('tries the free z.ai flash models before the paid reserve', () => {
    expect([...DRAFT_ORDER]).toEqual(['zai-lite', 'zai', 'reserve'])
  })

  it('asks glm-4.5-flash first and never touches the reserve when it answers', async () => {
    setKeys()
    const asked: string[] = []
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      asked.push(JSON.parse(String(init.body)).model)
      return ok('a draft')
    })
    expect(await writeDraft('p')).toBe('a draft')
    expect(asked).toEqual(['glm-4.5-flash'])
  })

  it('falls through z.ai to the reserve, in order', async () => {
    setKeys()
    const asked: string[] = []
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      const model = JSON.parse(String(init.body)).model
      asked.push(model)
      return model === 'paid/model' ? ok('paid draft') : new Response('', { status: 429 })
    })
    expect(await writeDraft('p')).toBe('paid draft')
    expect(asked).toEqual([
      'glm-4.5-flash',
      'glm-4.5-flash',
      'glm-4.7-flash',
      'glm-4.7-flash',
      'paid/model',
    ])
  })

  it('returns null when nothing answers', async () => {
    setKeys()
    vi.stubGlobal('fetch', async () => new Response('', { status: 402 }))
    expect(await writeDraft('p')).toBeNull()
  })
  it('turns GLM thinking off on z.ai and leaves the reserve body alone', async () => {
    setKeys()
    const bodies: Array<Record<string, unknown>> = []
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      const b = JSON.parse(String(init.body))
      bodies.push(b)
      return b.model === 'paid/model' ? ok('paid') : ok('')
    })
    expect(await writeDraft('p')).toBe('paid')
    expect(bodies[0].thinking).toEqual({ type: 'disabled' })
    expect(bodies[1].thinking).toEqual({ type: 'disabled' })
    expect(bodies[2].thinking).toBeUndefined()
  })

  it('retries a 429 once on the same model before moving on', async () => {
    setKeys()
    const asked: string[] = []
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      asked.push(JSON.parse(String(init.body)).model)
      return asked.length === 1 ? new Response('', { status: 429 }) : ok('second try')
    })
    expect(await writeDraft('p')).toBe('second try')
    expect(asked).toEqual(['glm-4.5-flash', 'glm-4.5-flash'])
  })
})
