#!/usr/bin/env node
/**
 * STARVED OR WRONG? -- the question a gate must answer before it fails a push.
 *
 * 2026-10-02, PR #3320: `render-types` failed a merge commit with
 * "tsc exited null" and not one `error TS` line. A manual tsc on the same tree
 * ran 25 minutes at 5% CPU and never finished. The Mac had 8 cores, a load
 * average of 290-380 and 22 of 23 GB of swap in use: half a dozen sessions,
 * each with its own tsc, vitest and rustc. Nothing was wrong with the code --
 * the machine was starved -- yet the gate said "broken run" and the only way
 * through was LEFTHOOK_EXCLUDE plus --no-verify, which also skips the checks
 * that WOULD have found something.
 *
 * So a gate reads three things before it calls a run broken:
 *   - did the checker produce findings at all? Findings are never "starved":
 *     an `error TS` line is an answer, whatever the load was.
 *   - was it killed by a signal (status null)? On a starved Mac that is the
 *     memory killer or a hook watchdog, not the checker's opinion.
 *   - is the machine starved right now: load per core, swap left?
 *
 * The verdict is one of: clean | findings | starved | broken. Only `findings`
 * and `broken` are about the code; `starved` is about the machine and says so,
 * and the caller may wait for headroom and run again ONCE.
 */
const os = require('node:os')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')

/* A run queue this deep per core means a process waits seconds for a slice. */
const LOAD_PER_CORE = 4
/* Under this much free swap the next allocation pages someone else out. */
const SWAP_FREE_MB = 2048

/** Free swap in MB, or null where it cannot be read (no swap is not starvation). */
function swapFreeMb() {
  if (process.platform === 'darwin') {
    const r = spawnSync('sysctl', ['-n', 'vm.swapusage'], { encoding: 'utf8' })
    const m = /total = ([\d.]+)M\s+used = ([\d.]+)M\s+free = ([\d.]+)M/.exec(
      r.stdout || ''
    )
    if (!m) return null
    return Number(m[1]) > 0 ? Number(m[3]) : null
  }
  try {
    const info = fs.readFileSync('/proc/meminfo', 'utf8')
    const total = /SwapTotal:\s+(\d+)/.exec(info)
    const free = /SwapFree:\s+(\d+)/.exec(info)
    if (!total || !free || Number(total[1]) === 0) return null
    return Math.round(Number(free[1]) / 1024)
  } catch {
    return null
  }
}

/** The machine right now: what a starvation verdict is made of. */
function machine() {
  /* A test pins the reading; a real gate never sets this. */
  if (process.env.STARVATION_MACHINE)
    return JSON.parse(process.env.STARVATION_MACHINE)
  return {
    load1: os.loadavg()[0],
    cores: os.cpus().length || 1,
    swapFreeMb: swapFreeMb(),
  }
}

/** Starved: the run queue is deep per core, or swap is nearly gone. */
function isStarved(m) {
  if (m.load1 / Math.max(1, m.cores) >= LOAD_PER_CORE) return true
  return m.swapFreeMb !== null && m.swapFreeMb < SWAP_FREE_MB
}

/**
 * @param {{status: number|null, signal?: string|null, findings: number}} run
 * @param {{load1: number, cores: number, swapFreeMb: number|null}} m
 * @returns {'clean'|'findings'|'starved'|'broken'}
 */
function verdict(run, m) {
  if (run.findings > 0) return 'findings'
  if (run.status === 0) return 'clean'
  /* Killed by a signal with nothing said: the killer, not the checker. */
  if (run.status === null) return 'starved'
  return isStarved(m) ? 'starved' : 'broken'
}

/** One line for a human: the numbers behind the verdict. */
function describe(m) {
  const swap = m.swapFreeMb === null ? 'n/a' : `${Math.round(m.swapFreeMb)} MB`
  return (
    `load ${m.load1.toFixed(0)} on ${m.cores} cores ` +
    `(${(m.load1 / m.cores).toFixed(1)} per core, starved at ${LOAD_PER_CORE}), ` +
    `swap free ${swap} (starved under ${SWAP_FREE_MB} MB)`
  )
}

/**
 * Wait until the machine is no longer starved, up to maxMs. Synchronous on
 * purpose: gates are plain scripts. Returns the last reading.
 */
function waitForHeadroom(maxMs, stepMs = 15000) {
  const until = Date.now() + maxMs
  let m = machine()
  while (isStarved(m) && Date.now() < until) {
    spawnSync('sleep', [String(Math.ceil(stepMs / 1000))])
    m = machine()
  }
  return m
}

module.exports = {
  LOAD_PER_CORE,
  SWAP_FREE_MB,
  machine,
  isStarved,
  verdict,
  describe,
  waitForHeadroom,
}
