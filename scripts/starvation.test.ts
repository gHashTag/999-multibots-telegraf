/**
 * The starvation verdict a gate reads before it calls a run broken
 * (scripts/lib/starvation.cjs, tri starved). Findings are never "starved";
 * a silent death on a starved machine is never "broken".
 */
import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { etimeSeconds, isOrphan } from '../bin/helpers/starved.mjs'

const st = createRequire(import.meta.url)('./lib/starvation.cjs')
const fed = { load1: 4, cores: 8, swapFreeMb: 8000 }
const loaded = { load1: 377, cores: 8, swapFreeMb: 8000 }
const swapless = { load1: 4, cores: 8, swapFreeMb: 900 }

describe('verdict', () => {
  it('findings are an answer whatever the load', () => {
    expect(st.verdict({ status: 2, findings: 3 }, loaded)).toBe('findings')
  })
  it('a zero exit is clean', () => {
    expect(st.verdict({ status: 0, findings: 0 }, loaded)).toBe('clean')
  })
  it('killed by a signal with nothing said is starved (#3320)', () => {
    expect(st.verdict({ status: null, findings: 0 }, fed)).toBe('starved')
  })
  it('a silent non-zero exit on a deep run queue is starved', () => {
    expect(st.verdict({ status: 1, findings: 0 }, loaded)).toBe('starved')
  })
  it('a silent non-zero exit with swap nearly gone is starved', () => {
    expect(st.verdict({ status: 1, findings: 0 }, swapless)).toBe('starved')
  })
  it('a silent non-zero exit on a fed machine is broken, not excused', () => {
    expect(st.verdict({ status: 1, findings: 0 }, fed)).toBe('broken')
  })
  it('no swap at all is not starvation', () => {
    expect(st.isStarved({ load1: 4, cores: 8, swapFreeMb: null })).toBe(false)
  })
})

describe('tri starved orphans', () => {
  it('reads ps elapsed times', () => {
    expect(etimeSeconds('03:04')).toBe(184)
    expect(etimeSeconds('02:03:04')).toBe(7384)
    expect(etimeSeconds('1-00:00:01')).toBe(86401)
  })
  const p = {
    pid: 9,
    ppid: 1,
    age: 3 * 3600,
    cpu: 10,
    rssMb: 100,
    command: 'node (vitest 4)',
  }
  it('an old checker re-parented to launchd is an orphan', () => {
    expect(isOrphan(p)).toBe(true)
  })
  it("a checker with a live parent is somebody's work", () => {
    expect(isOrphan({ ...p, ppid: 4242 })).toBe(false)
  })
  it('a young orphan may still be finishing', () => {
    expect(isOrphan({ ...p, age: 60 })).toBe(false)
  })
  it('a non-checker under launchd is not ours to reap', () => {
    expect(isOrphan({ ...p, command: '/usr/libexec/diskimagesiod' })).toBe(
      false
    )
  })
})

/*
 * The ratchet itself, on a fake tsc: the reviewer of #3334 showed the first
 * version let a silent non-zero exit on a FED machine pass as clean.
 */
describe('tsc-ratchet on a fake tsc', () => {
  const { mkdtempSync, mkdirSync, writeFileSync, chmodSync } = createRequire(
    import.meta.url
  )('node:fs')
  const { spawnSync } = createRequire(import.meta.url)('node:child_process')
  const path = createRequire(import.meta.url)('node:path')
  const os = createRequire(import.meta.url)('node:os')
  const lib = path.join(path.dirname(new URL(import.meta.url).pathname), 'lib')

  function run(tscBody: string, machine: object, wait = '0') {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ratchet-'))
    mkdirSync(path.join(dir, 'node_modules', '.bin'), { recursive: true })
    const tsc = path.join(dir, 'node_modules', '.bin', 'tsc')
    writeFileSync(tsc, `#!/bin/sh\n${tscBody}\n`)
    chmodSync(tsc, 0o755)
    const script =
      `require(${JSON.stringify(path.join(lib, 'tsc-ratchet.cjs'))}).ratchet(` +
      `{label:'t',dir:${JSON.stringify(path.relative(path.join(lib, '..', '..'), dir))},` +
      `project:'tsconfig.json',baseline:0,scope:['__none__'],self:'t'})`
    return spawnSync(process.execPath, ['-e', script], {
      encoding: 'utf8',
      env: {
        ...process.env,
        STARVATION_MACHINE: JSON.stringify(machine),
        TSC_HEADROOM_WAIT: wait,
      },
    })
  }

  it('a silent non-zero exit on a fed machine fails as a broken run', () => {
    const r = run('echo "error TS5058: no path"; exit 1', fed)
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/сломанный запуск/) // cyrillic-ok: the gate's own words
  })

  it('a silent death on a starved machine exits 75, not 1 and not 0', () => {
    const r = run('exit 1', loaded)
    expect(r.status).toBe(75)
  })

  it('a clean tsc on a fed machine passes', () => {
    expect(run('exit 0', fed).status).toBe(0)
  })

  it('a real error TS line is a finding, starved or not', () => {
    const r = run('echo "a.ts(1,1): error TS2322: no"; exit 2', loaded)
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/БОЛЬШЕ/) // cyrillic-ok: the gate's own words
  })
})
