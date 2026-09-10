/*
 * THE ROAD HAS NO "LATER" AND NO "SKIP" (owner, 2026-09-09, evening):
 * "until paid the profile does not open; every step is mandatory; we do not
 * move on until the step is done". This test reads the component source so a
 * future "let me just add a small skip link" is caught before it ships.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const src = readFileSync(join(__dirname, 'WelcomeOnboarding.tsx'), 'utf8')
const dict = readFileSync(
  join(__dirname, '..', '..', 'atoms', 'language.ts'),
  'utf8'
)

describe('WelcomeOnboarding: every step is mandatory', () => {
  it('has no skip, later or leave handler anywhere', () => {
    expect(src).not.toMatch(/onSkip|onLater|onLeave|skipLabel|canLeave/)
  })

  it('draws no ghost button: one button of ours per card', () => {
    expect(src).not.toMatch(/welcome__btn--ghost/)
  })

  it('leaves no skip/later strings in the dictionary', () => {
    expect(dict).not.toMatch(/'welcome\.(skip|later|soul\.later)'/)
  })

  it('opens the profile only from the last card', () => {
    // A missing anchor must fail here, not hand slice() the last character
    // and let the assertions below pass over nothing.
    const at = src.indexOf("step === 'done'")
    expect(at).toBeGreaterThan(-1)
    const done = src.slice(at)
    expect(done).toMatch(/onClick=\{onDone\}/)
    // Declared once, destructured once, called once: nowhere else.
    expect(src.match(/onDone\b/g)?.length).toBe(3)
  })
})
