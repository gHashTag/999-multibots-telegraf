/**
 * A failed image generation must not orphan its downloaded temp file on disk.
 *
 * Each of these generators downloads the result to a local file (saveFileLocally)
 * and unlinks it on the success path — but if delivery threw afterwards, control
 * fell to the outer catch, which never removed the file, so it leaked on disk on
 * every failure (the #1029 class, previously fixed only for transcription).
 *
 * These generators are integration-only (they reach Supabase and the model API,
 * so their own tests skip without a live env), so this asserts the fix
 * structurally, the same way protected-routes / seedream-refund do:
 *   - a tempFileToCleanup handle, default null;
 *   - set to the saved path right after saveFileLocally;
 *   - unlinked in the outer catch when it is set (best-effort).
 * The success-path unlink is unchanged; the two paths are mutually exclusive, so
 * there is no double unlink.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'

const FILES = [
  'src/services/generateSeeDream4.ts',
  'src/services/generateSeeDream45.ts',
  'src/services/generateFluxKontextMax.ts',
  'src/services/generateQwenImageEditPlus.ts',
]

describe('image generators clean up their temp file on a failure path', () => {
  for (const file of FILES) {
    describe(file, () => {
      const src = fs.readFileSync(file, 'utf8')

      it('declares a tempFileToCleanup handle defaulting to null', () => {
        expect(src).toMatch(/let tempFileToCleanup: string \| null = null/)
      })

      it('arms the handle right after saving the file', () => {
        expect(src).toMatch(
          /savedImagePath = await saveFileLocally\([\s\S]{0,160}tempFileToCleanup = savedImagePath/
        )
      })

      it('unlinks the temp file in the outer catch when it is set', () => {
        expect(src).toMatch(
          /if \(tempFileToCleanup\)[\s\S]{0,120}fs\.unlinkSync\(tempFileToCleanup\)/
        )
      })
    })
  }
})
