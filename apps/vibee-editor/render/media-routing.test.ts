import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { allProviders } from './src/agent/provider'

/**
 * A TURN WITH A PICTURE MUST REACH A PROVIDER THAT CAN SEE IT.
 *
 * Order alone breaks this twice. Sending image parts to z.ai fails the whole
 * turn with 400 "allowed values: ['text']" -- no answer at all, not a worse
 * one. And on 2026-09-07 z.ai was rate-limited until the 11th, so the agent
 * was already running on the sighted provider; when that limit resets, z.ai
 * returns to the front of the order and sight would vanish with no code change
 * and nothing in the log.
 */

const ORIGINAL = { ...process.env }
beforeEach(() => {
  process.env.GLM_API_KEY = 'k'
  process.env.NVIDIA_API_KEY = 'k'
  delete process.env.AGENT_PROVIDER
  delete process.env.AGENT_MODEL
})
afterEach(() => {
  process.env = { ...ORIGINAL }
})

describe('who can see', () => {
  it('the capability is recorded per provider, measured not guessed', () => {
    const byId = Object.fromEntries(allProviders().map(p => [p.id, p]))
    expect(byId['zai'].vision).toBe(false)
    expect(byId['zai-lite'].vision).toBe(false)
    expect(byId['nemotron'].vision).toBe(true)
  })

  /*
   * Hearing is tracked SEPARATELY from sight. Today one provider does both, so
   * a single flag would work -- and would be a coincidence. The next provider
   * with sight and no hearing would send voice to a model that cannot listen,
   * and the person would get a confident answer about nothing.
   */
  it('hearing is its own flag, not implied by sight', () => {
    const byId = Object.fromEntries(allProviders().map(p => [p.id, p]))
    expect(byId['zai'].audio).toBe(false)
    expect(byId['zai-lite'].audio).toBe(false)
    expect(byId['nemotron'].audio).toBe(true)
  })

  it('at least one configured provider can hear, or voice is dead', () => {
    expect(allProviders().some(p => p.audio)).toBe(true)
  })

  /*
   * The default order puts z.ai first. That is correct for text and fatal for
   * a picture, which is the whole reason routing exists.
   */
  it('the sighted provider is NOT the first by order', () => {
    const order = allProviders().map(p => p.id)
    expect(order[0]).toBe('zai')
    expect(order.find(id => id === 'nemotron')).toBeDefined()
    expect(order.indexOf('nemotron')).toBeGreaterThan(0)
  })

  it('at least one configured provider can see, or the feature is dead', () => {
    expect(allProviders().some(p => p.vision)).toBe(true)
  })

  it('a provider with no key does not appear at all', () => {
    delete process.env.NVIDIA_API_KEY
    expect(allProviders().some(p => p.id === 'nemotron')).toBe(false)
    expect(allProviders().some(p => p.vision)).toBe(false)
  })
})
