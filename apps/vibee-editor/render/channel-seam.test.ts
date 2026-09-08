/**
 * THE SEAM: does anything that RUNS IN PRODUCTION actually call the delivery?
 *
 * This is the defect being fixed, not a hypothetical one.
 * scripts/telegram-autopost.ts existed for weeks and a repo-wide grep found no
 * caller at all -- only its own "how to run me" comment. The channel therefore
 * never received a single backlog reel, nothing was red, and the loop journal
 * recorded the script as working because its dry run printed a line. Exported
 * and called by nobody is valid TypeScript; agent-routes-contract.test.ts
 * records the last time that exact shape shipped, with a2a.ts telling users to
 * POST to an address no request could reach.
 *
 * So the chain is asserted link by link, in the direction production runs it:
 *   render-server.ts  --spawns-->  scripts/agent-autopilot.ts
 *   agent-autopilot.ts --imports and CALLS--> src/channel-delivery.ts
 *   render-server.ts  --stamps the ledger--> so both paths share one record.
 *
 * NOT asserted here: that the tick fires at runtime, or that Telegram accepts
 * the video. This checks the seams between files, which is where the whole
 * feature went missing.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { sliceFrom } = require('../../../scripts/lib/anchored-slice.cjs')

const RENDER = __dirname
const MODULE = path.join(RENDER, 'src', 'channel-delivery.ts')
const AUTOPILOT = path.join(RENDER, 'scripts', 'agent-autopilot.ts')
const CLI = path.join(RENDER, 'scripts', 'telegram-autopost.ts')
const SERVER = path.join(RENDER, 'render-server.ts')

const read = (f: string) => fs.readFileSync(f, 'utf8')

/**
 * Source with the comments taken out.
 *
 * Needed because these files EXPLAIN the defects they fixed: the module's own
 * header says the old script called process.exit(1) on a failed send, and a
 * scanner that reads prose flags that sentence as the bug. Line comments are
 * dropped whole-line only, so a URL's `//` inside a string survives.
 */
function codeOf(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(l => !/^\s*(\/\/|\*)/.test(l))
    .join('\n')
}

/** Everything except the import statements: where a CALL has to appear. */
function withoutImports(src: string): string {
  return src.replace(/^import\s[\s\S]*?from\s*['"][^'"]+['"]\n/gm, '')
}

describe('the delivery module is wired into what production runs', () => {
  it('all four files are here -- otherwise every check below is vacuous', () => {
    // The denominator rule: an empty scan proves nothing and looks green.
    for (const f of [MODULE, AUTOPILOT, CLI, SERVER]) {
      expect(fs.existsSync(f), `${f} is missing`).toBe(true)
      expect(read(f).length).toBeGreaterThan(500)
    }
  })

  it('the module exports the entry point the callers use', () => {
    expect(read(MODULE)).toMatch(/export async function deliverToChannel\(/)
  })

  it('the autopilot IMPORTS it from the typechecked module', () => {
    // Not from scripts/: nothing under scripts/ is in any tsconfig include, so
    // logic left there is invisible to `npm run typecheck` -- how the
    // top-level-await breakage shipped green.
    expect(read(AUTOPILOT)).toMatch(
      /import\s*\{[^}]*deliverToChannel[^}]*\}\s*from\s*['"]\.\.\/src\/channel-delivery['"]/
    )
  })

  it('the autopilot CALLS it, not merely imports it', () => {
    const body = withoutImports(read(AUTOPILOT))
    const calls = body.match(/deliverToChannel\s*\(/g) || []
    // One import and no call is exactly the state this file exists to forbid.
    expect(calls.length).toBeGreaterThan(0)
  })

  it('the call sits on the TICK, so quiet cycles still drain the queue', () => {
    // main() returns early in six places before it ever publishes (daily cap,
    // 3-hour spacing, empty queue, exhausted cursor, duplicate title, render
    // failure). A step placed after feed_publish would run only at the moment
    // the live path has already delivered -- i.e. never for the backlog.
    const src = read(AUTOPILOT)
    const once = sliceFrom(src, 'async function once()')
    expect(once.length).toBeGreaterThan(100)
    expect(once).toMatch(/channelTick\s*\(/)
  })

  it('the server spawns the autopilot -- the last link of the chain', () => {
    // Without this the whole chain above is a program nobody starts.
    const src = read(SERVER)
    expect(src).toMatch(/spawn\(\s*[\s\S]{0,200}?scripts\/agent-autopilot\.ts/)
  })

  it('the live publish path stamps the same ledger the drain reads', () => {
    // template_settings.tg_posted_at was written by NOTHING that runs: the live
    // path returned {posted:true} and left no trace, so a drain would start
    // from the beginning and re-send everything the channel already has.
    const src = read(SERVER)
    expect(src).toMatch(/async function markDeliveredToChannel\(/)
    expect(src).toMatch(
      /if \(telegram\.posted\) await markDeliveredToChannel\(/
    )
    expect(src).toMatch(
      /import\s*\{[\s\S]{0,120}?MARK_POSTED[\s\S]{0,120}?\}\s*from\s*['"]\.\/src\/channel-delivery['"]/
    )
  })
})

describe('importing the CLI cannot start it, and nothing here can kill the daemon', () => {
  it('the script runs itself only as a program', () => {
    // The old file called main() at import time (line 117) and process.exit(1)
    // on a failed send. Imported into the supervised daemon that is a crash
    // into the render server's 60-second respawn, which reads as a deploy
    // problem rather than a channel problem.
    const src = codeOf(read(CLI))
    expect(src).toMatch(/require\.main === module/)
    const guardAt = src.indexOf('require.main === module')
    // No self-invocation ABOVE the guard: the delivery must be a call the
    // importer chooses to make.
    expect(src.slice(0, guardAt)).not.toMatch(/^\s*(void\s*)?run\(\)/m)
  })

  it('the delivery module never exits the process', () => {
    expect(codeOf(read(MODULE))).not.toMatch(/process\.exit\s*\(/)
  })

  it('the CLI never exits non-zero on a refused send', () => {
    // Exit codes are the verdict, so this one is load-bearing: a refusal from
    // Telegram is a recorded outcome (the attempt counter grew), not an
    // inability to run.
    expect(codeOf(read(CLI))).not.toMatch(/process\.exit\s*\(/)
  })
})
