/**
 * A voice-training recording is biometric PII, the same class as the LoRA
 * face-ZIP (#1137). It must not land in a public bucket handed out via
 * getPublicUrl — that exposed the user's voice to anyone with the URL.
 *
 * Source-level seam test (like trainingZipPrivateBucket / the render tests): the
 * voice upload uses a PRIVATE bucket and a SIGNED URL, never a public one, and a
 * signing failure refunds and leaves rather than leaking. The runtime upload
 * cannot be exercised without live Supabase credentials.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.join(
  __dirname,
  '..',
  '..',
  'scenes',
  'voiceTrainingWizard',
  'index.ts'
)

const stripComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (m, p1) => p1 + ' '.repeat(m.length - p1.length)
    )

const code = () => stripComments(fs.readFileSync(SRC, 'utf8'))

describe('voice-training audio (biometric PII) goes to a private bucket', () => {
  it('creates the training bucket as private', () => {
    expect(/createBucket\([^)]*public:\s*false/.test(code())).toBe(true)
  })

  it('stores a signed URL, never a public one, for the audio', () => {
    const s = code()
    expect(/createSignedUrl\s*\(/.test(s), 'no signed URL is minted').toBe(true)
    expect(/const storedAudioUrl = signedData\.signedUrl/.test(s)).toBe(true)
    expect(
      s.includes('getPublicUrl'),
      'the audio still uses a public URL'
    ).toBe(false)
  })

  it('refunds and leaves if the signed URL cannot be minted (no leak)', () => {
    const s = code()
    expect(
      /if \(signedError \|\| !signedData\?\.signedUrl\)[\s\S]{0,400}refundAndTell/.test(
        s
      ),
      'a failed signing does not refund/leave'
    ).toBe(true)
  })
})
