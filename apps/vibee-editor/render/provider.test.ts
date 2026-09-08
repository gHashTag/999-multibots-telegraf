import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * OUR OWN MODEL in the chain: last by default, first on request, and shown a
 * tool kit it can actually hold. The catalogue reads the environment at
 * import, so every case loads the module fresh.
 */
const ENV = [
  'GLM_API_KEY',
  'NVIDIA_API_KEY',
  'OLLAMA_BASE_URL',
  'RAILWAY_SERVICE_QUEEN_OLLAMA_URL',
  'OLLAMA_ENABLED',
  'OLLAMA_MODEL',
  'OLLAMA_CONTEXT_LENGTH',
  'OLLAMA_NUM_CTX',
  'AGENT_PROVIDER',
  'AGENT_MODEL',
]
const saved: Record<string, string | undefined> = {}
beforeEach(() => {
  vi.resetModules()
  for (const k of ENV) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
})
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})
const load = () => import('./src/agent/provider')

describe('who is in the chain', () => {
  it('nothing configured: nobody, and the error names our model too', async () => {
    const m = await load()
    expect(m.allProviders()).toEqual([])
    expect(() => m.resolveProvider()).toThrow('OLLAMA_BASE_URL')
  })

  it('inside the project our model is the safety net: last, keyless, on the private domain', async () => {
    process.env.GLM_API_KEY = 'g' // secret-guard-ok: invented for this test
    process.env.RAILWAY_SERVICE_QUEEN_OLLAMA_URL =
      'queen-ollama-production.up.railway.app'
    const m = await load()
    const ids = m.allProviders().map(p => p.id)
    expect(ids[0]).toBe('zai')
    expect(ids.at(-1)).toBe('ollama')
    const ours = m.allProviders().at(-1)!
    expect(ours.base).toBe('http://queen-ollama.railway.internal:11434/v1')
    expect(ours.key).toBe('ollama')
    expect(ours.model).toBe('qwen3:1.7b')
    expect(ours.compact).toBe(true)
    expect(ours.context).toBe(4096)
  })

  it('AGENT_PROVIDER=ollama puts our model first, with the paid one still behind it', async () => {
    process.env.GLM_API_KEY = 'g' // secret-guard-ok: invented for this test
    process.env.OLLAMA_BASE_URL = 'http://ollama.local:11434/v1/'
    process.env.AGENT_PROVIDER = 'ollama'
    const m = await load()
    const ids = m.allProviders().map(p => p.id)
    expect(ids.slice(0, 2)).toEqual(['ollama', 'zai'])
    expect(m.resolveProvider().id).toBe('ollama')
    expect(m.resolveProvider().base).toBe('http://ollama.local:11434/v1')
  })

  it('AGENT_MODEL renames the paid model, never the Ollama tag; OLLAMA_MODEL does', async () => {
    process.env.GLM_API_KEY = 'g' // secret-guard-ok: invented for this test
    process.env.OLLAMA_ENABLED = '1'
    process.env.AGENT_MODEL = 'glm-4.7'
    process.env.OLLAMA_MODEL = 'qwen3:8b'
    process.env.AGENT_PROVIDER = 'ollama'
    let m = await load()
    expect(m.allProviders()[0]).toMatchObject({
      id: 'ollama',
      model: 'qwen3:8b',
    })
    vi.resetModules()
    process.env.AGENT_PROVIDER = 'zai'
    m = await load()
    expect(m.allProviders()[0]).toMatchObject({ id: 'zai', model: 'glm-4.7' })
  })

  it('a 16k window is still compact; a 32k one is not', async () => {
    process.env.OLLAMA_ENABLED = '1'
    process.env.OLLAMA_CONTEXT_LENGTH = '16384'
    let m = await load()
    expect(m.allProviders()[0]).toMatchObject({ context: 16384, compact: true })
    vi.resetModules()
    process.env.OLLAMA_CONTEXT_LENGTH = '32768'
    m = await load()
    expect(m.allProviders()[0]).toMatchObject({
      context: 32768,
      compact: false,
    })
    expect(m.COMPACT_BELOW).toBeGreaterThan(16384)
  })

  it('a missing model on our side says how to pull it', async () => {
    process.env.OLLAMA_MODEL = 'qwen3:8b'
    const m = await load()
    expect(m.diagnose('ollama', 404, 'model "qwen3:8b" not found')).toContain(
      'ollama pull qwen3:8b'
    )
    expect(m.diagnose('zai', 404, 'model not found')).toContain('AGENT_MODEL')
  })
})

describe('what a small model is shown', () => {
  it('the seller kit only: CRM, Telegram, SOUL, one generator', async () => {
    const { toolsForProvider } = await import('./src/agent/tools')
    const all = [
      'crm_offer',
      'tg_send',
      'soul_get',
      'image_generate',
      'reel_render',
      'audio_generate',
      'my_assets',
    ].map(name => ({ name }))
    expect(toolsForProvider({ compact: true }, all).map(t => t.name)).toEqual([
      'crm_offer',
      'tg_send',
      'soul_get',
      'image_generate',
    ])
    expect(toolsForProvider({ compact: false }, all).length).toBe(all.length)
    expect(toolsForProvider(undefined, all).length).toBe(all.length)
  })

  it('the real compact kit fits a 16k window beside the seller prompt', async () => {
    const { TOOLS, toolsForProvider } = await import('./src/agent/tools')
    const kit = toolsForProvider({ compact: true }, TOOLS)
    const chars = JSON.stringify(
      kit.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      }))
    ).length
    // ~3.2 chars per token for this mix of Russian and JSON; the prompt is ~5k.
    expect(chars / 3.2).toBeLessThan(6000)
    expect(kit.some(t => t.name === 'crm_offer')).toBe(true)
    expect(kit.some(t => t.name === 'tg_send')).toBe(true)
  })
})
