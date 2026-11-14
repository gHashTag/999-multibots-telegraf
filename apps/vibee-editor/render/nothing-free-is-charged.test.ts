import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { TOKEN_PRICES, priceForModel } from './src/agent/billing-shared'
import * as MEDIA_SPEC from './src/spec/agent-media-kie.gen'
import { pricingSummary } from './src/agent/pricing'

/**
 * A FREE LIST THAT NAMES A CHARGED FEATURE IS WORSE THAN NO LIST.
 *
 * The person reads it, presses, and is billed. Two of the six entries were
 * exactly that:
 *
 *  - "Сборка рилса" was listed free while the reel_render tool charges 2
 *    tokens -- and the SAME FILE listed reel_render under PAID. The price
 *    list contradicted itself, and nothing noticed.
 *  - "img2img-сцены из фото — Pollinations FLUX — keyless, $0" was false in
 *    both halves: pollinations.ai was called by no runtime code at all, and
 *    the img2img that exists runs on Kie and charges through image_generate.
 *    (Resolved 2026-09-29, in the direction the guard demanded: the provider
 *    became a real call -- the free t2i leg of the image chain -- not a
 *    reworded claim. It is still NOT in the free list: the person pays the
 *    same tokens whichever leg draws.)
 *
 * Both are structural mistakes, not typos, so the guards below are
 * structural: what CHARGES must be quoted, and a provider named in the free
 * list must exist in the code.
 */

const paid = () =>
  pricingSummary().платно as Array<{ функция: string; токенов: number }> // cyrillic-ok: field names
const free = () =>
  pricingSummary().бесплатно as Array<{ что: string; как: string }> // cyrillic-ok: field names

const TOOLS = readFileSync(join(__dirname, 'src', 'agent', 'tools.ts'), 'utf8')

describe('what charges is quoted', () => {
  /**
   * The charge sites are the source of truth for "is it paid": a tool that
   * calls spendTokens takes money whatever any list says.
   */
  const charged = [
    ...TOOLS.matchAll(/spendTokens\(\s*ctx\s*,\s*'([a-z_]+)'/g),
  ].map(m => m[1])

  it('the scanner finds the charge sites at all', () => {
    // Positive control: an empty match set would make every assertion below
    // pass vacuously, which is how a census lies.
    expect(charged.length).toBeGreaterThanOrEqual(4)
    expect(new Set(charged)).toContain('reel_render')
  })

  it('every charged operation is in the price list, at its charged price', () => {
    const listed = new Map(paid().map(r => [r.функция, r.токенов])) // cyrillic-ok: field names
    for (const op of new Set(charged)) {
      expect(listed.has(op), `${op}: charged and not quoted`).toBe(true)
      // A video is charged priceForModel of the agent's Kie clip
      // (agent-media-kie.t27), not the old flat price.
      const price =
        op === 'video_generate'
          ? priceForModel(op, MEDIA_SPEC.AGENT_VIDEO_MODEL)
          : TOKEN_PRICES[op]
      expect(listed.get(op), `${op}: quoted at the wrong price`).toBe(price)
    }
  })
})

describe('nothing in the free list is charged', () => {
  /**
   * The needles are the exact wording that shipped, so "no offence found"
   * cannot be confused with "the matcher looked for nothing".
   */
  const WAS_WRONG = ['Сборка рилса', 'img2img']

  it('the matcher recognises the entries that shipped', () => {
    const sample = [
      { что: 'Сборка рилса', как: 'локальный Remotion/ffmpeg' }, // cyrillic-ok: shipped copy
      { что: 'img2img-сцены из фото', как: 'Pollinations FLUX' }, // cyrillic-ok: shipped copy
    ]
    for (const needle of WAS_WRONG) {
      expect(sample.some(e => e.что.includes(needle))).toBe(true) // cyrillic-ok: field name
    }
    expect(
      sample.some(e => e.что.includes('SOUL')) // cyrillic-ok: field name
    ).toBe(false)
  })

  it('neither charged entry has come back', () => {
    for (const needle of WAS_WRONG) {
      const guilty = free().filter(e => e.что.includes(needle)) // cyrillic-ok: field name
      expect(guilty, `«${needle}» стоит в бесплатных, а списывается`).toEqual(
        []
      )
    }
  })
})

/**
 * A provider named in the free list must be a provider the code actually
 * calls. "Pollinations FLUX — keyless, $0" was a promise about a dependency
 * that does not exist in any runtime path -- so the entry could not have been
 * free OR paid; it simply was not there.
 */
describe('a free entry names no imaginary provider', () => {
  const RUNTIME = join(__dirname, 'src')
  /*
   * A MENTION IS NOT A CALL, and the first version of this guard could not
   * tell the difference. It searched the sources for the bare word
   * "pollinations" -- which is there, in the provider_setup tool description
   * and in the PROVIDERS reference map -- so the guard passed while the very
   * entry it was written to catch sat back in the free list. Its own mutant
   * survived, which is the only reason this is not shipped as decoration.
   *
   * The discriminator is the HOST a call would have to name. A description
   * can say "Pollinations"; only code that talks to it says
   * "pollinations.ai".
   */
  const PROVIDER_HOST: Record<string, string> = {
    pollinations: 'pollinations.ai',
    replicate: 'replicate.com',
    elevenlabs: 'elevenlabs.io',
    kie: 'kie.ai',
  }

  function sources(dir: string, acc: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) sources(full, acc)
      else if (name.endsWith('.ts') && !name.endsWith('.test.ts'))
        acc.push(readFileSync(full, 'utf8'))
    }
    return acc
  }
  const RUNTIME_TEXT = sources(RUNTIME).join('\n').toLowerCase()

  it('the corpus is real and the discriminator discriminates', () => {
    expect(RUNTIME_TEXT.length).toBeGreaterThan(100_000)
    // A provider the code demonstrably calls: its host is there.
    expect(RUNTIME_TEXT).toContain('replicate.com')
    // And the one this guard was written for: on 2026-09-22 its host was in
    // NO runtime file -- a name in prose, never a call -- which is how the
    // free list could claim it. On 2026-09-29 the host arrived in
    // src/pollinations-image.ts, the free leg of the image chain, and the
    // claim it backs moved to the provider reference. This is a control,
    // not a demand: it pins that the host arrives from the call and not
    // from prose, and goes red again the day the call is deleted while the
    // claims about the provider stay.
    expect(RUNTIME_TEXT).toContain('pollinations.ai')
  })

  it('every provider a free entry names is one the code calls', () => {
    for (const entry of free()) {
      const text = `${entry.что} ${entry.как}`.toLowerCase() // cyrillic-ok: field names
      for (const [name, host] of Object.entries(PROVIDER_HOST)) {
        if (!text.includes(name)) continue
        expect(
          RUNTIME_TEXT.includes(host),
          `«${entry.что}» ссылается на ${name}, но ${host} код не зовёт` // cyrillic-ok: field name
        ).toBe(true)
      }
    }
  })
})
