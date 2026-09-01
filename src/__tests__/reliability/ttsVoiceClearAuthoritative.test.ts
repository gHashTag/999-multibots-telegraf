/**
 * Ratchet: createAudioFileFromText clears a user's saved voice_id_elevenlabs only
 * after an AUTHORITATIVE existence check -- never unconditionally on a 404.
 *
 * On an ElevenLabs TTS 404 the catch used to unconditionally
 * `users.update({ voice_id_elevenlabs: null }).eq('telegram_id', ...)`,
 * destroying the user's trained-voice pointer and forcing a full re-train. Any
 * transient/edge 404 (a routing blip, a model_id issue, a 404 whose detail is not
 * voice_not_found) wiped a valid voice. The hardened sibling validateAndCleanVoiceId
 * (helpers/voiceValidation.ts) clears the SAME column ONLY after
 * assertVoiceExistsAuthoritative returns a definitive false, and KEEPS the pointer
 * when existence is non-authoritative (missing/invalid key, outage, malformed
 * response -> the assert throws), with the explicit note that a non-authoritative
 * negative "would wipe every user's saved voice one row at a time during the
 * outage." This path now mirrors that. Found by the iter241 wave-10
 * unintended-overwrite lens, adversarially + hand verified. Live via
 * textToSpeechWizard + chatWithAvatarWizard.
 *
 * This pins: the voice_id_elevenlabs:null clear is preceded (in its function) by
 * an assertVoiceExistsAuthoritative call. floor + self-check + real-source mutation.
 *
 * loop-fable iter241.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILE = path.resolve(
  __dirname,
  '../../core/elevenlabs/createAudioFileFromText.ts'
)

interface Positions {
  clear: number // position of the voice_id_elevenlabs:null update
  assert: number // position of the assertVoiceExistsAuthoritative call
}

function positions(source: string): Positions {
  const sf = ts.createSourceFile(
    'createAudioFileFromText.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )
  let clear = -1
  let assert = -1
  const visit = (n: ts.Node): void => {
    // The destructive clear: a property `voice_id_elevenlabs: null`.
    if (
      clear === -1 &&
      ts.isPropertyAssignment(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === 'voice_id_elevenlabs' &&
      n.initializer.kind === ts.SyntaxKind.NullKeyword
    ) {
      clear = n.getStart(sf)
    }
    // The authoritative existence check call.
    if (
      assert === -1 &&
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === 'assertVoiceExistsAuthoritative'
    ) {
      assert = n.getStart(sf)
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return { clear, assert }
}

/** True when the clear is gated by a preceding authoritative check. */
function clearIsGated(source: string): boolean {
  const p = positions(source)
  return p.clear >= 0 && p.assert >= 0 && p.assert < p.clear
}

describe('TTS clears the saved voice pointer only on an authoritative negative', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const p = positions(source)

  it('floor: the destructive voice_id_elevenlabs clear is present', () => {
    expect(p.clear).toBeGreaterThanOrEqual(0)
  })

  it('the clear is preceded by an assertVoiceExistsAuthoritative check', () => {
    expect(
      clearIsGated(source),
      `createAudioFileFromText clears voice_id_elevenlabs without a preceding ` +
        `assertVoiceExistsAuthoritative check. An unconditional "404 -> clear" ` +
        `wipes a valid trained voice on any transient/edge 404. Gate the clear ` +
        `on a definitive negative and keep the pointer when the assert throws ` +
        `(mirror helpers/voiceValidation.ts).`
    ).toBe(true)
  })

  it('self-check: detector distinguishes a gated clear from an unconditional one', () => {
    const gated = `async function f(){ const gone = !(await assertVoiceExistsAuthoritative(v)); if(gone){ await supabase.from('users').update({ voice_id_elevenlabs: null }).eq('telegram_id', id) } }`
    const bare = `async function f(){ await supabase.from('users').update({ voice_id_elevenlabs: null }).eq('telegram_id', id) }`
    expect(clearIsGated(gated)).toBe(true)
    expect(clearIsGated(bare)).toBe(false)
  })

  it('mutation: removing the authoritative check turns the check RED', () => {
    const mutated = source.replace(
      /assertVoiceExistsAuthoritative/g,
      'voiceMissesEntirely'
    )
    expect(mutated).not.toEqual(source)
    expect(clearIsGated(mutated)).toBe(false)
  })
})
