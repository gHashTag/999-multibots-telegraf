/**
 * ONE MAN'S VOICE IS NOT EVERYBODY'S.
 *
 * `SOUL.md` is the platform owner's personal voice file, and it names him. It
 * was appended to EVERY prompt, so in another person's profile the agent read
 * "the owner's SOUL says: <his name>, <his handles>" and answered as him.
 *
 * Owner, 2026-09-23: "why does the agent in my wife's profile write as me?!
 * each has their own profile!" Measured the same hour against production:
 * asked from her account whose agent it was, the model reasoned straight out
 * of his SOUL.
 *
 * Fictional values only; the real file is never read here.
 */
import { describe, it, expect, vi } from 'vitest'

const VOICE = 'ГОЛОС: ВЫМЫШЛЕННЫЙ ЧЕЛОВЕК, @placeholder_handle' // cyrillic-ok: a stand-in for the owner's file

vi.mock('node:fs', async importOriginal => {
  const real = await importOriginal<Record<string, any>>()
  return {
    ...real,
    readFileSync: (p: string, enc?: unknown) =>
      String(p).endsWith('SOUL.md')
        ? VOICE
        : real.readFileSync(p, enc as never),
  }
})

const { systemPrompt } = await import('./src/agent/chat')

describe('the owner voice', () => {
  it('is absent by default -- a prompt does not borrow an identity', () => {
    const p = systemPrompt('miniapp')
    expect(p).not.toContain(VOICE)
    expect(p).not.toContain('ГОЛОС ВЛАДЕЛЬЦА') // cyrillic-ok: the section heading
  })

  it('is absent for another person on every surface', () => {
    for (const surface of ['miniapp', 'bot', 'business']) {
      const p = systemPrompt(surface, false, undefined, false)
      expect(p, surface).not.toContain(VOICE)
    }
  })

  it('is there for the owner, where it belongs', () => {
    const p = systemPrompt('miniapp', false, undefined, true)
    expect(p).toContain(VOICE)
    expect(p).toContain('ГОЛОС ВЛАДЕЛЬЦА') // cyrillic-ok: the section heading
  })

  it('and the prompt never points at a voice it does not carry', () => {
    const p = systemPrompt('miniapp', false, undefined, false)
    // The content-plan line refers the model to "the owner's voice below".
    expect(p).not.toContain('КОНТЕНТ-ПЛАН НА 30 ДНЕЙ') // cyrillic-ok: the line
  })
})
