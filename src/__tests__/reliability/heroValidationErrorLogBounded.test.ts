/**
 * Ratchet: HeroValidationService.errorLog (a process-lifetime `private static`
 * array) is bounded, so it cannot grow without limit and slow-OOM the process.
 *
 * errorLog is pushed on every hero-validation failure. The failure path is
 * reachable by a user sending text the defensive buttonToHeroMap resolves to a
 * registry-absent hero name (non-offered / stale-keyboard input), so an
 * adversarial stream grows the static array for the whole process lifetime. It
 * is only read via slice(-10)/length, so a ring-buffer cap that drops oldest
 * entries is behaviour-neutral.
 *
 * The fix caps it: after the push, `if (errorLog.length > MAX) errorLog.splice(
 * 0, length - MAX)`. This pins that a bound exists in the file (a splice/shift
 * trim OR a length-cap on errorLog). Structural (source scan) -> self-check +
 * matcher-not-stale floor + mutation-verified.
 *
 * loop-fable iter214 (wave-16 unbounded-in-memory-collection lens; verifier
 * corrected severity to LOW -- adversarial-only growth). Additive guard, no
 * money/behaviour impact -> autonomous.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const FILE = path.resolve(__dirname, '../../services/HeroValidationService.ts')

function analyze(source: string): { pushes: boolean; bounded: boolean } {
  // Strip comments so prose mentioning "splice"/"cap" cannot satisfy the check.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

  const pushes = /\berrorLog\.push\s*\(/.test(code)

  // A real bound on errorLog: a splice/shift that trims it, or an explicit
  // length comparison against a max that gates such a trim.
  const trims =
    /\berrorLog\.splice\s*\(/.test(code) || /\berrorLog\.shift\s*\(/.test(code)
  const lengthGate =
    /\berrorLog\.length\s*>=?\s*[A-Za-z0-9_.]+/.test(code) ||
    /\bMAX_ERROR_LOG\b/.test(code)
  const bounded = trims && lengthGate

  return { pushes, bounded }
}

describe('HeroValidationService.errorLog is bounded (no static-array OOM)', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const a = analyze(source)

  // matcher-not-stale floor: the append this ratchet guards still exists.
  it('floor: errorLog is still appended on validation failure', () => {
    expect(a.pushes).toBe(true)
  })

  it('errorLog has a size bound (ring-buffer trim gated by a max)', () => {
    expect(a.bounded).toBe(true)
  })

  it('self-check: an append-only errorLog with no bound is detected', () => {
    const bad = `class S {
      private static errorLog = []
      static log(e){ this.errorLog.push(e); console.error(e) }
      static report(){ return this.errorLog.slice(-10) }
    }`
    expect(analyze(bad)).toEqual({ pushes: true, bounded: false })

    const good = `class S {
      private static errorLog = []
      private static readonly MAX_ERROR_LOG = 1000
      static log(e){
        this.errorLog.push(e)
        if (this.errorLog.length > this.MAX_ERROR_LOG) this.errorLog.splice(0, this.errorLog.length - this.MAX_ERROR_LOG)
      }
    }`
    expect(analyze(good)).toEqual({ pushes: true, bounded: true })
  })
})
