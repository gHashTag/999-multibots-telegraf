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
