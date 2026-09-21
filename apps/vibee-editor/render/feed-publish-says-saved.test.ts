/**
 * feed_publish SAYS "SAVED, WAITING FOR APPROVAL" -- NEVER "PUBLISHED".
 *
 * The agent's post always goes in hidden (is_public: false) and waits for its
 * author's approval. The tool used to answer "published: true", and in the
 * live duet of 2026-09-21 the seller repeated it to the client about a row
 * nobody else could see. The model only passed on what the tool told it.
 *
 * The internal publish call is plain fetch, so it is stubbed here and the
 * body the tool sends is read back: the answer and the request must agree.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { TOOLS, type ToolContext } from './src/agent/tools'

const tool = TOOLS.find(t => t.name === 'feed_publish')!
const ctx = {
  telegramId: '900000031',
  pool: { query: async () => ({ rows: [{ n: 'Author', un: '' }] }) },
} as unknown as ToolContext
const ARGS = {
  name: 'plan 6',
  description: 'a reel #leela',
  video_url: 'https://example.com/r.mp4',
}

let sent: any = null
function answer(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body))
      return new Response(JSON.stringify(body), { status })
    })
  )
}
afterEach(() => {
  vi.unstubAllGlobals()
  sent = null
})

describe('a post the agent publishes', () => {
  it('is sent hidden, and the answer says so', async () => {
    answer(200, {
      id: 80,
      template: { created_at: 't' },
      telegram: { posted: false },
    })
    const r: any = await tool.handler(ARGS, ctx)
    expect(sent.is_public).toBe(false)
    expect(r['сохранено']).toBe(true) // cyrillic-ok: the tool's field
    expect(r['опубликовано']).toBe(false) // cyrillic-ok: the tool's field
    expect(r['ждёт_одобрения']).toBe(true) // cyrillic-ok: the tool's field
    expect(String(r['сказать_человеку'])).toMatch(/одобрени/) // cyrillic-ok: the tool's field and copy
  })

  it('a failed write is neither saved nor published', async () => {
    answer(500, {})
    const r: any = await tool.handler(ARGS, ctx)
    expect(r['сохранено']).toBe(false) // cyrillic-ok: the tool's field
    expect(r['опубликовано']).toBe(false) // cyrillic-ok: the tool's field
  })
})
