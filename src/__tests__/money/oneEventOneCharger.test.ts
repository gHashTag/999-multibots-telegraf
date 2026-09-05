import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const { matchCode } = require('../../../scripts/lib/blank-code.cjs')

/**
 * One event must not have two REGISTERED handlers that both move money.
 *
 * Inngest fan-out is legitimate and common: several functions may listen to
 * one event, and the SDK encourages it. What is never legitimate is two of
 * them charging for the same event -- the user pays twice for one action, and
 * nothing in the platform prevents it. Duplicate function IDS do throw
 * (`Duplicate function ID` in InngestCommHandler), but two DIFFERENT functions
 * on one event is exactly the supported case, so the SDK is silent here.
 *
 * This is not hypothetical. `neuro/photo.generate` has two handlers today:
 *
 *   functions/generation/neuroImageGeneration.ts   registered, 1 money call
 *   functions/neuroImageGeneration.ts              NOT registered, 2 money calls
 *
 * The second is a complete duplicate of a paid flow, imported nowhere. Nothing
 * is double-charged, because it is dead -- but it reads like an ordinary
 * handler for that event, and adding it to registerFunctions would create a
 * double charge on a paid photo generation the moment it shipped.
 *
 * So the rule is about the REGISTERED set, not about files on disk: a dead
 * duplicate is a hazard, a registered one is a defect.
 */

const REPO = path.resolve(__dirname, '..', '..', '..')
const INNGEST = path.join(REPO, 'src', 'inngest_app')
const REGISTRY = path.join(INNGEST, 'registerFunctions.ts')

const MONEY =
  /\b(updateUserBalance|processBalanceOperation|processBalanceVideoOperationHelper|directPaymentProcessor|refundUser|setPayments|createSuccessfulPayment|deductBalanceAfterSuccess|updateUserBalanceAdapter|processBalanceOperationAdapter)\s*\(/g

/** Modules whose functions the registry actually registers. */
function registeredModules(): string[] {
  const raw = fs.readFileSync(REGISTRY, 'utf8')
  const imported: Record<string, string> = {}
  const IMPORT = /import\s+\{([^}]*)\}\s+from\s+['"`](\.[^'"`]+)['"`]/g
  for (const m of matchCode(raw, IMPORT)) {
    for (const name of m[1]
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)) {
      imported[name.split(' as ').pop() as string] = m[2]
    }
  }
  // the array of functions handed to serve(): bare identifiers, one per line
  const out = new Set<string>()
  for (const m of matchCode(raw, /^\s*(\w+),\s*$/gm)) {
    const mod = imported[m[1]]
    if (mod) out.add(path.normalize(path.join(INNGEST, mod)) + '.ts')
  }
  return [...out].filter(f => fs.existsSync(f))
}

/** event name -> registered handler files that move money. */
function chargersByEvent(): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const f of registeredModules()) {
    const raw = fs.readFileSync(f, 'utf8')
    const money = matchCode(raw, MONEY).length
    if (!money) continue
    for (const m of matchCode(raw, /\{\s*event\s*:\s*['"`]([^'"`]+)['"`]/g)) {
      ;(out[m[1]] ||= []).push(path.relative(REPO, f))
    }
  }
  return out
}

describe('one event, at most one registered charger', () => {
  it('the registry census is real, not empty', () => {
    // Zero registered modules would make the rule below vacuous, and the
    // resolver has to survive both `import { a } from` and multi-name imports.
    const mods = registeredModules()
    expect(
      mods.length,
      'no registered inngest functions resolved'
    ).toBeGreaterThan(20)
  })

  it('no event has two registered handlers that both move money', () => {
    const offenders = Object.entries(chargersByEvent())
      .filter(([, files]) => files.length > 1)
      .map(([event, files]) => `${event}: ${files.join(' + ')}`)
    expect(
      offenders,
      'two registered handlers charge for the same event -- one user action, ' +
        'two charges:\n' +
        offenders.join('\n')
    ).toEqual([])
  })

  it('the unregistered duplicate of the paid photo flow stays unregistered', () => {
    // Registering it would put two chargers on neuro/photo.generate. The test
    // above would catch that, but this says WHICH file and why, so the failure
    // names the decision rather than the symptom.
    const twin = path.join(INNGEST, 'functions', 'neuroImageGeneration.ts')
    if (!fs.existsSync(twin)) return // removed entirely: nothing to guard
    // Compare like for like: registeredModules() returns ABSOLUTE paths, and
    // comparing them against a repo-relative one meant this guard could never
    // fire. Mutation caught it -- the general rule went red while this, the
    // assertion that names the file, stayed green.
    expect(
      registeredModules().map(f => path.relative(REPO, f)),
      'functions/neuroImageGeneration.ts is a duplicate of the registered paid ' +
        'photo flow and carries its own money calls; registering it double-charges'
    ).not.toContain(path.relative(REPO, twin))
  })
})
