/**
 * The LoRA face-training ZIP is biometric PII (10+ personal face photos). It
 * must not land in a public bucket handed out via getPublicUrl — that exposed
 * every user's face set to anyone with (or guessing) the URL.
 *
 * This pins, at the source level, that uploadTrainFluxModelScene uploads the ZIP
 * to a PRIVATE bucket and passes the training provider a SIGNED URL, never a
 * public one. A source-level seam test (rather than driving the whole wizard)
 * because the security property is "which storage API is used", and it stays
 * meaningful even though the runtime upload cannot be exercised without live
 * Supabase credentials.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.join(
  __dirname,
  '..',
  '..',
  'scenes',
  'uploadTrainFluxModelScene',
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

describe('training ZIP (biometric PII) goes to a private bucket, not a public URL', () => {
  it('creates the training bucket as private', () => {
    const s = code()
    expect(
      /createBucket\([^)]*public:\s*false/.test(s),
      'the training bucket is not created private'
    ).toBe(true)
  })

  it('hands the provider a signed URL, never a public one, for the ZIP', () => {
    const s = code()
    expect(/createSignedUrl\s*\(/.test(s), 'no signed URL is minted').toBe(true)
    // The ZIP url fed to the training event must be the signed one.
    expect(/const zipUrl = signedData\.signedUrl/.test(s)).toBe(true)
    // And it must not fall back to a public URL for the ZIP.
    expect(s.includes('getPublicUrl'), 'the ZIP still uses a public URL').toBe(
      false
    )
  })

  it('fails closed if the signed URL cannot be minted (no public leak)', () => {
    const s = code()
    expect(
      /if \(signedError \|\| !signedData\?\.signedUrl\)[\s\S]{0,120}throw/.test(
        s
      ),
      'a failed signing does not stop the flow'
    ).toBe(true)
  })
})
