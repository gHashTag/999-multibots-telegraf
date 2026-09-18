import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// Function-GRANULAR Inngest registration completeness (money: charged-not-delivered).
//
// registration.test.ts already guards this class at MODULE granularity: a file
// counts as registered if ANY ONE of its functions is referenced in the
// allFunctionsRaw serve() array. That leaves a finer gap this test closes: a NEW
// `export const X = createFunction(...)` added to an ALREADY-registered file, but
// forgotten in the array, is silently never served. If a paid scene dispatches
// its event, the charge lands with no delivery -- the exact class
// docs/audit/unregistered-functions.md documents three times (PR #507/#508/#510).
//
// Invariant: every `export const X = (inngest.)?createFunction(...)` name under
// inngest_app/functions is either a member of the serve() array, or an
// explicitly reviewed UNREGISTERED entry (dead/disabled -- each with the reason
// its event has no live paid path, e.g. the sender refuses honestly).

const ROOT = path.join(__dirname, '..', '..', 'inngest_app')
const FUNCTIONS_DIR = path.join(ROOT, 'functions')
const REGISTRY = path.join(ROOT, 'registerFunctions.ts')

// Strip //... and /* ... */ so a commented-out registration counts as absent.
const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

const walk = (d: string): string[] =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
    const p = path.join(d, e.name)
    if (e.isDirectory()) return walk(p)
    return e.isFile() && p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : []
  })

// Names defined as `export const X = (inngest.)?createFunction(`.
export function definedFunctionNames(source: string): string[] {
  const clean = stripComments(source)
  const re =
    /export\s+const\s+([A-Za-z_]\w*)\s*=\s*(?:inngest\.)?createFunction\s*\(/g
  const names: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(clean))) names.push(m[1])
  return names
}

// Identifiers listed in the allFunctionsRaw = [ ... ] array (comments stripped,
// so a commented-out entry does NOT count as registered).
export function registeredArrayNames(registrySource: string): Set<string> {
  const m = registrySource.match(/allFunctionsRaw\s*=\s*\[([\s\S]*?)\n\]/)
  if (!m) return new Set()
  const body = stripComments(m[1])
  const names = body
    .split(/[,\n]/)
    .map(s => s.trim())
    .filter(s => /^[A-Za-z_]\w*$/.test(s))
  return new Set(names)
}

// Reviewed dead/disabled functions. Each is defined but intentionally not served;
// the reason states why no paid path loses money to it.
const UNREGISTERED: Record<string, string> = {
  voiceTrainingStart:
    'voice/training.start has no served listener; voiceTrainingWizard refuses via VOICE_TRAINING_DISCONNECTED=true BEFORE charging (paid-wizard-guard-ratchet pins this)',
  voiceTrainingCompleted:
    'same file voiceTrainingRVC.ts; voice training disconnected (see voiceTrainingStart)',
  instagramScraperV2:
    'commented out in registerFunctions (missing schema exports); generateInstagramScraping returns success:false so instagramParserScene does not charge',
  createInstagramUser:
    'same file instagramScraper-v2.ts; instagram scraper-v2 disabled (see instagramScraperV2)',
  generateModelTraining:
    'dead duplicate; the served path is generateModelTrainingFunction (functions/existing) -- docs/audit/unregistered-functions.md PR #507',
  testAdvancedLoopFunction: 'e2e/test-only function, not a product path',
  testSimpleFunction: 'e2e/test-only function, not a product path',
  testSimpleMessageFunction: 'e2e/test-only function, not a product path',
  // Withdrawn 2026-09-17 (spec of record: specs/functions/<id>.t27 in t27,
  // CONTROL code-only/unregistered; manifest control says the same).
  modelTrainingV2:
    'withdrawn 2026-09-17: get-bot serializes the Telegraf instance into a step output, DB write after the paid call, no BFL completion handler; no sender in the repo (scripts/orphan-events.cjs), so no paid path reaches it',
  neuroImageGeneration:
    'withdrawn 2026-09-17: nothing sends neuro/image.generate (scripts/orphan-events.cjs); charges before generating with no refund and no inv_id',
  renderAvatarVideoFunction:
    'withdrawn 2026-09-17: hedra/heygen/kieAI/elevenLabs are stub services; no sender in the repo; no charge in the function',
  analyzeCompetitorReels:
    'withdrawn 2026-09-17: saveReelsAnalysis is a stub while RapidAPI is paid; no balance charge in the function',
  findCompetitors:
    'withdrawn 2026-09-17: saveCompetitors is a stub while RapidAPI is paid; no balance charge in the function',
}

describe('Inngest function-granular registration (charged-not-delivered class)', () => {
  it('extractors work on a synthetic snippet (control can fail)', () => {
    const src = [
      'export const alpha = inngest.createFunction({id:"a"}, {event:"e"}, async()=>{})',
      'export const beta = createFunction({id:"b"}, {event:"f"}, async()=>{})',
      'const notExported = createFunction({}, {}, async()=>{})',
    ].join('\n')
    expect(definedFunctionNames(src)).toEqual(['alpha', 'beta'])
    const reg = registeredArrayNames(
      'const allFunctionsRaw = [\n  alpha,\n  // beta,\n]'
    )
    expect(reg.has('alpha')).toBe(true)
    expect(reg.has('beta')).toBe(false) // commented-out => not registered
  })

  const defined = walk(FUNCTIONS_DIR).flatMap(f =>
    definedFunctionNames(fs.readFileSync(f, 'utf8'))
  )
  const registered = registeredArrayNames(fs.readFileSync(REGISTRY, 'utf8'))

  it('parsing finds definitions and registrations (a broken matcher fails)', () => {
    expect(defined.length).toBeGreaterThan(20)
    expect(registered.size).toBeGreaterThan(15)
  })

  it('every defined function is served or a reviewed UNREGISTERED entry', () => {
    const unexplained = defined.filter(
      n => !registered.has(n) && !(n in UNREGISTERED)
    )
    expect(
      unexplained,
      `Inngest function defined but neither in the serve() array nor UNREGISTERED. ` +
        `If it should run, add it to allFunctionsRaw in registerFunctions.ts; if it ` +
        `is dead/disabled, add it to UNREGISTERED with why no paid path loses money ` +
        `to it:\n` +
        unexplained.map(n => `  ${n}`).join('\n')
    ).toEqual([])
  })

  it('no UNREGISTERED entry is actually served (self-heal on registration)', () => {
    const stale = Object.keys(UNREGISTERED).filter(n => registered.has(n))
    expect(stale, 'these are now served -- remove from UNREGISTERED').toEqual(
      []
    )
  })

  it('no UNREGISTERED entry names a function that no longer exists', () => {
    const gone = Object.keys(UNREGISTERED).filter(n => !defined.includes(n))
    expect(
      gone,
      'these are no longer defined -- remove from UNREGISTERED'
    ).toEqual([])
  })
})
