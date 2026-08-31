/**
 * Ratchet: the free-superhero generation is guarded against a quota-bypass race.
 *
 * The 3/month free-superhero quota is checked at scene ENTRY but the counter is
 * incremented only AFTER generation. In webhook mode each rapid hero-button tap
 * is a separate concurrent request, so without an in-flight guard a burst of
 * taps all pass the stale entry gate and each generate a free paid image
 * (billed to the bot owner). The fix adds a per-user in-flight Map
 * (superheroGenInFlight.set/delete) plus a quota RE-CHECK
 * (checkSuperheroGenerationUsage) right before generation.
 *
 * This pins it: the paid generation call is preceded by an in-flight
 * superheroGenInFlight.set, and there is more than one
 * checkSuperheroGenerationUsage call (entry gate + pre-generation re-check).
 *
 * loop-fable iter199 (backlog from bug-hunt-wave4).
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILE = path.resolve(
  __dirname,
  '../../scenes/avatarTransformScene/index.ts'
)

const GEN_FNS = new Set([
  'generateNanoBanana',
  'generateFluxKontextMax',
  'generateFluxKontext',
])

function callName(n: ts.CallExpression): string {
  const e = n.expression
  return ts.isIdentifier(e)
    ? e.text
    : ts.isPropertyAccessExpression(e)
      ? e.name.text
      : ''
}

/** Position of the first `superheroGenInFlight.set(...)` call, or -1. */
function analyze(source: string) {
  const sf = ts.createSourceFile(
    'avatarTransformScene.ts',
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS
  )
  let inFlightSetPos = -1
  let firstGenPos = -1
  const quotaCheckPositions: number[] = []
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n)) {
      const name = callName(n)
      const pos = n.getStart(sf)
      if (
        ts.isPropertyAccessExpression(n.expression) &&
        n.expression.name.text === 'set' &&
        ts.isIdentifier(n.expression.expression) &&
        n.expression.expression.text === 'superheroGenInFlight'
      ) {
        if (inFlightSetPos === -1) inFlightSetPos = pos
      }
      if (GEN_FNS.has(name)) {
        if (firstGenPos === -1 || pos < firstGenPos) firstGenPos = pos
      }
      if (name === 'checkSuperheroGenerationUsage')
        quotaCheckPositions.push(pos)
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return { inFlightSetPos, firstGenPos, quotaCheckPositions }
}

describe('avatarTransform free-superhero generation is quota-race-guarded', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const { inFlightSetPos, firstGenPos, quotaCheckPositions } = analyze(source)

  it('self-check: detector finds the in-flight set and gen positions', () => {
    const guarded = `superheroGenInFlight.set(id, t); await generateNanoBanana({})`
    const bare = `await generateNanoBanana({})`
    const g = analyze(guarded)
    expect(g.inFlightSetPos).toBeGreaterThanOrEqual(0)
    expect(g.firstGenPos).toBeGreaterThan(g.inFlightSetPos)
    expect(analyze(bare).inFlightSetPos).toBe(-1)
  })

  it('matcher is not stale: the scene still calls a paid generator', () => {
    expect(firstGenPos).toBeGreaterThanOrEqual(0)
  })

  it('an in-flight set precedes the paid generation', () => {
    expect(
      inFlightSetPos >= 0 && inFlightSetPos < firstGenPos,
      `avatarTransformScene runs a paid generator with no preceding ` +
        `superheroGenInFlight.set -- concurrent taps bypass the free quota. ` +
        `(inFlightSetPos=${inFlightSetPos}, firstGenPos=${firstGenPos})`
    ).toBe(true)
  })

  it('the quota is re-checked between the in-flight set and the generation', () => {
    // A weak ">= 2 checks" floor would pass on the entry gate + the post-
    // generation display check even without the pre-generation re-check
    // (mutation-caught). Require a check positioned AFTER the in-flight set and
    // BEFORE the generation -- that is the sequential-window re-check.
    const recheck = quotaCheckPositions.some(
      p => p >= inFlightSetPos && p < firstGenPos
    )
    expect(
      recheck,
      `avatarTransformScene does not re-check checkSuperheroGenerationUsage ` +
        `between acquiring the in-flight lock and generating; a sequential tap ` +
        `could exceed the free quota. (checks=${JSON.stringify(quotaCheckPositions)}, ` +
        `set=${inFlightSetPos}, gen=${firstGenPos})`
    ).toBe(true)
  })
})
