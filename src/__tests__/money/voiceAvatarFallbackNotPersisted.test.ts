/**
 * Ratchet: createVoiceAvatar must NOT persist the STOCK fallback voice over the
 * user's real clone, nor advance the quest level, on the Cloudflare-block path.
 *
 * On a Cloudflare block createVoiceAvatar substitutes the stock Rachel id
 * ('EXAVITQu4vr4xnSDxMaL') and returns isFallback:true. The caller
 * (voiceAvatarWizard:152) already skips the CHARGE when isFallback -- but the
 * persistent side effects (supabase.update({ voice_id_elevenlabs }) and
 * updateUserLevelPlusOne) used to fire unconditionally, so a transient
 * Cloudflare outage OVERWROTE a previously created real clone with stock Rachel
 * (destroying a paid artifact) and marked the quest step done on a voice the
 * user never made -- violating the function's own "couple the level to a real,
 * saved voice" invariant. getVoiceId returns the Rachel fallback when
 * voice_id_elevenlabs is null, so downstream TTS still works without persisting.
 *
 * The fix wraps BOTH side effects in if (!isCloudflareBlocked). This pins that
 * the voice_id_elevenlabs update AND the level bump each sit inside a
 * !isCloudflareBlocked guard's then-branch. Skip/guard direction (persists
 * less, adds no credit, mirrors the existing no-charge-on-fallback) ->
 * autonomous. Found by wave22 adversarial review; loop-fable iter257.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILE = path.resolve(
  __dirname,
  '../../services/plan_b/createVoiceAvatar.ts'
)

// Is 'expr' the guard condition !isCloudflareBlocked (or isCloudflareBlocked === false)?
function isCloudflareGuardCond(expr: ts.Expression): boolean {
  if (
    ts.isPrefixUnaryExpression(expr) &&
    expr.operator === ts.SyntaxKind.ExclamationToken &&
    ts.isIdentifier(expr.operand) &&
    expr.operand.text === 'isCloudflareBlocked'
  ) {
    return true
  }
  if (
    ts.isBinaryExpression(expr) &&
    expr.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
    ts.isIdentifier(expr.left) &&
    expr.left.text === 'isCloudflareBlocked' &&
    expr.right.kind === ts.SyntaxKind.FalseKeyword
  ) {
    return true
  }
  return false
}

// Does 'node' have an ancestor if(!isCloudflareBlocked){...} with node inside its THEN branch?
function guardedByCloudflareCheck(node: ts.Node): boolean {
  let cur: ts.Node | undefined = node
  const start = node.getStart()
  const end = node.getEnd()
  while (cur && cur.parent) {
    const p = cur.parent
    if (
      ts.isIfStatement(p) &&
      isCloudflareGuardCond(p.expression) &&
      p.thenStatement.getStart() <= start &&
      end <= p.thenStatement.getEnd()
    ) {
      return true
    }
    cur = p
  }
  return false
}

function analyze(source: string): {
  updateFound: boolean
  updateGuarded: boolean
  levelBumpFound: boolean
  levelBumpGuarded: boolean
} {
  const sf = ts.createSourceFile('r.ts', source, ts.ScriptTarget.Latest, true)
  let updateFound = false
  let updateGuarded = false
  let levelBumpFound = false
  let levelBumpGuarded = false

  const visit = (n: ts.Node): void => {
    // supabase...update({ voice_id_elevenlabs: ... })
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === 'update' &&
      n.arguments.length >= 1 &&
      ts.isObjectLiteralExpression(n.arguments[0]) &&
      n.arguments[0].properties.some(
        p =>
          p.name !== undefined &&
          ts.isIdentifier(p.name) &&
          p.name.text === 'voice_id_elevenlabs'
      )
    ) {
      updateFound = true
      if (guardedByCloudflareCheck(n)) updateGuarded = true
    }
    // updateUserLevelPlusOne(...)
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === 'updateUserLevelPlusOne'
    ) {
      levelBumpFound = true
      if (guardedByCloudflareCheck(n)) levelBumpGuarded = true
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return { updateFound, updateGuarded, levelBumpFound, levelBumpGuarded }
}

describe('createVoiceAvatar does not persist the stock fallback voice (no clone overwrite)', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const a = analyze(source)

  it('floor: the voice_id_elevenlabs update and the level bump still exist', () => {
    expect(a.updateFound).toBe(true)
    expect(a.levelBumpFound).toBe(true)
  })

  it('the voice_id_elevenlabs update is gated by !isCloudflareBlocked', () => {
    expect(a.updateGuarded).toBe(true)
  })

  it('the quest level bump is gated by !isCloudflareBlocked', () => {
    expect(a.levelBumpGuarded).toBe(true)
  })

  it('self-check: an unguarded update/level-bump is detected', () => {
    const bad = `async function f() {
      await supabase.from('users').update({ voice_id_elevenlabs: voiceId }).eq('telegram_id', telegram_id)
      if (level === 6) { await updateUserLevelPlusOne(telegram_id, level) }
    }`
    const rb = analyze(bad)
    expect(rb.updateFound).toBe(true)
    expect(rb.updateGuarded).toBe(false)
    expect(rb.levelBumpGuarded).toBe(false)

    const good = `async function f() {
      if (!isCloudflareBlocked) {
        await supabase.from('users').update({ voice_id_elevenlabs: voiceId }).eq('telegram_id', telegram_id)
        if (level === 6) { await updateUserLevelPlusOne(telegram_id, level) }
      }
    }`
    const rg = analyze(good)
    expect(rg.updateGuarded).toBe(true)
    expect(rg.levelBumpGuarded).toBe(true)
  })

  it('mutation: neutralizing the real guard condition turns the check RED', () => {
    // Revert the fix (defeat the !isCloudflareBlocked guard) and prove RED.
    const mutated = source.replace('if (!isCloudflareBlocked) {', 'if (true) {')
    expect(mutated).not.toEqual(source)
    const m = analyze(mutated)
    expect(m.updateGuarded).toBe(false)
    expect(m.levelBumpGuarded).toBe(false)
  })
})
