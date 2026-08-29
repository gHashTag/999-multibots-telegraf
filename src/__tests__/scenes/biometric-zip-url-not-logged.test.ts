/**
 * The training ZIP's public URL must not be written to logs.
 *
 * uploadTrainFluxModelScene bundles the user's face photos into a ZIP and uploads
 * it to a PUBLIC Supabase bucket, so getPublicUrl returns a permanent,
 * unauthenticated link to biometric PII. That URL used to be console.log'd — on
 * the upload line and again in the "Sending Inngest event" log — so anyone with
 * log access could GET another user's face photos. This asserts no console.log
 * carries zipUrl; it may still be passed to inngest.send (the training provider
 * needs it). Same secrets-in-logs class as #1105. The bucket being public at all
 * is the larger, owner-side exposure (private bucket + signed URLs).
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'

const SRC = fs.readFileSync(
  'src/scenes/uploadTrainFluxModelScene/index.ts',
  'utf8'
)

// crude console.log(...) span matcher (handles the multi-line object args here)
function consoleLogBlocks(src: string): string[] {
  const out: string[] = []
  const re = /console\.(log|error|warn|info)\(/g
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

describe('training ZIP upload does not log the public URL', () => {
  it('no console.* logs zipUrl (it may still be sent to inngest)', () => {
    const leaking = consoleLogBlocks(SRC).filter(b => /\bzipUrl\b/.test(b))
    expect(
      leaking.map(b => b.slice(0, 60)),
      'a console.* call logs the biometric public URL'
    ).toEqual([])
  })

  it('zipUrl is still available for the training event', () => {
    expect(SRC).toMatch(/const zipUrl = publicUrlData\.publicUrl/)
    expect(SRC).toMatch(/zipUrl, \/\/ HTTP URL from Supabase/)
  })
})
