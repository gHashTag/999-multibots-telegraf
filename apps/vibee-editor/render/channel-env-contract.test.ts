/**
 * THE NAMES THE CODE READS vs THE NAMES THE DEPLOY DEFINES.
 *
 * This is the defect that made the autoposter a permanent dry run: the script
 * read TG_POST_BOT_TOKEN and TG_POST_CHANNEL_ID, and vibee-render defines
 * TELEGRAM_CHANNEL_BOT_TOKEN and TELEGRAM_CHANNEL_ID. Missing credentials mean
 * DRY-RUN by design, so the mismatch could never announce itself -- it looked
 * exactly like an owner who had not switched the channel on.
 *
 * WHY NOTHING ELSE CATCHES IT. `process.env.ANYTHING` typechecks, and every
 * test that mocks the environment sets whatever name the code reads: the fake
 * agrees with the code by construction (house rule 5). The only witness that
 * can disagree is the DEPLOYMENT, which lives outside this repository. So the
 * witness is checked in, as NAMES ONLY, in loop/deploy-env-names.txt.
 *
 * WHY THE TEST DOES NOT CALL RAILWAY. A test that needs a network, a login and
 * a paid CLI is a test that gets skipped, and a skipped check is not a check.
 * Freshness of the fixture is a separate job (regenerate and diff), stated in
 * the file's own header.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { ENV_NAMES } from './src/channel-delivery'

const RENDER = __dirname
const MANIFEST = path.resolve(RENDER, '../../../loop/deploy-env-names.txt')
const MODULE = path.join(RENDER, 'src', 'channel-delivery.ts')
const CLI = path.join(RENDER, 'scripts', 'telegram-autopost.ts')
const SERVER = path.join(RENDER, 'render-server.ts')

const read = (f: string) => fs.readFileSync(f, 'utf8')

/**
 * Source with the comments taken out.
 *
 * These files EXPLAIN the mismatch they fixed, and the explanation contains
 * env-shaped words -- `process.env.ANYTHING typechecks` in the module header
 * read as a variable named ANYTHING and failed this test on prose. Line
 * comments are dropped whole-line only, so a URL's `//` inside a string
 * survives.
 */
function codeOf(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(l => !/^\s*(\/\/|\*)/.test(l))
    .join('\n')
}

/** The deploy's variable names, comments and blanks stripped. */
function manifest(): Set<string> {
  return new Set(
    read(MANIFEST)
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'))
  )
}

/**
 * A function's source, found by NAME.
 *
 * Anchoring on the function name rather than on an env name matters: an
 * extractor anchored on what it is looking for goes quiet exactly when the
 * thing changes, and a check that finds nothing passes.
 */
function functionSource(src: string, name: string): string {
  const at = src.indexOf(`function ${name}(`)
  if (at < 0) return ''
  const end = src.indexOf('\n}\n', at)
  return end < 0 ? src.slice(at) : src.slice(at, end)
}

/** Literal environment reads: `process.env.X`, `env.X`, `env['X']`. */
const ENV_READ =
  /(?:process\.)?env(?:\.([A-Z][A-Z0-9_]{2,})|\[\s*['"]([A-Z][A-Z0-9_]{2,})['"]\s*\])/g

function namesIn(src: string): string[] {
  return [...src.matchAll(ENV_READ)].map(m => m[1] || m[2])
}

/**
 * Everything the channel path reads. The ENV_NAMES table is included because
 * the module reads through it (`env[name]`), which no regex can see.
 */
function namesRead(): Set<string> {
  const server = read(SERVER)
  const regions = [
    read(MODULE),
    read(CLI),
    functionSource(server, 'postReelToChannel'),
    functionSource(server, 'markDeliveredToChannel'),
  ].map(codeOf)
  // Denominator: if an extraction came back empty the scan below proves nothing.
  for (const r of regions) expect(r.length).toBeGreaterThan(200)
  return new Set([
    ...regions.flatMap(namesIn),
    ...Object.values(ENV_NAMES).flat(),
  ])
}

/** Names the channel path CANNOT work without. Each must exist in the deploy. */
const REQUIRED = [
  'TELEGRAM_CHANNEL_BOT_TOKEN',
  'TELEGRAM_CHANNEL_ID',
  'DATABASE_URL',
  'AGENT_KEYS',
]

/**
 * Names deliberately absent from the deploy, each with the reason.
 *
 * This list may shrink; an entry the code no longer reads must leave it, or it
 * stops describing reality and starts excusing it (the rule
 * agent-routes-contract.test.ts applies to its own known-debt list). An entry
 * appearing in the deploy later is NOT a failure: these are optional by design,
 * and setting one is how the owner turns the drain on.
 */
const OPTIONAL: Record<string, string> = {
  TG_POST_BOT_TOKEN: 'legacy alias, kept so a local .env keeps working',
  TG_POST_CHANNEL_ID: 'legacy alias, same reason',
  TG_POST_MAX_PER_RUN: 'unset means the default of 1 reel per run',
  TG_POST_MAX_PER_DAY: 'unset means 0, i.e. the backlog drain stays off',
  OWNER_TELEGRAM_ID: 'unset: the owner is taken from the AGENT_KEYS pairing',
  LOOP_DIR: 'unset: the CLI falls back to the repository loop/ directory',
}

describe('the deploy manifest', () => {
  it('parsed, and is the real list -- an empty set would pass everything', () => {
    const m = manifest()
    expect(m.size).toBeGreaterThan(30)
    expect(m.has('TELEGRAM_CHANNEL_ID')).toBe(true)
    // Names only. A value here would have to be revoked, not deleted.
    expect(read(MANIFEST)).not.toMatch(/^[A-Z][A-Z0-9_]*=/m)
  })
})

describe('every name the channel path reads is accounted for', () => {
  it('nothing is read that is neither required nor declared optional', () => {
    const unclassified = [...namesRead()].filter(
      n => !REQUIRED.includes(n) && !(n in OPTIONAL)
    )
    expect(unclassified).toEqual([])
  })

  it('every required name exists in the deploy', () => {
    const m = manifest()
    expect(REQUIRED.filter(n => !m.has(n))).toEqual([])
  })

  it('every required name is actually read by the code', () => {
    // The half that catches the rename: swap TELEGRAM_CHANNEL_BOT_TOKEN back to
    // TG_POST_BOT_TOKEN and this list stops being empty.
    const reading = namesRead()
    expect(REQUIRED.filter(n => !reading.has(n))).toEqual([])
  })

  it('the optional list has no stale entries', () => {
    const reading = namesRead()
    expect(Object.keys(OPTIONAL).filter(n => !reading.has(n))).toEqual([])
  })
})

describe('the deploy name is read FIRST, the legacy name only as a fallback', () => {
  it('the primary of each pair is a name the deploy defines', () => {
    // Order is the whole point: reading the alias first would let a stale local
    // .env silently take precedence over production.
    const m = manifest()
    expect(m.has(ENV_NAMES.token[0])).toBe(true)
    expect(m.has(ENV_NAMES.chatId[0])).toBe(true)
  })

  it('each pair really has a fallback, and it is a different name', () => {
    expect(ENV_NAMES.token).toHaveLength(2)
    expect(ENV_NAMES.chatId).toHaveLength(2)
    expect(ENV_NAMES.token[1]).not.toBe(ENV_NAMES.token[0])
    expect(ENV_NAMES.chatId[1]).not.toBe(ENV_NAMES.chatId[0])
  })
})

describe('the switch that starts the autopilot at all', () => {
  it('the supervisor gate is keyed on a name the deploy defines', () => {
    // The delivery runs on the autopilot tick, and the autopilot runs only if
    // this gate is on. A gate keyed on a name nobody sets is a feature that
    // never runs -- the same class of defect, one level up.
    const src = read(SERVER)
    const m = src.match(
      /if\s*\(\s*process\.env\.([A-Z][A-Z0-9_]*)\s*===\s*'1'\s*\)\s*\{\s*const startAutopilot/
    )
    expect(m, 'the autopilot supervisor block was not found').toBeTruthy()
    expect(manifest().has(String(m?.[1]))).toBe(true)
  })
})
