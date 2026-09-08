import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  getProviderStatus,
  chooseProvider,
  describeProvider,
  fetchLeads,
} from '@/services/modelSwitch'

/** The bot's side of "the model, from a button": three calls and their words. */
const OWNER = '144022504'
function fakeFetch(
  reply: (
    url: string,
    init: any
  ) => { ok: boolean; status: number; body: unknown }
) {
  const calls: Array<{
    url: string
    method: string
    headers: Record<string, string>
    body: any
  }> = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: any) => {
      calls.push({
        url: String(url),
        method: init?.method ?? 'GET',
        headers: init?.headers ?? {},
        body: init?.body ? JSON.parse(init.body) : null,
      })
      const r = reply(String(url), init)
      return { ok: r.ok, status: r.status, json: async () => r.body }
    })
  )
  return calls
}
const status = {
  current: { id: 'ollama', model: 'qwen3:1.7b', context: 16384, compact: true },
  chosen: 'ollama',
  env: 'zai',
  chain: [
    { id: 'ollama', model: 'qwen3:1.7b', context: 16384 },
    { id: 'zai', model: 'glm-5.3', context: 128000 },
  ],
}
const prevKey = process.env.RENDER_API_KEY
beforeEach(() => {
  process.env.RENDER_API_KEY = 'render-key-for-tests' // secret-guard-ok: invented for this test
})
afterEach(() => {
  vi.unstubAllGlobals()
  process.env.RENDER_API_KEY = prevKey
})

describe('the three calls', () => {
  it('status is a GET as the owner, over the server key', async () => {
    const calls = fakeFetch(() => ({ ok: true, status: 200, body: status }))
    const s = await getProviderStatus(OWNER)
    expect(s.current?.id).toBe('ollama')
    expect(calls[0].method).toBe('GET')
    expect(calls[0].url).toBe(
      `https://vibee-render-production.up.railway.app/api/agent/provider?telegram_id=${OWNER}`
    )
    expect(calls[0].headers['X-Api-Key']).toBe('render-key-for-tests')
  })

  it('a choice is a POST with the provider in the body', async () => {
    const calls = fakeFetch(() => ({
      ok: true,
      status: 200,
      body: { ...status, chosen: 'zai' },
    }))
    const s = await chooseProvider(OWNER, 'zai')
    expect(s.chosen).toBe('zai')
    expect(calls[0].method).toBe('POST')
    expect(calls[0].body).toEqual({ provider: 'zai' })
  })

  it("a refusal carries the server's words, and no key is a refusal before any call", async () => {
    const calls = fakeFetch(() => ({
      ok: false,
      status: 409,
      body: { error: 'nemotron: не настроен на этом сервисе' },
    }))
    await expect(chooseProvider(OWNER, 'nemotron')).rejects.toThrow(
      'не настроен'
    )
    delete process.env.RENDER_API_KEY
    await expect(getProviderStatus(OWNER)).rejects.toThrow('RENDER_API_KEY')
    expect(calls.length).toBe(1)
  })

  it('leads come through the tool, formatted, with a hint when empty', async () => {
    const calls = fakeFetch(() => ({
      ok: true,
      status: 200,
      body: {
        result: {
          structuredContent: {
            candidates: [
              { lead: '555', score: 7, next: 'reply', because: 'ждёт ответа' },
            ],
          },
        },
      },
    }))
    const { text } = await fetchLeads(OWNER)
    expect(calls[0].url).toContain('/mcp?telegram_id=' + OWNER)
    expect(calls[0].body.params.name).toBe('crm_leads')
    expect(text).toContain('reply')
    expect(text).toContain('555')
    expect(text).toContain('ждёт ответа')
    fakeFetch(() => ({
      ok: true,
      status: 200,
      body: { result: { structuredContent: { candidates: [] } } },
    }))
    expect((await fetchLeads(OWNER)).text).toContain('Кандидатов нет')
    fakeFetch(() => ({
      ok: true,
      status: 200,
      body: { error: { message: 'принадлежит владельцу' } },
    }))
    await expect(fetchLeads('999')).rejects.toThrow('принадлежит владельцу')
  })
})

describe('the words', () => {
  it('name the provider, the model, the window and the kit, then the fallbacks', () => {
    const t = describeProvider(status as never)
    expect(t).toContain('наша')
    expect(t).toContain('qwen3:1.7b')
    expect(t).toContain('16384')
    expect(t).toContain('набор продавца')
    expect(t).toContain('glm-5.3')
    expect(
      describeProvider({ current: null, chosen: null, env: null, chain: [] })
    ).toContain('не настроен')
  })
})

describe('wired (source-level: the bot is not booted here)', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'navigation', 'registerCommands.ts'),
    'utf8'
  )
  it('the three commands exist, owner-only, and the buttons check the presser', () => {
    expect(src).toContain('registerCrmCommands(bot)')
    expect(src).toMatch(/bot\.command\('model', requireAdmin\(\)/)
    expect(src).toMatch(/bot\.command\('leads', requireAdmin\(\)/)
    expect(src).toMatch(/bot\.command\('sweep', requireAdmin\(\)/)
    const action = src.indexOf(
      'bot.action(/^mdl:(zai|zai-lite|nemotron|ollama)$/'
    )
    expect(action).toBeGreaterThan(-1)
    const block = src.slice(action, action + 900)
    expect(block.indexOf('if (!ownerOnly(ctx)) return')).toBeGreaterThan(-1)
    expect(block.indexOf('if (!ownerOnly(ctx)) return')).toBeLessThan(
      block.indexOf('chooseProvider(')
    )
  })
  it('/sweep runs the same sweep the timer runs', () => {
    const cp = fs.readFileSync(
      path.join(__dirname, '..', '..', 'services', 'crmProactive.ts'),
      'utf8'
    )
    expect(cp).toContain('export function runSweepNow(')
    expect(cp).toMatch(/return sweepOnce\(ownerId, liveDeps\(bot\)\)/)
    expect(src).toContain('runSweepNow(bot, String(ctx.from?.id')
  })
})
