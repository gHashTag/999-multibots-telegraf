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
import { PORTRAIT_ENV } from './src/talking-portrait'

const RENDER = __dirname
const MANIFEST = path.resolve(RENDER, '../../../loop/deploy-env-names.txt')
const MODULE = path.join(RENDER, 'src', 'channel-delivery.ts')
const CLI = path.join(RENDER, 'scripts', 'telegram-autopost.ts')
const SERVER = path.join(RENDER, 'render-server.ts')
/**
 * THE SCAN REGION WAS ONE FILE AWAY FROM THE DEFECT IT WOULD HAVE CAUGHT.
 *
 * This test asserted that the supervisor gate is keyed on a deployed name, and
 * yet `AUTOPILOT_FACE` and `AUTOPILOT_FACE_SOURCE` shipped in the autopilot
 * script reading names production does not define -- because the script was not
 * in the region below. A switch nobody can turn on looks exactly like a switch
 * nobody has turned on. So the autopilot and the paid layer it drives are
 * scanned here too, and every name either exists in the deploy or is declared
 * optional with the reason it may be missing.
 */
const AUTOPILOT = path.join(RENDER, 'scripts', 'agent-autopilot.ts')
const PORTRAIT = path.join(RENDER, 'src', 'talking-portrait.ts')

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
    read(AUTOPILOT),
    read(PORTRAIT),
    functionSource(server, 'postReelToChannel'),
    functionSource(server, 'markDeliveredToChannel'),
  ].map(codeOf)
  // Denominator: if an extraction came back empty the scan below proves nothing.
  for (const r of regions) expect(r.length).toBeGreaterThan(200)
  return new Set([
    ...regions.flatMap(namesIn),
    ...Object.values(ENV_NAMES).flat(),
    // Both modules read through a table (`env[name]`), which no regex can see.
    ...Object.values(PORTRAIT_ENV),
  ])
}

/** Names this path CANNOT work without. Each must exist in the deploy. */
const REQUIRED = [
  'TELEGRAM_CHANNEL_BOT_TOKEN',
  'TELEGRAM_CHANNEL_ID',
  'DATABASE_URL',
  'AGENT_KEYS',
  // The autopilot cannot reach its own MCP endpoint or the render server
  // without these two, and the daemon does not start without the third.
  'SELF_URL',
  'RENDER_API_KEY',
  'AUTOPILOT_LOOP',
  // The only funded provider. With the portrait switch on and this absent the
  // module refuses BEFORE the charge, which is the right behaviour and still
  // not a reason to let the name rot out of the deploy.
  'KIE_AI_API_KEY',
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
  PORT: 'unset: the autopilot talks to 127.0.0.1:3333, its own render server',
  AUTOPILOT_INTERVAL_MS: 'unset means the 30-minute daemon tick',
  AUTOPILOT_FACE: 'the face-reel switch; unset means off and no file is read',
  AUTOPILOT_FACE_SOURCE: 'unset: LOOP_DIR/face-source.json',
  // The one switch in this table whose UNSET position is ON. It is not a
  // slip: the poster layer was gated behind a --with-image flag that the only
  // thing launching the script in production never passed, so the feature was
  // dead while its comment claimed otherwise. Setting AUTOPILOT_IMAGE=0 turns
  // it off again, which is the position that costs nothing.
  AUTOPILOT_IMAGE:
    'unset means the poster IS generated; =0 is the off switch that saves the credits',
  // The talking portrait. Six names, of which the owner must set three to turn
  // it on; the other three only override numbers that already have a defensible
  // default in code, so a half-configured deploy cannot spend by accident.
  AUTOPILOT_PORTRAIT:
    'off|dry|on, unset means off -- the medallion keeps the silent b-roll',
  AUTOPILOT_PORTRAIT_IMAGE:
    'unset: no still to animate, refused before any provider call',
  AUTOPILOT_PORTRAIT_AUDIO:
    'unset: no voice track, refused before any provider call',
  AUTOPILOT_PORTRAIT_SECONDS: 'unset means 6 s, i.e. 108 credits per clip',
  AUTOPILOT_PORTRAIT_DAILY_CREDITS:
    'unset means the 144-credit daily ceiling written in code',
  AUTOPILOT_PORTRAIT_API:
    'unset means api.kie.ai; a test points it at a local stub',
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

/**
 * THE ENV GATE THAT ENCLOSES A DECLARATION, BY BLOCK, NOT BY ADJACENCY.
 *
 * The previous version of this check demanded that `if (process.env.X === '1')
 * {` be followed IMMEDIATELY by `const startAutopilot`. That held until #2220
 * put a journalling helper between them -- a legitimate edit -- and the test
 * went red on main for four days. Nobody looked, because the snapshot gate was
 * red anyway (#2227).
 *
 * An anchor that requires two lines to touch is a claim about formatting, not
 * about the program. So containment is established the way the language
 * establishes it: walk back from the declaration until a line is less indented
 * than it, and that line is the statement it lives in. If that statement is not
 * an env gate, there is no gate -- which is the case this must still fail on,
 * and the reason it does not simply grab the nearest `=== '1'` in the file.
 */
function enclosingEnvGate(src: string, needle: string): string | null {
  const lines = src.split('\n')
  const at = lines.findIndex(l => l.includes(needle))
  if (at === -1) return null
  const indent = (l: string) => l.length - l.trimStart().length
  const inner = indent(lines[at])
  for (let i = at - 1; i >= 0; i--) {
    const line = lines[i]
    if (!line.trim()) continue
    if (indent(line) >= inner) continue
    const m = line.match(
      /^\s*if \(process\.env\.([A-Z][A-Z0-9_]*) === '1'\) \{/
    )
    return m ? m[1] : null
  }
  return null
}

describe('the switch that starts the autopilot at all', () => {
  it('the supervisor gate is keyed on a name the deploy defines', () => {
    // The delivery runs on the autopilot tick, and the autopilot runs only if
    // this gate is on. A gate keyed on a name nobody sets is a feature that
    // never runs -- the same class of defect, one level up.
    const name = enclosingEnvGate(read(SERVER), 'const startAutopilot')
    expect(name, 'the autopilot supervisor block was not found').toBeTruthy()
    expect(manifest().has(String(name))).toBe(true)
  })

  it('survives a statement inserted between the gate and the declaration', () => {
    // The exact shape that broke it: a helper, with braces of its own, added
    // inside the gate above the declaration.
    const src = [
      "  if (process.env.AUTOPILOT_LOOP === '1') {",
      '    const note = (why: string) => {',
      '      log(why)',
      '    }',
      '    const startAutopilot = () => {}',
      '  }',
    ].join('\n')
    expect(enclosingEnvGate(src, 'const startAutopilot')).toBe('AUTOPILOT_LOOP')
  })

  it('finds nothing when the declaration is not inside an env gate', () => {
    // The half that keeps it from grabbing an unrelated gate elsewhere in a
    // ten-thousand-line file: removing the switch must fail, not pass.
    const src = [
      "  if (process.env.SOMETHING_ELSE === '1') {",
      '    other()',
      '  }',
      '  function boot() {',
      '    const startAutopilot = () => {}',
      '  }',
    ].join('\n')
    expect(enclosingEnvGate(src, 'const startAutopilot')).toBeNull()
  })
})
