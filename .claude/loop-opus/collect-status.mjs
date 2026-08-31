#!/usr/bin/env node
/**
 * ONE MEASURED SNAPSHOT OF THE LOOP, as JSON. Nothing here is remembered.
 *
 * WHY THIS EXISTS. The dashboard was built from STATE.json, which I wrote by
 * hand at the end of each cycle -- a retelling, not a measurement. Every defect
 * this loop has cost a day to find was of exactly that shape: `tri factory`
 * trusted a local file and reported a 52.9-hour stall on a day with three
 * published reels; the regression check tested a field for existence rather
 * than age and called a 51-hour outage clean. A dashboard fed by my own prose
 * is the same trap with better typography.
 *
 * So every field below is either MEASURED right now or explicitly null. There
 * is no third option and no carry-forward: a check that could not run leaves
 * null and says why, because a stale number is worse than a missing one -- it
 * looks like knowledge.
 *
 *   node .claude/loop-opus/collect-status.mjs            # JSON to stdout
 *   node .claude/loop-opus/collect-status.mjs --quick    # skip the slow gate
 *
 * Exit code is 0 even when things are broken: this REPORTS, it does not judge.
 * The judging lives in anomalies.mjs and `tri gate`, which have their own codes.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..', '..')
const QUICK = process.argv.includes('--quick')

/**
 * Run a command and return { code, out }. NEVER throws.
 *
 * The exit code is kept separately from the output on purpose. Reading a
 * verdict out of text instead of the status is the single most repeated defect
 * in this repository -- it produced two false greens in the merge gate on
 * 2026-08-29 alone, and one of them had already been written down as a lesson.
 */
function run(cmd, args, opts = {}) {
  try {
    const out = execFileSync(cmd, args, {
      cwd: REPO,
      encoding: 'utf8',
      timeout: opts.timeout ?? 120000,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { code: 0, out: String(out) }
  } catch (e) {
    return {
      code: typeof e.status === 'number' ? e.status : null,
      out: `${e.stdout || ''}\n${e.stderr || ''}`.trim() || String(e.message),
    }
  }
}

/** Strip ANSI so a colour code cannot hide a word from a match. Paid for twice. */
const plain = s => String(s).replace(/\[[0-9;]*m/g, '')

const snapshot = {
  takenAt: new Date().toISOString(),
  quick: QUICK,
}

// ─── The loop's own bookkeeping ──────────────────────────────────────────
try {
  const st = JSON.parse(fs.readFileSync(path.join(HERE, 'STATE.json'), 'utf8'))
  snapshot.cycle = {
    iteration: st.iteration ?? null,
    // Counts only. The prose in STATE.json is my retelling of the cycle and
    // belongs in the report, not on a status board that claims to measure.
    measured: (st.measured || []).length,
    shipped: (st.shipped || []).length,
    selfCritique: (st.selfCritique || []).length,
    backlog: (st.backlog || []).map(b => b['что'] || b.what || String(b)),
  }
} catch (e) {
  snapshot.cycle = { error: `STATE.json не прочитан: ${e.message}` }
}

// ─── Anomalies: the live production check ────────────────────────────────
{
  const r = run(process.execPath, [path.join(HERE, 'anomalies.mjs')], {
    timeout: 240000,
  })
  const text = plain(r.out)
  const lines = text
    .split('\n')
    .filter(l => l.includes('⚠️'))
    .map(l => l.replace(/.*⚠️\s*/, '').trim())
    .filter(l => l && !l.startsWith('АНОМАЛИЙ'))
  const tally = text.match(/АНОМАЛИЙ:\s*(\d+)/) // cyrillic-ok: matches Russian tool output
  snapshot.anomalies = {
    // `code` distinguishes "checked and clean" (0) from "checked and found
    // things" (1) from "could not run at all" (null).
    code: r.code,
    count: tally ? Number(tally[1]) : r.code === 0 ? 0 : null,
    items: lines.slice(0, 8),
    notMeasured: (text.match(/не измерено:\s*(\d+)/) || [null, '0'])[1], // cyrillic-ok: matches Russian tool output
  }
}

// ─── Can the alarm still fail? ───────────────────────────────────────────
{
  const r = run(process.execPath, [path.join(HERE, 'anomalies-selftest.mjs')], {
    timeout: 300000,
  })
  const text = plain(r.out)
  const ok = text.match(/все (\d+) проверки сработали/) // cyrillic-ok: matches Russian tool output
  const bad = text.match(/НЕ СРАБОТАЛО:\s*(\d+) из (\d+)/) // cyrillic-ok: matches Russian tool output
  snapshot.alarmSelfTest = {
    code: r.code,
    total: ok ? Number(ok[1]) : bad ? Number(bad[2]) : null,
    failed: bad ? Number(bad[1]) : r.code === 0 ? 0 : null,
  }
}

// ─── The content factory, judged by AGE ──────────────────────────────────
{
  const r = run(path.join(REPO, 'tri'), ['factory'], { timeout: 90000 })
  const text = plain(r.out)
  const age =
    text.match(/last post ([\d.]+)h ago/) ||
    text.match(/([\d.]+)h with no post/)
  snapshot.factory = {
    code: r.code,
    hoursSinceLastPost: age ? Number(age[1]) : null,
    title: (text.match(/«([^»]*)»/) || [null, null])[1],
  }
}

// ─── Is what is merged actually deployed? ────────────────────────────────
{
  const r = run(path.join(REPO, 'tri'), ['deployed'], { timeout: 90000 })
  const text = plain(r.out)
  snapshot.deploy = {
    // 0 shipped, 1 behind, 2 could not measure -- the three outcomes the
    // command was taught to distinguish on 2026-08-29.
    code: r.code,
    prod: (text.match(/прод:\s*(\S+)/) || [null, null])[1], // cyrillic-ok: matches Russian tool output
    buildsFrom: (text.match(/собирается из:\s*(\S+)/) || [null, null])[1], // cyrillic-ok: matches Russian tool output
    mainHead: (text.match(/origin\/main:\s*(\S+)/) || [null, null])[1],
  }
}

// ─── Did any of my own fixes get silently overwritten? ───────────────────
{
  const r = run(process.execPath, [path.join(HERE, 'verify-landed.mjs')], {
    timeout: 120000,
  })
  const text = plain(r.out)
  const checked = text.match(/проверено следов: (\d+) из (\d+)/) // cyrillic-ok: matches Russian tool output
  snapshot.landed = {
    code: r.code,
    checked: checked ? Number(checked[1]) : null,
    total: checked ? Number(checked[2]) : null,
    lost: text
      .split('\n')
      .filter(l => l.includes('нет «') || l.includes('ФАЙЛА НЕТ'))
      .map(l => l.trim())
      .slice(0, 5),
  }
}

const TYPE_ERRORS_RE = /(\d+) ошибок — не больше базы/ // cyrillic-ok

// ─── The merge gate ──────────────────────────────────────────────────────
//
// Slow (a full tsc, the whole vitest run and an Xcode build), so --quick skips
// it. Skipped is NULL, never "passing": the whole point of the third outcome.
if (QUICK) {
  snapshot.gate = null
} else {
  const r = run(path.join(REPO, 'tri'), ['gate'], { timeout: 900000 })
  const text = plain(r.out)
  const sections = text
    .split('\n')
    .filter(l => /^\s{2}\d\.\s/.test(l))
    .map(l => l.trim())
  snapshot.gate = {
    // 0 all sections ran and passed, 1 something failed, 2 something could not
    // be measured. Anything else means the gate itself did not complete.
    code: r.code,
    sections,
    failed: Number((text.match(/провалов (\d+)/) || [null, 0])[1]), // cyrillic-ok: matches Russian tool output
    unmeasured: Number((text.match(/NOT MEASURED: (\d+)/) || [null, 0])[1]),
    tests: (text.match(/Tests\s+(\d+) passed/) || [null, null])[1],
    typeErrors: (text.match(TYPE_ERRORS_RE) || [null, null])[1], // cyrillic-ok: matches Russian tool output
  }
}

// ─── What shipped, straight from git ─────────────────────────────────────
{
  const r = run('git', [
    'log',
    '--since=24 hours ago',
    '--pretty=%h|%s',
    'origin/main',
  ])
  const commits = plain(r.out)
    .split('\n')
    .filter(Boolean)
    .map(l => {
      const [sha, ...rest] = l.split('|')
      return { sha, subject: rest.join('|') }
    })
  snapshot.shipped = {
    last24h: commits.length,
    // Mine are identifiable by the co-author trailer, but reading that for
    // every commit costs a git call each; the subject line is enough here.
    recent: commits.slice(0, 6),
  }
}

const json = JSON.stringify(snapshot, null, 2)
process.stdout.write(json + '\n')

/**
 * ALSO WRITE IT NEXT TO STATE.json, so the dashboard can render MEASURED
 * fields instead of my end-of-cycle prose.
 *
 * The file carries takenAt and the dashboard shows its AGE, because a snapshot
 * with no age is the same trap as `lastPostAt` tested for existence: a value
 * that was true once and reads as true forever. Stale is a THIRD state here,
 * not a quiet pass.
 */
try {
  fs.writeFileSync(path.join(HERE, 'status-measured.json'), json)
} catch (e) {
  // Reporting is the job; failing to cache it must not fail the report.
  process.stderr.write(`snapshot not cached: ${e.message}\n`)
}
