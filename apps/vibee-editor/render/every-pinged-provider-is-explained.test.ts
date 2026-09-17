import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PROVIDERS } from './src/agent/pricing'

/**
 * PINGED AND UNLISTED IS THE WORST OF BOTH.
 *
 * `providers_status` has been checking Kie.ai for a while and counting it
 * among the working ones, while the PROVIDERS reference -- the map that says
 * what a provider GIVES and how to fix it -- did not mention it at all.
 *
 * So the owner asking "which providers do I have" was shown six, and not the
 * one his first move to a new client runs on: the lead magnet is drawn by
 * gpt-image-2-5-flare on Kie. A status line without an entry is a number with
 * nothing behind it; an entry without a status line is a promise nobody
 * checks. Both halves, or neither.
 */
describe('every provider the health check pings is explained somewhere', () => {
  const server = readFileSync(join(__dirname, 'render-server.ts'), 'utf8')

  /** The labels of the health pings, as the owner sees them. */
  const pinged = [...server.matchAll(/ping\(\s*'([^']+)'/g)].map(m => m[1])

  it('the ping list was actually found', () => {
    // A guard that greps nothing passes forever.
    expect(pinged.length).toBeGreaterThanOrEqual(5)
    expect(pinged.join('|')).toContain('Kie')
  })

  it('each one has an entry saying what it gives and how to fix it', () => {
    const keys = Object.keys(PROVIDERS)
    const missing = pinged.filter(label => {
      // The head of the label is the provider: "OpenAI (optional)" -> openai.
      const head = label.split(/[—(-]/)[0].trim().toLowerCase()
      return !keys.some(
        k => head.startsWith(k) || k.startsWith(head.split('.')[0])
      )
    })
    expect(missing, 'pinged but never explained').toEqual([])
  })

  it('and the entry carries the three things a person needs', () => {
    for (const [name, p] of Object.entries(PROVIDERS)) {
      const row = p as unknown as Record<string, string>
      expect(row['даёт'], `${name}: what it gives`).toBeTruthy() // cyrillic-ok
      expect(row.env, `${name}: which variable`).toBeTruthy()
      expect(row['как'], `${name}: how to fix it`).toBeTruthy() // cyrillic-ok
    }
  })

  it('kie is there, and says the lead magnet depends on it', () => {
    // The specific hole this test was written for.
    expect(PROVIDERS.kie).toBeTruthy()
    expect(PROVIDERS.kie.env).toBe('KIE_AI_API_KEY')
    expect(JSON.stringify(PROVIDERS.kie)).toContain('ЛИД-МАГНИТ') // cyrillic-ok
  })
})
