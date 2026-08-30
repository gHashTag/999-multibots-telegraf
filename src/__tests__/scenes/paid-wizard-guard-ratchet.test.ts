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
  'src/scenes/lipSyncWizard/veed-fabric-wizard.ts': 'veedFabricInProgress',
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

/**
 * Completeness ratchet — the registry-blind meta-gap (#1373).
 *
 * The guard ratchet above only proves REGISTERED wizards keep their guard; it is
 * blind to a charging scene that has NO guard AND is not registered (exactly how
 * textToSpeech #1356 and neuroPhotoV2 #1343 slipped, and how the render
 * sub-cluster #1372 stayed hidden). This ratchet closes that: it defines the
 * population INDEPENDENTLY of the registry — every scene file that calls a spend
 * primitive must be either GUARDED (registered above), verified SAFE, or a
 * KNOWN_UNGUARDED gap tracked by an issue. A new unclassified charging scene
 * fails RED.
 *
 * Population signal (comments stripped): a real spend call —
 *   updateUserBalance(...MONEY_OUTCOME...) | processBalanceOperation( |
 *   processBalanceVideoOperationHelper(
 * A proxy, not exhaustive (a scene charging via yet another indirection is not
 * caught), but it covers the forms the double-charge cluster actually used. The
 * population-size floor below fails the suite if the matcher ever finds nothing,
 * so this control cannot silently pass by matching zero scenes.
 */

// Charging scenes NOT in GUARDED_PAID_WIZARDS, each with a reason. Two kinds,
// kept deliberately separate:
//   SAFE_NOT_CHARGEABLE  — verified NOT double-tap-chargeable.
const SAFE_NOT_CHARGEABLE: Record<string, string> = {
  'src/scenes/voiceTrainingWizard/index.ts':
    'DISABLED: const VOICE_TRAINING_DISCONNECTED=true makes the confirm action leave before the charge -> the charge is unreachable',
}

//   KNOWN_UNGUARDED_TRACKED — a REAL unguarded double-tap gap, tracked by an
//   issue. NOT safe. Listed here (not in the registry) so the gate stays green
//   while the gap is machine-tracked; each must move into GUARDED_PAID_WIZARDS
//   as it is fixed (the "not both" test below then forces its removal from here).
const KNOWN_UNGUARDED_TRACKED: Record<string, string> = {
  'src/scenes/lipSyncWizard/hedra-render-wizard.ts': '#1372',
  'src/scenes/lipSyncWizard/heygen-render-wizard.ts': '#1372',
  'src/scenes/lipSyncWizard/fal-render-wizard.ts': '#1372',
  'src/scenes/lipSyncWizard/ai-reels-render-wizard.ts': '#1372',
  'src/scenes/lipSyncWizard/ai-reels-inngest-wizard.ts':
    '#1372 (dead: not wired)',
}

const stripSceneComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (m, p1) => p1 + ' '.repeat(m.length - p1.length)
    )

const CHARGE_RE =
  /updateUserBalance\([\s\S]{0,400}?MONEY_OUTCOME|processBalanceOperation\(|processBalanceVideoOperationHelper\(/

describe('every charging scene is guarded or explicitly classified (#1373)', () => {
  const chargingScenes: string[] = []
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) {
        if (CHARGE_RE.test(stripSceneComments(fs.readFileSync(p, 'utf8')))) {
          chargingScenes.push(p.split(path.sep).join('/'))
        }
      }
    }
  }
  walk(path.join('src', 'scenes'))

  const guarded = new Set(Object.keys(GUARDED_PAID_WIZARDS))
  const safe = new Set(Object.keys(SAFE_NOT_CHARGEABLE))
  const tracked = new Set(Object.keys(KNOWN_UNGUARDED_TRACKED))

  it('finds a non-trivial charging-scene population (a broken matcher fails, not passes)', () => {
    expect(
      chargingScenes.length,
      'the charge matcher found too few scenes — it likely broke; fix it before trusting the checks below'
    ).toBeGreaterThanOrEqual(15)
  })

  it('every charging scene is guarded, marked safe, or tracked as a known gap', () => {
    const unclassified = chargingScenes.filter(
      f => !guarded.has(f) && !safe.has(f) && !tracked.has(f)
    )
    expect(
      unclassified,
      'these scenes CHARGE money but are neither guarded nor classified.\n' +
        'Add an in-flight guard + register in GUARDED_PAID_WIZARDS, or classify\n' +
        'in SAFE_NOT_CHARGEABLE / KNOWN_UNGUARDED_TRACKED with a reason:\n' +
        unclassified.join('\n')
    ).toEqual([])
  })

  it('no classification entry is stale (every listed file still exists and still charges)', () => {
    const listed = [
      ...Object.keys(SAFE_NOT_CHARGEABLE),
      ...Object.keys(KNOWN_UNGUARDED_TRACKED),
    ]
    const stale = listed.filter(f => !chargingScenes.includes(f))
    expect(
      stale,
      'these classification entries no longer match a charging scene (fixed / moved / renamed?) — remove or move them:\n' +
        stale.join('\n')
    ).toEqual([])
  })

  it('a file is never both guarded and allowlisted', () => {
    const both = [...safe, ...tracked].filter(f => guarded.has(f))
    expect(
      both,
      'listed as guarded AND allowlisted — once guarded, remove from the allowlist:\n' +
        both.join('\n')
    ).toEqual([])
  })
})
