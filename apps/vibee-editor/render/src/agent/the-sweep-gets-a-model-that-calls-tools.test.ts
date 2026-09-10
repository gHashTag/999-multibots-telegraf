import { afterEach, describe, expect, it, vi } from 'vitest'
import { allProviders } from './provider'
import { forgetProviderChoiceForTests } from './provider-choice'
import fs from 'node:fs'
import path from 'node:path'

/**
 * THE SWEEP GETS A MODEL THAT CALLS TOOLS.
 *
 * Production 2026-09-08..10: `[[Подпись|tg_send]]` and its siblings -- a tool
 * name inside a button marker, zero tool calls -- with no line saying which of
 * four fallback providers wrote it. Two things fix that: the stream now names
 * the provider, and a turn may ask for `tools_only`, which drops the models
 * that only talk.
 */
afterEach(() => {
  vi.unstubAllEnvs()
  forgetProviderChoiceForTests()
})

describe('the provider catalogue says who calls tools', () => {
  it('z.ai and NVIDIA do; the 1.7B Ollama model does not', () => {
    vi.stubEnv('GLM_API_KEY', 'g')
    vi.stubEnv('NVIDIA_API_KEY', 'n')
    vi.stubEnv('OLLAMA_BASE_URL', 'http://ollama:11434')
    const all = allProviders()
    const byId = Object.fromEntries(all.map(p => [p.id, p.tools]))
    expect(byId).toEqual({ zai: true, 'zai-lite': true, nemotron: true, ollama: false })
    // What streamModel does under toolsOnly: the talker is gone, order kept.
    expect(all.filter(p => p.tools).map(p => p.id)).toEqual(['zai', 'zai-lite', 'nemotron'])
  })

  it('an Ollama-only deploy has nobody for a tools-only turn', () => {
    vi.stubEnv('OLLAMA_BASE_URL', 'http://ollama:11434')
    expect(allProviders().filter(p => p.tools)).toEqual([])
  })
})

describe('the wiring, read from the source', () => {
  const read = (f: string) => fs.readFileSync(path.join(__dirname, f), 'utf8')

  it('streamModel filters by tools under toolsOnly and names the provider before streaming', () => {
    const chat = read('chat.ts')
    expect(chat).toContain("allProviders().filter(p => !opts.toolsOnly || p.tools)")
    expect(chat).toContain("yield { kind: 'provider', id: p.id, model: p.model }")
    expect(chat).toContain("yield { тип: 'провайдер', id: ev.id, model: ev.model }") // cyrillic-ok: quoted source
  })

  it('the chat route passes tools_only only when it is literally true', () => {
    const routes = read('routes.ts')
    expect(routes).toContain('toolsOnly: body.tools_only === true')
  })
})
