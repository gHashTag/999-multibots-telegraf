/**
 * Ratchet: the Kie render-status poller is constructed with the key the rest of
 * the codebase (and Railway) actually sets -- KIE_AI_API_KEY.
 *
 * render/steps.ts built `new KieAIService(process.env.KIE_API_KEY || '')`. That
 * name is set nowhere (Railway carries KIE_AI_API_KEY), so the client was born
 * with an EMPTY key and every status poll of a Kie render job failed 401 --
 * a paid render that could never be observed to finish. 44 other reads use
 * KIE_AI_API_KEY; this was the single stray.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const STEPS = path.resolve(
  __dirname,
  '../../inngest_app/functions/render/steps.ts'
)

/** The argument text of every `new KieAIService(...)` construction. */
function kieServiceArgs(src: string): string[] {
  const out: string[] = []
  const re = /new KieAIService\(([\s\S]*?)\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) out.push(m[1])
  return out
}

describe('Kie render-status client reads KIE_AI_API_KEY', () => {
  const src = fs.readFileSync(STEPS, 'utf8')
  const args = kieServiceArgs(src)

  it('floor: the client is still constructed in steps.ts', () => {
    expect(args.length).toBeGreaterThan(0)
  })

  it('no construction reads the stray KIE_API_KEY without KIE_AI_API_KEY first', () => {
    const envReading = args.filter(a => a.includes('process.env.KIE_'))
    expect(
      envReading.length,
      'no env-reading construction found (matcher stale?)'
    ).toBeGreaterThan(0)
    for (const a of envReading) {
      expect(a, `KieAIService(${a.trim()}) reads the stray name`).toContain(
        'process.env.KIE_AI_API_KEY'
      )
    }
  })

  it('self-check: a bare KIE_API_KEY construction is detected', () => {
    const bad = "new KieAIService(process.env.KIE_API_KEY || '')"
    expect(kieServiceArgs(bad)[0]).not.toContain('process.env.KIE_AI_API_KEY')
  })

  it('mutation: reverting to the stray name turns the check RED', () => {
    const mutated = src.replace(
      "process.env.KIE_AI_API_KEY || process.env.KIE_API_KEY || ''",
      "process.env.KIE_API_KEY || ''"
    )
    expect(mutated).not.toEqual(src)
    expect(
      kieServiceArgs(mutated).every(a =>
        a.includes('process.env.KIE_AI_API_KEY')
      )
    ).toBe(false)
  })
})
