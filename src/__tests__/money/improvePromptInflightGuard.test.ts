/**
 * Ratchet: improvePromptWizard guards its paid "Yes. Generate?" confirm with a
 * reject-before-set in-flight flag, so a fast double-tap cannot double-charge.
 *
 * The confirm case calls a paid generator (generateNeuroPhotoHybrid /
 * generateTextToVideo / generateTextToImageDirect) and scene.leave runs only
 * AFTER the long generation, so the reply-keyboard button stays live. Without a
 * guard two fast taps both land in step 2 and both charge (a concurrent
 * double-charge; every sibling confirm wizard -- aiCover, music, neuroPhoto,
 * textToImage -- has this guard; improvePrompt was skipped). Found by the iter232
 * wave-3 fresh-lens hunt (double-submit-inflight lens), adversarially + hand
 * verified.
 *
 * This pins it: an `if (ctx.session.improvePromptInProgress) return` reject and a
 * `= true` set must appear BEFORE the first paid generator call, and a `= false`
 * clear must exist (the finally). Text-based (comments stripped) with a floor +
 * self-check + real-source mutation.
 *
 * loop-fable iter232.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const FILE = path.resolve(
  __dirname,
  '../../scenes/improvePromptWizard/index.ts'
)

const strip = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const GEN = /\bgenerate(NeuroPhotoHybrid|TextToVideo|TextToImageDirect)\s*\(/

function analyze(source: string): {
  gens: number
  rejectIdx: number
  setIdx: number
  clears: boolean
  firstGenIdx: number
} {
  const s = strip(source)
  const rejectIdx = s.search(
    /if\s*\(\s*ctx\.session\.improvePromptInProgress\s*\)/
  )
  const setIdx = s.search(/ctx\.session\.improvePromptInProgress\s*=\s*true/)
  const clears = /ctx\.session\.improvePromptInProgress\s*=\s*false/.test(s)
  const firstGenIdx = s.search(GEN)
  const gens = (s.match(new RegExp(GEN, 'g')) || []).length
  return { gens, rejectIdx, setIdx, clears, firstGenIdx }
}

describe('improvePromptWizard confirm has a reject-before-set in-flight guard', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const a = analyze(source)

  it('floor: the confirm still calls a paid generator', () => {
    expect(a.gens).toBeGreaterThanOrEqual(1)
    expect(a.firstGenIdx).toBeGreaterThan(-1)
  })

  it('a reject-before-set in-flight flag precedes the paid generation, and is cleared', () => {
    expect(
      a.rejectIdx,
      'no `if (ctx.session.improvePromptInProgress) return` reject'
    ).toBeGreaterThan(-1)
    expect(
      a.setIdx,
      'no `ctx.session.improvePromptInProgress = true` set'
    ).toBeGreaterThan(-1)
    expect(
      a.clears,
      'no `ctx.session.improvePromptInProgress = false` clear (finally)'
    ).toBe(true)
    // ordering: reject and set must come BEFORE the first paid generator call
    expect(a.rejectIdx).toBeLessThan(a.firstGenIdx)
    expect(a.setIdx).toBeLessThan(a.firstGenIdx)
  })

  it('self-check: detector flags a confirm with no guard before the generator', () => {
    const bad = `case 'x': { await generateTextToVideo(a) }`
    const good = `case 'x': {
      if (ctx.session.improvePromptInProgress) { return }
      ctx.session.improvePromptInProgress = true
      try { await generateTextToVideo(a) } finally { ctx.session.improvePromptInProgress = false }
    }`
    const b = analyze(bad)
    expect(b.firstGenIdx).toBeGreaterThan(-1)
    expect(b.setIdx).toBe(-1) // no set -> would fail the guard assertion
    const g = analyze(good)
    expect(g.setIdx).toBeGreaterThan(-1)
    expect(g.setIdx).toBeLessThan(g.firstGenIdx)
    expect(g.clears).toBe(true)
  })

  it('mutation: removing the real set turns the check RED', () => {
    const mutated = source.replace(
      /ctx\.session\.improvePromptInProgress = true\n/,
      ''
    )
    expect(mutated).not.toEqual(source)
    expect(analyze(mutated).setIdx).toBe(-1)
  })
})
