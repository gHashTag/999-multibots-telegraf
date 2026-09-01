/**
 * Ratchet: in createVoiceAvatar, the quest level bump (updateUserLevelPlusOne)
 * must run AFTER the voice_id_elevenlabs persist -- never before it.
 *
 * createVoiceAvatar (src/services/plan_b/createVoiceAvatar.ts) is the live
 * voice-avatar path (voiceAvatarWizard step 2). It writes the users table TWICE:
 * (1) advance level 6 -> 7, (2) save voice_id_elevenlabs. The bump used to run at
 * the TOP, before createVoiceElevenLabs and before the save, with no
 * compensation in the outer catch. So a non-Cloudflare ElevenLabs failure, a
 * missing voiceId, or a failed save unwound the function with level=7 persisted
 * but voice_id_elevenlabs=null: the quest marked the voice-avatar step done while
 * the artifact was missing, and downstream TTS/lipsync read a null voice_id (a
 * non-atomic two-write data-consistency bug found by the iter238 wave-8
 * data-consistency lens, adversarially + hand verified).
 *
 * Ordering the bump after the save couples the level advance to a real, saved
 * voice: on any failure the function throws before the bump, so the level does
 * not advance.
 *
 * This pins: every updateUserLevelPlusOne call sits AFTER the voice_id_elevenlabs
 * assignment in source. floor + self-check + real-source mutation.
 *
 * loop-fable iter238.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILE = path.resolve(
  __dirname,
  '../../services/plan_b/createVoiceAvatar.ts'
)

interface Positions {
  save: number // position of the voice_id_elevenlabs property assignment
  bump: number // position of the updateUserLevelPlusOne call
}

/** AST positions of the save and the level bump (-1 if absent). */
function positions(source: string): Positions {
  const sf = ts.createSourceFile(
    'createVoiceAvatar.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )
  let save = -1
  let bump = -1
  const visit = (n: ts.Node): void => {
    // The voice_id_elevenlabs persist: a property named voice_id_elevenlabs.
    if (
      save === -1 &&
      ts.isPropertyAssignment(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === 'voice_id_elevenlabs'
    ) {
      save = n.getStart(sf)
    }
    // The level bump: a call to updateUserLevelPlusOne(...).
    if (
      bump === -1 &&
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === 'updateUserLevelPlusOne'
    ) {
      bump = n.getStart(sf)
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return { save, bump }
}

/** True when the level bump runs strictly after the voice_id save. */
function bumpAfterSave(source: string): boolean {
  const { save, bump } = positions(source)
  return save >= 0 && bump >= 0 && bump > save
}

describe('createVoiceAvatar advances the quest level only after the voice is saved', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const p = positions(source)

  it('floor: both the voice_id save and the level bump are present', () => {
    expect(p.save).toBeGreaterThanOrEqual(0)
    expect(p.bump).toBeGreaterThanOrEqual(0)
  })

  it('the level bump runs AFTER the voice_id_elevenlabs save', () => {
    expect(
      bumpAfterSave(source),
      `updateUserLevelPlusOne runs BEFORE the voice_id_elevenlabs save in ` +
        `createVoiceAvatar. A voice-creation or save failure then leaves the ` +
        `level advanced with no saved voice (quest done, artifact missing). ` +
        `Move the bump after the save succeeds.`
    ).toBe(true)
  })

  it('self-check: detector distinguishes after-save from before-save order', () => {
    const good = `async function f(){ await supabase.from('users').update({ voice_id_elevenlabs: v }); if (level===6) await updateUserLevelPlusOne(id, level) }`
    const bad = `async function f(){ if (level===6) await updateUserLevelPlusOne(id, level); await supabase.from('users').update({ voice_id_elevenlabs: v }) }`
    expect(bumpAfterSave(good)).toBe(true)
    expect(bumpAfterSave(bad)).toBe(false)
  })

  it('mutation: moving the bump before the save turns the check RED', () => {
    const call = 'await updateUserLevelPlusOne(telegram_id, level)'
    expect(source.includes(call)).toBe(true)
    // Remove the real (post-save) call, then re-insert a copy before the save.
    let mutated = source.replace(call, '')
    mutated = mutated.replace(
      'const { error } = await supabase',
      `${call}\n    const { error } = await supabase`
    )
    expect(mutated).not.toEqual(source)
    expect(bumpAfterSave(mutated)).toBe(false)
  })
})
