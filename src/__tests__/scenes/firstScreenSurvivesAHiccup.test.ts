import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * THE FIRST SCREEN A NEW PERSON SEES MUST SURVIVE A DATABASE HICCUP.
 *
 * /start -> CreateUserScene -> avatarTransformScene is the only path every new
 * arrival takes, and the opening step of that scene awaited two database calls
 * with no protection at all. A timeout or a transient error threw the step, so
 * the free demo never appeared and the first impression of the product was
 * nothing.
 *
 * The demo is not hypothetical: 271 people have taken it and 44 arrived in
 * August alone. Measured 2026-09-08 -- and the same measurement refuted two
 * louder hypotheses on the way, that the demo's provider was dead (Replicate
 * answers 200) and that its table was missing (superhero_generations has 131
 * rows). What was actually wrong was the absence of a seatbelt.
 *
 * Structural, because the step is 240 lines inside a WizardScene with no seam
 * to call it through, and the property is about control flow: is the await
 * inside a try.
 */
const SOURCE = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    '..',
    'scenes',
    'avatarTransformScene',
    'index.ts'
  ),
  'utf8'
)
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(
  /^\s*\/\/.*$/gm,
  ''
)

/** The opening step: from the wizard constructor to its first wizard.next(). */
const STEP_ZERO = (() => {
  const start = CODE.indexOf(
    'export const avatarTransformScene = new Scenes.WizardScene'
  )
  expect(start).toBeGreaterThan(-1)
  const rest = CODE.slice(start)
  const end = rest.indexOf('return ctx.wizard.next()')
  expect(end).toBeGreaterThan(0)
  return rest.slice(0, end)
})()

/** Which awaits in a region sit outside every try. */
const unprotected = (region: string): string[] => {
  const out: string[] = []
  let depth = 0
  for (const line of region.split('\n')) {
    if (/\btry\s*\{/.test(line)) depth++
    if (/\}\s*catch/.test(line)) depth = Math.max(0, depth - 1)
    if (depth === 0 && /\bawait\s+check\w+\(/.test(line)) out.push(line.trim())
  }
  return out
}

describe('the opening step of the new-user demo cannot be thrown out of', () => {
  it('found the step it claims to check', () => {
    expect(STEP_ZERO.length).toBeGreaterThan(500)
    expect(STEP_ZERO).toContain('checkSuperheroGenerationUsage')
    expect(STEP_ZERO).toContain('checkAvatarTransformUsage')
  })

  /**
   * The check must be able to fail, so it is first shown to catch the shape it
   * was written for: an unprotected await in a region of the same kind.
   */
  it('would catch an unprotected call', () => {
    const fixture = [
      'async ctx => {',
      '  const r = await checkSomething(id)',
      '  return r',
      '}',
    ].join('\n')
    expect(unprotected(fixture)).toHaveLength(1)
    const guarded = [
      'async ctx => {',
      '  try {',
      '    const r = await checkSomething(id)',
      '  } catch (e) {}',
      '}',
    ].join('\n')
    expect(unprotected(guarded)).toHaveLength(0)
  })

  it('leaves no database call outside a try', () => {
    expect(
      unprotected(STEP_ZERO),
      'a throw here means a new person sees nothing on their first screen'
    ).toEqual([])
  })

  /**
   * Falling open is the deliberate half. Falling closed would deny the free
   * demo to everybody during any outage; falling open costs a few extra free
   * images. The failure has to be loud, or a fail-open becomes a quota that
   * quietly stopped existing.
   */
  it('falls open on the quota check, and says so in the log', () => {
    expect(STEP_ZERO).toMatch(/canGenerate:\s*true/)
    expect(SOURCE).toContain(
      'the monthly free quota is not enforced for this request'
    )
    expect(SOURCE).toMatch(
      /logger\.error\(\s*'\[AvatarTransformScene\] generation-limit check failed/
    )
  })

  it('falls open on the legacy check too, and says what that costs', () => {
    expect(STEP_ZERO).toMatch(/canUse:\s*true/)
    expect(SOURCE).toMatch(
      /logger\.error\(\s*'\[AvatarTransformScene\] legacy usage check failed/
    )
  })
})
