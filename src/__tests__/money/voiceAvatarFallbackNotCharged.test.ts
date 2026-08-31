/**
 * Ratchet: a Cloudflare-fallback (stock Rachel) voice is NOT charged as a clone.
 *
 * createVoiceAvatar clones the user's voice via ElevenLabs. On a Cloudflare
 * block it CATCHES the error and substitutes the stock Rachel voiceId
 * (EXAVITQu4vr4xnSDxMaL), then returned {voiceId} -- a success shape. The wizard
 * charges when voiceResult.voiceId is truthy, so the user was billed for a
 * clone that was never made (they got a generic stock voice). The wizard's own
 * comment says "charge only when a voice was actually created".
 *
 * Fix: createVoiceAvatar returns isFallback on the Cloudflare path, and the
 * wizard gates the voice-avatar charge on !isFallback. This pins BOTH halves.
 *
 * loop-fable iter205 (wave-10 catch-returns-success lens). Skip-direction (never
 * charges for the fallback) -> autonomous-safe; it never mints or refunds.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const SERVICE = path.resolve(
  __dirname,
  '../../services/plan_b/createVoiceAvatar.ts'
)
const WIZARD = path.resolve(
  __dirname,
  '../../scenes/voiceAvatarWizard/index.ts'
)

function subtreeHas(n: ts.Node, pred: (m: ts.Node) => boolean): boolean {
  let hit = false
  const w = (m: ts.Node): void => {
    if (pred(m)) hit = true
    m.forEachChild(w)
  }
  w(n)
  return hit
}

/** createVoiceAvatar returns an object with an isFallback property. */
function serviceSignalsFallback(source: string): boolean {
  const sf = ts.createSourceFile('s.ts', source, ts.ScriptTarget.Latest, true)
  let ok = false
  const visit = (n: ts.Node): void => {
    if (
      ts.isReturnStatement(n) &&
      n.expression &&
      ts.isObjectLiteralExpression(n.expression)
    ) {
      for (const p of n.expression.properties) {
        if (
          (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) &&
          p.name &&
          ts.isIdentifier(p.name) &&
          p.name.text === 'isFallback'
        ) {
          ok = true
        }
      }
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return ok
}

/**
 * The wizard's voice-avatar updateUserBalance charge sits inside an if whose
 * condition references isFallback (so a fallback is not charged).
 */
function wizardGatesChargeOnFallback(source: string): {
  hasVoiceCharge: boolean
  gated: boolean
} {
  const sf = ts.createSourceFile('w.ts', source, ts.ScriptTarget.Latest, true)
  let hasVoiceCharge = false
  let gated = false
  const visit = (n: ts.Node): void => {
    // updateUserBalance(...) whose args mention the voice-avatar charge
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === 'updateUserBalance' &&
      subtreeHas(
        n,
        m =>
          (ts.isStringLiteral(m) && /voice avatar/i.test(m.text)) ||
          (ts.isStringLiteral(m) && m.text === 'VOICE_AVATAR')
      )
    ) {
      hasVoiceCharge = true
      // walk up for an enclosing if whose condition references isFallback
      let p: ts.Node | undefined = n.parent
      while (p) {
        if (
          ts.isIfStatement(p) &&
          subtreeHas(
            p.expression,
            m => ts.isIdentifier(m) && m.text === 'isFallback'
          )
        ) {
          gated = true
          break
        }
        p = p.parent
      }
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return { hasVoiceCharge, gated }
}

describe('voice-avatar Cloudflare fallback is not charged as a clone', () => {
  const service = fs.readFileSync(SERVICE, 'utf8')
  const wizard = fs.readFileSync(WIZARD, 'utf8')
  const w = wizardGatesChargeOnFallback(wizard)

  it('createVoiceAvatar returns an isFallback signal', () => {
    expect(serviceSignalsFallback(service)).toBe(true)
  })

  // matcher-not-stale floor: the wizard still has the voice-avatar charge.
  it('the wizard still has the voice-avatar charge this ratchet guards', () => {
    expect(w.hasVoiceCharge).toBe(true)
  })

  it('the wizard gates the voice-avatar charge on isFallback', () => {
    expect(w.gated).toBe(true)
  })

  it('self-check: an ungated charge is detected', () => {
    const bad = `async function f(ctx){
      if (voiceResult?.voiceId && cost > 0) {
        await updateUserBalance(id, cost, T, 'Voice avatar creation', { service_type: 'VOICE_AVATAR' })
      }
    }`
    const r = wizardGatesChargeOnFallback(bad)
    expect(r.hasVoiceCharge).toBe(true)
    expect(r.gated).toBe(false)
  })
})
