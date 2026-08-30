/**
 * Every paid generation wizard must keep its in-flight guard.
 *
 * A wizard step that triggers a paid generation and stays on the step until the
 * ~10-30s await resolves double-charges on a fast second tap. The fix, applied
 * across the whole family, is one session flag per wizard: reject-before-set,
 * set synchronously, release in finally (see #1022/#1031/#1032/#1033/#1090/#1096).
 *
 * This ratchet keeps those guards from silently regressing: each known paid
 * wizard must still check its flag before setting it, set it, and release it.
 * A completeness check keeps the registry honest — any *InProgress guard in
 * src/scenes that is not listed here fails, so a new guarded wizard (or a renamed
 * flag) has to be registered rather than drifting uncovered.
 *
 * Scope: it asserts each guard is PRESENT, so it catches a guard removed from a
 * wizard entirely. A wizard that guards two steps (neuroPhoto, textToImage) is
 * not proven to still guard both if only one is dropped — the flag still appears
 * for the other. Total removal, the main regression, is caught.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// wizard file -> its in-flight guard flag
const GUARDED_PAID_WIZARDS: Record<string, string> = {
  'src/scenes/neuroPhotoWizard/index.ts': 'neuroPhotoInProgress',
  'src/scenes/textToSpeechWizard/index.ts': 'textToSpeechInProgress',
  'src/scenes/musicGenerationWizard/index.ts': 'musicGenerationInProgress',
  'src/scenes/videoTranscriptionWizard/index.ts':
    'videoTranscriptionInProgress',
  'src/scenes/aiPhotoshopScene/index.ts': 'aiPhotoshopInProgress',
  'src/scenes/lipSyncWizard/index.ts': 'lipSyncInProgress',
  'src/scenes/lipSyncWizard/ai-reels-wizard.ts': 'aiReelsInProgress',
  'src/scenes/instagramParserWizard/index.ts': 'instagramParserInProgress',
  'src/scenes/instagramParserScene/index.ts': 'instagramParserSceneInProgress',
  'src/scenes/neuroPhotoWizardV2/index.ts': 'neuroPhotoInProgress',
  'src/scenes/faceSwapWizard/index.ts': 'faceSwapInProgress',
  'src/scenes/textToImageWizard/index.ts': 'textToImageInProgress',
  'src/scenes/imageToVideoWizard/index.ts': 'imageToVideoInProgress',
  'src/scenes/textToVideoWizard/index.ts': 'textToVideoInProgress',
  'src/scenes/voiceAvatarWizard/index.ts': 'voiceAvatarInProgress',
  'src/scenes/morphingWizard/index.ts': 'morphingGenerationInProgress',
  'src/scenes/aiCoverWizard/index.ts': 'aiCoverGenerationInProgress',
  'src/scenes/imageToPromptWizard/index.ts': 'imageToPromptInProgress',
  'src/scenes/aiChatWizard/index.ts': 'aiChatInProgress',
  'src/scenes/chatWithAvatarWizard/index.ts': 'chatWithAvatarInProgress',
}

describe('paid wizards keep their in-flight guard', () => {
  for (const [file, flag] of Object.entries(GUARDED_PAID_WIZARDS)) {
    describe(path.basename(path.dirname(file)), () => {
      const src = fs.readFileSync(file, 'utf8')

      it(`arms ${flag} (set true) and releases it (set false)`, () => {
        expect(src, `${flag} is never set true`).toContain(`${flag} = true`)
        expect(src, `${flag} is never released`).toContain(`${flag} = false`)
      })

      it(`rejects a re-entry: checks ${flag} before setting it`, () => {
        const checkIdx = src.search(new RegExp(`if \\([^)]*${flag}\\)`))
        const setIdx = src.indexOf(`${flag} = true`)
        expect(checkIdx, `no "if (... ${flag})" guard`).toBeGreaterThan(-1)
        expect(
          checkIdx,
          'the guard must reject BEFORE it sets the flag'
        ).toBeLessThan(setIdx)
      })
    })
  }

  it('every *InProgress guard in src/scenes is registered here', () => {
    const registered = new Set(Object.values(GUARDED_PAID_WIZARDS))
    const found = new Set<string>()

    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) walk(p)
        else if (p.endsWith('.ts')) {
          const src = fs.readFileSync(p, 'utf8')
          for (const m of src.matchAll(/(\w+InProgress) = true/g)) {
            found.add(m[1])
          }
        }
      }
    }
    walk(path.join('src', 'scenes'))

    const unregistered = [...found].filter(f => !registered.has(f))
    expect(
      unregistered,
      `these in-flight guards are not in the registry:\n${unregistered.join('\n')}`
    ).toEqual([])
  })
})
