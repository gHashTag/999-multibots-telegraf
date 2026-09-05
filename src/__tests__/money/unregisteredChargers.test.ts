import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const { matchCode } = require('../../../scripts/lib/blank-code.cjs')

/**
 * An Inngest handler that carries money but is not registered is one line away
 * from changing what users pay -- in EITHER direction.
 *
 * Three exist, and they are three different situations. That is the point of
 * pinning them: the file's registration state is the whole difference between
 * a documented condition and a money incident.
 *
 *   functions/neuroImageGeneration.ts
 *     A duplicate of the REGISTERED paid photo flow, listening to the same
 *     event. Registering it double-charges a paid generation (it.198).
 *
 *   functions/training/generateModelTraining.ts
 *     The reverse. The registered handler for model/training.start
 *     (existing/generateModelTrainingFunction.ts) has ZERO money calls; the
 *     charge lives here, unregistered. That is why model training has been
 *     free since November 2025 -- a documented owner decision, not an accident.
 *     Registering this file STARTS charging for training.
 *
 *   functions/training/voiceTrainingRVC.ts
 *     Owner queue item 10: voice training is switched off deliberately, the
 *     scene refuses at entry, and this handler stays unregistered until the
 *     owner decides otherwise.
 *
 * So the set must not change silently. A NEW unregistered charger means a
 * money path someone forgot to connect or deliberately parked; a file LEAVING
 * this set means money behaviour just changed for real users.
 */

const REPO = path.resolve(__dirname, '..', '..', '..')
const INNGEST = path.join(REPO, 'src', 'inngest_app')
const REGISTRY = path.join(INNGEST, 'registerFunctions.ts')

const MONEY =
  /\b(updateUserBalance|processBalanceOperation|processBalanceVideoOperationHelper|directPaymentProcessor|refundUser|setPayments|createSuccessfulPayment|deductBalanceAfterSuccess|updateUserBalanceAdapter|processBalanceOperationAdapter)\s*\(/g

/** Modules the registry hands to serve(). */
function registeredModules(): Set<string> {
  const raw = fs.readFileSync(REGISTRY, 'utf8')
  const imported: Record<string, string> = {}
  for (const m of matchCode(
    raw,
    /import\s+\{([^}]*)\}\s+from\s+['"`](\.[^'"`]+)['"`]/g
  )) {
    for (const n of m[1]
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)) {
      imported[n.split(' as ').pop() as string] = m[2]
    }
  }
  const out = new Set<string>()
  for (const m of matchCode(raw, /^\s*(\w+),\s*$/gm)) {
    const mod = imported[m[1]]
    if (mod) out.add(path.normalize(path.join(INNGEST, mod)) + '.ts')
  }
  return out
}

/** Handler files that move money, split by whether the registry serves them. */
function chargers(): { registered: string[]; unregistered: string[] } {
  const reg = registeredModules()
  const registered: string[] = []
  const unregistered: string[] = []
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) {
        walk(p)
        continue
      }
      if (!p.endsWith('.ts') || p.includes('__tests__')) continue
      const raw = fs.readFileSync(p, 'utf8')
      if (!/createFunction\s*\(/.test(raw)) continue
      if (matchCode(raw, MONEY).length === 0) continue
      ;(reg.has(p) ? registered : unregistered).push(path.relative(REPO, p))
    }
  }
  walk(INNGEST)
  return { registered, unregistered }
}

/** The three that are unregistered on purpose, and what registering each means. */
const KNOWN: Record<string, string> = {
  'src/inngest_app/functions/neuroImageGeneration.ts':
    'duplicate of the registered paid photo flow -- registering DOUBLE-charges',
  'src/inngest_app/functions/training/generateModelTraining.ts':
    'the charge for model training lives here while the live handler has none -- registering STARTS charging',
  'src/inngest_app/functions/training/voiceTrainingRVC.ts':
    'voice training is off by owner decision (queue item 10)',
}

describe('unregistered money handlers are a known, fixed set', () => {
  it('the census still sees every file it judges', () => {
    // Without this, an under-finding matcher passes the whole file vacuously:
    // the two set comparisons below both go green when the census returns
    // nothing, because an empty list contains no violation either.
    //
    // So the liveness check is deliberately NOT a count. A count floor would
    // also fire when a file legitimately changes side, and then the failure
    // message would say 'collapsed' about something that did not collapse.
    // This asks only: can the census still find the files it reasons about?
    const { registered, unregistered } = chargers()
    const seen = new Set([...registered, ...unregistered])
    expect(
      Object.keys(KNOWN).filter(f => !seen.has(f)),
      'the census no longer sees a file it makes claims about -- the matcher ' +
        'or the walk is broken, and the checks below prove nothing'
    ).toEqual([])
    // Measured, not guessed: 3 registered chargers today (generation/
    // neuroImageGeneration, payments/paymentProcessing, training/
    // modelTrainingV2). The first floor written here was >5, invented rather
    // than measured, and it failed on its first run.
    expect(registered.length, 'no registered side at all').toBeGreaterThan(0)
  })

  it('no NEW unregistered handler carries money', () => {
    const extra = chargers().unregistered.filter(f => !(f in KNOWN))
    expect(
      extra,
      'an Inngest handler moves money and is not registered. Either it is a ' +
        'money path nobody connected, or a parked one that needs a reason ' +
        'recorded here:\n' +
        extra.join('\n')
    ).toEqual([])
  })

  it('none of the three has been registered', () => {
    // Leaving this set is a REAL money change: double charging in one case,
    // starting to charge for training in another. The failure must name which.
    const nowRegistered = chargers().registered.filter(f => f in KNOWN)
    expect(
      nowRegistered.map(f => `${f} -- ${KNOWN[f]}`),
      'a parked money handler is now registered; this changes what users pay'
    ).toEqual([])
  })

  it('the registered training handler still carries no charge', () => {
    // The owner queue states model training has been free since Nov 2025.
    // That claim rests entirely on this file having no money call, so it is
    // checked here rather than believed.
    const live = path.join(
      INNGEST,
      'functions',
      'existing',
      'generateModelTrainingFunction.ts'
    )
    expect(fs.existsSync(live), 'the live training handler moved').toBe(true)
    const hits = matchCode(fs.readFileSync(live, 'utf8'), MONEY)
    expect(
      hits.map((h: RegExpMatchArray) => h[1]),
      'the live training handler now charges -- the owner queue says training is free'
    ).toEqual([])
  })
})
