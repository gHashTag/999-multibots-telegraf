#!/usr/bin/env node
/**
 * tri starved [--reap] -- is this Mac starved, who is eating it, and which
 * gate processes are orphans nobody waits for?
 *
 * 2026-10-02: a merge commit's render-types gate died with "tsc exited null"
 * at load 377 on 8 cores, 22 of 23 GB swap used. `ps` showed why: several
 * sessions each running tsc, vitest, prettier and rustc, plus five vitest
 * workers whose parent had died three and a half hours earlier (ppid 1) --
 * still holding memory and CPU, waiting for a run that no longer existed.
 *
 * Reads, never kills, unless --reap: then only ORPHANS -- a checker process
 * (vitest, tsc, eslint, prettier, lefthook) re-parented to launchd and older
 * than 30 minutes. A live session's checker has a live parent and is left
 * alone: it is somebody's work.
 *
 * Exit: 0 fed, 1 starved (so `tri starved && git commit` waits sensibly).
 */
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const st = require('../../scripts/lib/starvation.cjs')

const reap = process.argv.includes('--reap')
const ORPHAN_AFTER_S = 30 * 60
const CHECKER = /\b(vitest|tsc|eslint|prettier|lefthook)\b/
const KINDS = [
  ['tsc', /\btsc\b/],
  ['vitest', /vitest/],
  ['eslint', /eslint/],
  ['prettier', /prettier/],
  ['rustc/cargo', /rustc|cargo/],
  ['simulator', /CoreSimulator/],
  ['browser', /BrowserOS|Chrom/],
  ['claude', /claude/i],
]

/** "1-02:03:04", "02:03:04", "03:04" -> seconds. */
export function etimeSeconds(e) {
  const [d, rest] = e.includes('-') ? e.split('-') : ['0', e]
  const parts = rest.split(':').map(Number)
  while (parts.length < 3) parts.unshift(0)
  return Number(d) * 86400 + parts[0] * 3600 + parts[1] * 60 + parts[2]
}

/** A checker process re-parented to launchd and older than the threshold. */
export function isOrphan(p) {
  return p.ppid === 1 && CHECKER.test(p.command) && p.age >= ORPHAN_AFTER_S
}

function processes() {
  const r = spawnSync('ps', ['-axo', 'pid=,ppid=,etime=,%cpu=,rss=,command='], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
  return (r.stdout || '')
    .split('\n')
    .map(l =>
      l.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+([\d.]+)\s+(\d+)\s+(.*)$/)
    )
    .filter(Boolean)
    .map(m => ({
      pid: Number(m[1]),
      ppid: Number(m[2]),
      age: etimeSeconds(m[3]),
      cpu: Number(m[4]),
      rssMb: Math.round(Number(m[5]) / 1024),
      command: m[6],
    }))
}

/** Where an orphan ran: whose worktree it was a gate of. */
function cwdOf(pid) {
  const r = spawnSync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], {
    encoding: 'utf8',
  })
  const line = (r.stdout || '').split('\n').find(l => l.startsWith('n'))
  return line ? line.slice(1).replace(/^.*\/worktrees\//, 'wt:') : ''
}

function main() {
  const m = st.machine()
  const starved = st.isStarved(m)
  console.log(`${starved ? '🥀 ГОЛОДАЕТ' : '✅ сытая'}: ${st.describe(m)}`)

  const ps = processes()
  console.log('\n── кто ест (процессов · CPU% · память) ──')
  for (const [kind, re] of KINDS) {
    const mine = ps.filter(p => re.test(p.command))
    if (!mine.length) continue
    const cpu = mine.reduce((a, p) => a + p.cpu, 0)
    const mem = mine.reduce((a, p) => a + p.rssMb, 0)
    console.log(
      `  ${kind.padEnd(12)} ${String(mine.length).padStart(3)} · ` +
        `${cpu.toFixed(0).padStart(4)}% · ${String(mem).padStart(6)} MB`
    )
  }

  const orphans = ps.filter(isOrphan)
  console.log(
    `\n── сироты гейтов (родитель умер, > ${ORPHAN_AFTER_S / 60} мин): ${orphans.length} ──`
  )
  for (const p of orphans)
    console.log(
      `  ${p.pid}  ${Math.round(p.age / 60)} мин  ${p.rssMb} MB  ${p.command.slice(0, 60)}  ${cwdOf(p.pid)}`
    )
  if (orphans.length && !reap)
    console.log('  погасить только их: tri starved --reap')
  if (reap)
    for (const p of orphans) {
      try {
        process.kill(p.pid, 'SIGTERM')
        console.log(`  погашен ${p.pid}`)
      } catch (e) {
        console.log(`  ${p.pid}: ${e.code || e.message}`)
      }
    }

  if (starved)
    console.log(
      '\nГейт, упавший сейчас без единой находки, — голод, а не код.\n' +
        'Подождать запаса или гнать проверку в облаке (tri remote-check),\n' +
        'а не --no-verify вслепую.'
    )
  process.exit(starved ? 1 : 0)
}

if (import.meta.url === `file://${process.argv[1]}`) main()
