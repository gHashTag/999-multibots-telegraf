import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * The model, chosen from the bot: the choice outranks the deploy variable,
 * survives a restart through the table, and refuses anything that is not a
 * provider. Plus the route that carries it, pinned at the source.
 */
const ENV = ['GLM_API_KEY', 'OLLAMA_ENABLED', 'AGENT_PROVIDER']
const saved: Record<string, string | undefined> = {}
beforeEach(() => {
  vi.resetModules()
  for (const k of ENV) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
  process.env.GLM_API_KEY = 'g' // secret-guard-ok: invented for this test
  process.env.OLLAMA_ENABLED = '1'
})
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})
function fakePool(answers: Record<string, unknown[]> = {}, failing = false) {
  const sqls: Array<{ sql: string; params: unknown[] }> = []
  return {
    sqls,
    query: async (sql: string, params: unknown[] = []) => {
      const flat = sql.replace(/\s+/g, ' ').trim()
      sqls.push({ sql: flat, params })
      if (failing) throw new Error('db down')
      for (const k of Object.keys(answers))
        if (flat.startsWith(k)) return { rows: answers[k] }
      return { rows: [] }
    },
  }
}

describe('the choice outranks the environment', () => {
  it('nothing chosen: AGENT_PROVIDER decides; chosen: the choice decides', async () => {
    process.env.AGENT_PROVIDER = 'zai'
    const choice = await import('./src/agent/provider-choice')
    const { providerOrder } = await import('./src/agent/provider')
    choice.forgetProviderChoiceForTests()
    expect(providerOrder()[0]).toBe('zai')
    await choice.chooseProvider(null, 'ollama')
    expect(providerOrder().slice(0, 2)).toEqual(['ollama', 'zai'])
    choice.forgetProviderChoiceForTests()
    expect(providerOrder()[0]).toBe('zai')
  })

  it('a choice is written for the next process, as an upsert', async () => {
    const choice = await import('./src/agent/provider-choice')
    choice.forgetProviderChoiceForTests()
    const pool = fakePool()
    await choice.chooseProvider(pool, 'nemotron')
    const up = pool.sqls.find(q =>
      q.sql.startsWith('INSERT INTO agent_settings')
    )!
    expect(up, 'no write').toBeTruthy()
    expect(up.sql).toContain('ON CONFLICT (key) DO UPDATE')
    expect(up.params).toEqual(['agent_provider', 'nemotron'])
    expect(choice.chosenProvider()).toBe('nemotron')
  })

  it('a restart reads the choice back; garbage in the table is nobody', async () => {
    const choice = await import('./src/agent/provider-choice')
    choice.forgetProviderChoiceForTests()
    expect(
      await choice.loadProviderChoice(
        fakePool({ 'SELECT value FROM agent_settings': [{ value: 'ollama' }] })
      )
    ).toBe('ollama')
    expect(choice.chosenProvider()).toBe('ollama')
    choice.forgetProviderChoiceForTests()
    expect(
      await choice.loadProviderChoice(
        fakePool({ 'SELECT value FROM agent_settings': [{ value: 'gpt-9' }] })
      )
    ).toBeNull()
  })

  it('a dead database neither throws nor keeps a stale choice', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const choice = await import('./src/agent/provider-choice')
      choice.forgetProviderChoiceForTests()
      expect(await choice.loadProviderChoice(fakePool({}, true))).toBeNull()
      await choice.chooseProvider(fakePool({}, true), 'zai')
      expect(choice.chosenProvider()).toBe('zai')
    } finally {
      spy.mockRestore()
    }
  })

  it('only a provider is a provider', async () => {
    const choice = await import('./src/agent/provider-choice')
    expect(choice.isProviderId('ollama')).toBe(true)
    expect(choice.isProviderId('gpt-4')).toBe(false)
    expect(choice.isProviderId(null)).toBe(false)
    await expect(choice.chooseProvider(null, 'gpt-4' as never)).rejects.toThrow(
      'unknown provider'
    )
  })
})

describe('the route (source-level: the server is not booted here)', () => {
  const src = () =>
    fs.readFileSync(path.join(__dirname, 'render-server.ts'), 'utf8')
  const at = (s: string, needle: string) => {
    const i = s.indexOf(needle)
    expect(i, `anchor missing: ${needle}`).toBeGreaterThan(-1)
    return i
  }
  it('answers the owner only, validates the id, and refuses an unconfigured provider', () => {
    const s = src()
    const a = at(s, "route === '/api/agent/provider'")
    const block = s.slice(a, a + 2600)
    expect(block).toContain('who !== TELEGRAM_OWNER_ID')
    expect(block).toContain('isProviderId(asked)')
    expect(block).toContain('allProviders().some(p => p.id === asked)')
    expect(block).toContain('chooseProvider(pool as never, asked)')
  })
  it('the last choice is restored before the server listens', () => {
    const s = src()
    const restore = at(s, 'loadProviderChoice(getPool())')
    expect(at(s, 'server.listen(Number(PORT)')).toBeGreaterThan(restore)
  })
})
