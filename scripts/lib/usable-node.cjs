/**
 * RUN UNDER A NODE THAT CAN ACTUALLY LOAD VITE.
 *
 * WHAT WENT WRONG. A git hook does not inherit a developer's shell setup. On
 * this machine the hook's PATH resolves `node` to v18.20.8 -- the first nvm
 * version on the path -- while vite 7 declares `engines.node:
 * ^20.19.0 || >=22.12.0`. Under 18 the config load dies with:
 *
 *     ERR_REQUIRE_ESM: require() of ES Module .../vite/dist/node/index.js
 *     from .../vitest/dist/config.cjs not supported
 *
 * The pre-push gate then blocks with "tests that were not failing in the base"
 * and a stack trace about ESM. Nothing was broken; the gate simply could not
 * run. Measured 2026-09-07, and the cost is already visible: the push went
 * through with `--no-verify`, which is how a gate stops existing. A gate that
 * fails for a reason unrelated to your change teaches people to bypass it.
 *
 * `.nvmrc` says 22, and 22 is not installed on this machine -- and nothing in
 * the hook path reads `.nvmrc` anyway. So it fixes nothing on its own.
 *
 * WHY THE RANGE IS READ FROM VITE AND NOT WRITTEN HERE. A constant would be
 * right today and wrong at the next vite upgrade, and the symptom would be the
 * same confusing stack trace. The requirement lives in vite's own manifest;
 * this asks it.
 *
 * WHY IT RE-EXECS INSTEAD OF JUST REFUSING. Refusing would be honest but
 * useless: the developer did nothing wrong and has a suitable Node installed
 * two directories away. It looks for one, and only refuses when there is
 * genuinely none -- and then it says which version is running, which range is
 * needed, and where it looked.
 */
'use strict'

const { execFileSync } = require('child_process')
const { existsSync, readdirSync, readFileSync } = require('fs')
const { resolve, join, dirname } = require('path')

/** Set on the child so a re-exec can never re-exec again. */
const GUARD_ENV = 'USABLE_NODE_REEXEC'

function requiredRange(root) {
  try {
    const manifest = JSON.parse(
      readFileSync(
        resolve(root, 'node_modules', 'vite', 'package.json'),
        'utf8'
      )
    )
    return (manifest.engines && manifest.engines.node) || null
  } catch {
    // No vite installed: nothing here can judge, and inventing a range would
    // block a push for a reason this file made up.
    return null
  }
}

/** Every node this machine might have, cheapest places first. */
function candidates() {
  const found = []
  const nvm = join(process.env.HOME || '', '.nvm', 'versions', 'node')
  if (existsSync(nvm)) {
    for (const version of readdirSync(nvm)) {
      const bin = join(nvm, version, 'bin', 'node')
      if (existsSync(bin)) found.push(bin)
    }
  }
  for (const bin of ['/opt/homebrew/bin/node', '/usr/local/bin/node']) {
    if (existsSync(bin)) found.push(bin)
  }
  return found
}

function versionOf(bin) {
  try {
    return execFileSync(bin, ['-v'], { encoding: 'utf8' })
      .trim()
      .replace(/^v/, '')
  } catch {
    return null
  }
}

/**
 * Ensure the current process can load vite; re-exec under a Node that can if
 * it cannot. Returns normally when the current Node is fine.
 *
 * `script` is the file to re-run -- pass `__filename` from the caller, not this
 * module's, or the child would run this helper instead of the gate.
 */
function ensureUsableNode(script, root) {
  if (process.env[GUARD_ENV]) return

  const range = requiredRange(root)
  if (!range) return

  const semver = require(resolve(root, 'node_modules', 'semver'))
  if (semver.satisfies(process.versions.node, range)) return

  const usable = candidates()
    .map(bin => ({ bin, version: versionOf(bin) }))
    .filter(c => c.version && semver.satisfies(c.version, range))
    .sort((a, b) => semver.rcompare(a.version, b.version))[0]

  if (!usable) {
    console.error(
      `\n[node] this runs on v${process.versions.node}, and vite needs ${range}.\n` +
        '[node] No installed Node satisfies it. Looked in ~/.nvm/versions/node,\n' +
        '[node] /opt/homebrew/bin and /usr/local/bin.\n' +
        `[node] Install one:  nvm install ${range.match(/\d+/)[0]}\n`
    )
    // Exit non-zero: a gate that cannot run must not report success.
    process.exit(1)
  }

  console.log(
    `[node] v${process.versions.node} cannot load vite (needs ${range}); ` +
      `re-running under v${usable.version}`
  )
  /*
   * PATH MUST MOVE WITH THE INTERPRETER.
   *
   * Re-execing with only the binary swapped is not enough, and this cost a
   * round of debugging: vitest spawns workers and vite re-enters `node` for the
   * config bundle, and both resolve `node` from PATH. With the old PATH still
   * in front, the children came back on the very version we just stepped away
   * from -- and the same ESM error appeared under a Node that handles it fine
   * when run directly.
   */
  const bin = dirname(usable.bin)
  const env = {
    ...process.env,
    [GUARD_ENV]: '1',
    PATH: `${bin}:${process.env.PATH || ''}`,
  }

  /*
   * The child's exit code is the gate's answer and has to survive the trip.
   *
   * `execFileSync` THROWS when the child exits non-zero, so letting it escape
   * would end in an uncaught stack trace -- a failing gate that looks like a
   * broken tool, which is exactly the confusion this file exists to remove.
   */
  try {
    execFileSync(usable.bin, [script, ...process.argv.slice(2)], {
      stdio: 'inherit',
      env,
    })
    process.exit(0)
  } catch (e) {
    process.exit(typeof e.status === 'number' ? e.status : 1)
  }
}

module.exports = { ensureUsableNode }
