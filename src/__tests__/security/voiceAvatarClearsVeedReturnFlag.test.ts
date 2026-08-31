/**
 * Ratchet: voiceAvatarWizard clears the veed-fabric return flag on leave.
 *
 * A veed-fabric lip-sync detour sets ctx.session.returnToVeedFabricAfterVoice
 * and enters the shared Voice scene; on success the Voice scene resumes lip-sync
 * from ctx.session.veedFabric (staged image + text). If the user ABANDONS the
 * detour (/cancel, invalid input, insufficient balance, error), that flag used
 * to survive in the shared session, so a LATER unrelated voice creation's
 * success re-entered VeedFabricLipSync on the OLD staged image+text -- a paid
 * generation the user never asked for (cross-scene session pollution).
 *
 * The fix registers a scene .leave() handler that deletes the flag on every
 * exit; the legitimate return path deletes it before ctx.scene.enter, so the
 * hook is a no-op there and leaves veedFabric intact for the resume. This pins
 * that handler.
 *
 * loop-fable iter202 (wave-7 session-crosswrite lens). Sibling of
 * aiPhotoshopMorphingEviction / trainingPhotosInvalidated.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILE = path.resolve(__dirname, '../../scenes/voiceAvatarWizard/index.ts')
const FLAG = 'returnToVeedFabricAfterVoice'

/** Does the subtree contain `delete <...>.returnToVeedFabricAfterVoice`? */
function deletesFlag(n: ts.Node): boolean {
  let found = false
  const walk = (m: ts.Node): void => {
    if (
      ts.isDeleteExpression(m) &&
      ts.isPropertyAccessExpression(m.expression) &&
      m.expression.name.text === FLAG
    ) {
      found = true
    }
    m.forEachChild(walk)
  }
  walk(n)
  return found
}

/**
 * Analyze one source: does some `<scene>.leave(fn)` handler delete the flag,
 * and does the file still reference the flag as a resume signal (floor)?
 */
function analyze(source: string): {
  leaveClearsFlag: boolean
  flagReferences: number
} {
  const sf = ts.createSourceFile(
    'voiceAvatarWizard.ts',
    source,
    ts.ScriptTarget.Latest,
    true
  )
  let leaveClearsFlag = false
  let flagReferences = 0
  const visit = (n: ts.Node): void => {
    if (ts.isIdentifier(n) && n.text === FLAG) flagReferences++
    // <expr>.leave(<fn>)
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === 'leave' &&
      n.arguments.length >= 1 &&
      deletesFlag(n.arguments[0])
    ) {
      leaveClearsFlag = true
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return { leaveClearsFlag, flagReferences }
}

describe('voiceAvatarWizard clears the veed-fabric return flag on leave', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const { leaveClearsFlag, flagReferences } = analyze(source)

  // matcher-not-stale floor: the resume mechanism must still exist -- the flag
  // is set on detour and checked on the success path. If it vanished entirely
  // this ratchet is guarding nothing; fail loud so it gets re-derived.
  it('the veed-fabric return-flag mechanism still exists', () => {
    // The pre-existing mechanism references the flag independently of the fix:
    // the success-path check (~line 173) and its delete (~line 177). Threshold 2
    // stays green when the leave hook is removed, so a mutation flips ONLY the
    // invariant test below, not this floor.
    expect(flagReferences).toBeGreaterThanOrEqual(2)
  })

  it('a scene leave() handler deletes returnToVeedFabricAfterVoice', () => {
    expect(leaveClearsFlag).toBe(true)
  })

  it('self-check: the analyzer requires the delete to live inside a leave() handler', () => {
    const withoutHook = `
      export const w = new Scenes.WizardScene('voice', async ctx => {
        if (ctx.session.returnToVeedFabricAfterVoice) {
          delete ctx.session.returnToVeedFabricAfterVoice
          return ctx.scene.enter('veed')
        }
      })`
    // the delete exists but NOT inside a leave() handler -> must not satisfy
    expect(analyze(withoutHook).leaveClearsFlag).toBe(false)
    const withHook =
      withoutHook +
      `\n      w.leave(async ctx => { delete ctx.session.returnToVeedFabricAfterVoice })`
    expect(analyze(withHook).leaveClearsFlag).toBe(true)
  })
})
