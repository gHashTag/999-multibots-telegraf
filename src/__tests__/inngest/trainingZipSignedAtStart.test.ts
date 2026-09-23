/**
 * The helper in trainingZipAccess.ts can only protect the face archives if the
 * two places that actually call Replicate use it. This pins the wiring at the
 * source level — a unit test of the helper passes happily while
 * `input_images: eventData.zipUrl` sits in the function untouched.
 *
 * Source-level rather than behavioural because both functions are Inngest
 * functions whose provider call cannot be reached without live Replicate and
 * Supabase credentials; what is being pinned is which value reaches the
 * provider and which value reaches a log line.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(__dirname, '..', '..')

const CALL_SITES = [
  path.join(
    ROOT,
    'inngest_app',
    'functions',
    'training',
    'generateModelTraining.ts'
  ),
  path.join(
    ROOT,
    'inngest_app',
    'functions',
    'existing',
    'generateModelTrainingFunction.ts'
  ),
]

const stripComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (m, p1) => p1 + ' '.repeat(m.length - p1.length)
    )

const code = (file: string) => stripComments(fs.readFileSync(file, 'utf8'))

/**
 * Paren-balanced span of every logger and console call, so a multi-line object
 * argument is captured whole and nothing beyond the call is swallowed. Same
 * shape as the helper in scenes/biometric-zip-url-not-logged.test.ts.
 */
function logBlocks(src: string): string[] {
  const out: string[] = []
  const re = /(?:logger|console)\.(?:log|error|warn|info|debug)\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    let depth = 0
    let i = m.index + m[0].length - 1
    for (; i < src.length; i++) {
      if (src[i] === '(') depth++
      else if (src[i] === ')') {
        depth--
        if (depth === 0) break
      }
    }
    out.push(src.slice(m.index, i + 1))
  }
  return out
}

describe.each(CALL_SITES.map(f => [path.basename(f), f] as const))(
  '%s hands Replicate a freshly signed link',
  (_name, file) => {
    it('signs the archive at the call site', () => {
      expect(code(file)).toMatch(/signTrainingZipUrl\(\s*eventData\.zipUrl/)
    })

    it('never passes the stored URL as input_images', () => {
      const s = code(file)
      expect(
        /input_images:\s*eventData\.zipUrl/.test(s),
        'the stored (possibly public) URL still goes to the provider'
      ).toBe(false)
      expect(s).toMatch(/input_images:\s*inputImagesUrl/)
    })

    it('signs inside the step that starts the training, so a retry re-signs', () => {
      const s = code(file)
      const signAt = s.indexOf('signTrainingZipUrl(')
      const createAt = s.indexOf('trainings.create(')
      expect(signAt).toBeGreaterThan(-1)
      expect(createAt).toBeGreaterThan(-1)
      // Signed immediately before the provider call, not hoisted out of the
      // retried step and memoised.
      expect(signAt).toBeLessThan(createAt)
    })

    it('keeps the stored reference in our own table unchanged', () => {
      expect(code(file)).toMatch(/zip_url:\s*eventData\.zipUrl/)
    })

    it('no log line carries the raw zip URL', () => {
      const s = code(file)
      const leaking = logBlocks(s)
        // A reference wrapped in the redactor is the allowed shape.
        .map(b => b.replace(/redactTrainingZipUrl\([^)]*\)/g, 'REDACTED'))
        .filter(b => /eventData\.zipUrl|\bzipUrl\b/.test(b))
      expect(
        leaking,
        `a log line still carries the signed archive URL:\n${leaking.join(
          '\n---\n'
        )}`
      ).toEqual([])
    })

    it('does not reintroduce substring() as a stand-in for redaction', () => {
      const s = code(file)
      expect(/zipUrl\.substring\(/.test(s)).toBe(false)
    })
  }
)
