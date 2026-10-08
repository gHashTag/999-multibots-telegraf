#!/usr/bin/env node
/**
 * tri stands-after-deploy run|install|status [--dry] [--force]
 *
 * After every SUCCESS deploy of the mini-app (Railway service vibee-editor)
 * the phone stands run again by themselves -- `tri shot all` on the DEPLOYED
 * commit, plus the read-only `tri browser doctor` -- and a stand that fails
 * gets ONE GitHub issue, written as a delegatable spec so a coder bee can be
 * dispatched on it. No human step.
 *
 * WHY. `tri shot watch` answers "did anything get worse since the last run",
 * but only when somebody runs it; a deploy that moved a button stayed red
 * until the next person happened to look (phone-shot skill).
 *
 * Per run (launchd, every INTERVAL_S):
 *   1. the newest SUCCESS deploy of vibee-editor (railway, ids from rail.sh);
 *      the same id as ~/.local/state/stands/last-deploy -> nothing to do, rc 0.
 *   2. a detached worktree ~/.local/state/stands/tree at the deploy's commit,
 *      node_modules linked from the main checkout (`tri wt-deps` + player).
 *   3. `shot.mjs all` there (static mocks only: no render, no paid call), and
 *      `tri browser doctor` (read-only; never blank|read|composer|find, which
 *      start a visit and message the owner).
 *   4. every stand that is RED or NOT MEASURED: one issue per stand + deploy,
 *      label `stands-after-deploy`. The pair is marked inside the issue, so a
 *      second run never files it twice; a stand that already has an OPEN issue
 *      gets a comment for the new deploy instead of a second issue.
 *   5. one ledger line (ledger.jsonl), then last-deploy = this deploy.
 * A run where nothing could be measured (the dev server did not start, or
 * every stand said NOT MEASURED and none green or RED) is
 * retried on the next tick, at most MAX_ATTEMPTS times per deploy, and files
 * nothing: "the Mac was busy" is not a stand defect.
 *
 * Exit 0 all green (or nothing new), 1 a stand failed, 2 not measured.
 *
 * Seams for the test: --deploys-from, --shots-from, --doctor-from FILE,
 * --state-dir DIR, STANDS_GH (the gh command). State never lives in the repo.
 */
import { spawnSync } from 'node:child_process'
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// The numbers of this watch, in one place.
export const INTERVAL_S = 900 // launchd StartInterval: every 15 minutes
export const MAX_ATTEMPTS = 3 // unmeasured runs per deploy before giving up
export const LOCK_STALE_S = 3600 // a lock older than this is a dead run
export const LABEL = 'stands-after-deploy'
export const REPO = 'gHashTag/999-multibots-telegraf'
const SERVICE = 'vibee-editor'
const JOB = 'ai.t27.stands-after-deploy'

const HERE = import.meta.dirname
const VERDICT =
  /^== shot (green|RED|NOT MEASURED) -- (\S+) at (\d+)px \((ru|en)\)/
const SILENT = /^== shot NOT MEASURED -- (\S+) (\d+) (ru|en)\s*$/
const ALL_DOWN = /^== shot NOT MEASURED -- all: (.*)$/
const STATE_LINE = /^(RED|ok)\s+(\S+): .* · (\S+\.png)\s*$/
const ASSERT = /^\s+(small|cut|overlap|order|card|error|hint)\s+(.*)$/

/**
 * The newest SUCCESS deploy in `railway deployment list --json` output.
 * @param {Array<{id:string,status:string,createdAt:string,meta?:{commitHash?:string}}>} rows
 */
export function latestSuccess(rows) {
  const ok = (Array.isArray(rows) ? rows : [])
    .filter(r => r && r.status === 'SUCCESS' && r.id)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  if (!ok.length) return null
  const r = ok[0]
  return { id: r.id, sha: r.meta?.commitHash || '', at: r.createdAt }
}

/**
 * The stands of one `shot all` output that did not pass, grouped by stand
 * name (one issue per stand, not per width x language). A stand's lines are
 * printed before its verdict line, so they are collected until it.
 * @param {string} text
 */
export function failingStands(text) {
  /** @type {Map<string, {name:string, runs:Array<{width:string,lang:string,verdict:string,lines:string[],shots:string[]}>}>} */
  const byName = new Map()
  let lines = []
  let shots = []
  let down = ''
  let measured = 0
  // Only a green or RED verdict is a measurement. A matrix where every run
  // said NOT MEASURED (Chromium missing, a starved Mac timing out each child)
  // is the Mac being down, not every stand failing at once: it must not file
  // one issue per stand.
  let decided = 0
  let why = ''
  for (const raw of String(text).split('\n')) {
    const line = raw.replace(/\s+$/, '')
    const all = ALL_DOWN.exec(line)
    if (all) {
      down = all[1] || 'nothing measured'
      continue
    }
    const st = STATE_LINE.exec(line)
    if (st) {
      if (st[1] === 'RED') {
        lines.push(line.replace(/ · \S+\.png$/, ''))
        shots.push(st[3])
      }
      continue
    }
    if (ASSERT.test(line) || line.startsWith('could not measure: ')) {
      if (!why && line.startsWith('could not measure: ')) why = line.trim()
      lines.push(line.trim())
      continue
    }
    const v = VERDICT.exec(line)
    const s = v ? null : SILENT.exec(line)
    if (!v && !s) continue
    const [verdict, name, width, lang] = v
      ? [v[1], v[2], v[3], v[4]]
      : ['NOT MEASURED', s[1], s[2], s[3]]
    measured++
    if (verdict !== 'NOT MEASURED') decided++
    if (verdict !== 'green') {
      if (!byName.has(name)) byName.set(name, { name, runs: [] })
      byName.get(name).runs.push({ width, lang, verdict, lines, shots })
    }
    lines = []
    shots = []
  }
  if (!decided)
    return {
      down: measured
        ? `no stand could be measured (${measured} runs)${why ? `: ${why}` : ''}`
        : down || 'no verdict line',
      measured: 0,
      stands: [],
    }
  return { down: '', measured: decided, stands: [...byName.values()] }
}

export const marker = (stand, deployId) =>
  `<!-- ${LABEL} stand=${stand} deploy=${deployId} -->`
export const issueTitle = stand =>
  `stand ${stand}: fails on the phone after a vibee-editor deploy`

/**
 * What to do with GitHub for each failing stand: nothing (this stand + deploy
 * is already filed, in an issue or a comment), comment on the stand's open
 * issue, or open one.
 * @param {Array<{name:string}>} stands
 * @param {{id:string}} deploy
 * @param {Array<{number:number,title:string,body?:string,state?:string,comments?:Array<{body?:string}>}>} issues
 */
export function planIssues(stands, deploy, issues) {
  return stands.map(stand => {
    const mark = marker(stand.name, deploy.id)
    const filed = issues.find(
      i =>
        String(i.body || '').includes(mark) ||
        (i.comments || []).some(c => String(c.body || '').includes(mark))
    )
    if (filed) return { kind: 'skip', stand: stand.name, number: filed.number }
    const open = issues.find(
      i =>
        String(i.state || '').toUpperCase() === 'OPEN' &&
        i.title === issueTitle(stand.name)
    )
    if (open) return { kind: 'comment', stand: stand.name, number: open.number }
    return { kind: 'create', stand: stand.name }
  })
}

const runBlock = r =>
  [
    `### ${r.verdict} at ${r.width}px (${r.lang})`,
    '',
    '```',
    ...(r.lines.length ? r.lines : ['(no assertion line was printed)']),
    '```',
    ...(r.shots.length
      ? [
          '',
          'Screenshots (on the Mac that ran the watch):',
          ...r.shots.map(s => `- \`${s}\``),
        ]
      : []),
  ].join('\n')

/** The failing runs of one stand, for a new issue or a comment. */
export function findings(stand, deploy) {
  return [
    `Deploy \`${deploy.id}\` of vibee-editor at ${deploy.at}, commit \`${deploy.sha || '?'}\`.`,
    '',
    ...stand.runs.map(runBlock),
    '',
    marker(stand.name, deploy.id),
  ].join('\n')
}

/** A Queen-delegatable spec: the steward hands `## Boundary` to a coder bee. */
export function issueBody(stand, deploy) {
  return [
    '## Context',
    '',
    `\`tri stands-after-deploy\` (launchd \`${JOB}\`, \`bin/helpers/stands-after-deploy.mjs\`) re-ran the phone stands on the deployed commit and the stand \`${stand.name}\` did not pass.`,
    'The stands use static mocks only; the failing lines below are the measurement of the real component in Chromium with a finger (`tri shot`).',
    '',
    findings(stand, deploy),
    '',
    '## Boundary',
    '',
    '- `apps/vibee-editor/player/src/` (the page or component the stand renders)',
    `- \`apps/vibee-editor/player/harness/${stand.name}.html\` and \`apps/vibee-editor/player/src/harness/\``,
    `- \`bin/helpers/shot.mjs\` (the \`${stand.name}\` entry of HARNESSES -- only if the stand itself is wrong)`,
    '',
    '## User Scenarios & Testing',
    '',
    `- **Given** the deployed mini-app, **When** a person opens the \`${stand.name}\` screen on a phone 390 or 320 px wide, in Russian or English, **Then** every control is a full finger target and nothing is cut, overlapped or shifted sideways.`,
    '',
    '## Requirements',
    '',
    `- FR-001: \`./bin/tri shot ${stand.name}\` MUST be green at 390 ru, 390 en and 320 ru.`,
    '- FR-002: A fix MUST NOT weaken a measurement in `bin/helpers/shot.mjs` to turn a stand green.',
    '',
    '## Success Criteria',
    '',
    `- \`./bin/tri shot all\` prints \`== shot green -- ${stand.name}\` for every width and language.`,
    '- The next deploy closes nothing by itself: close this issue with the PR that fixed it.',
    '',
  ].join('\n')
}

// --- side effects -------------------------------------------------------

const sh = (cmd, args, opts = {}) =>
  spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 << 20, ...opts })

/** Project and environment come from rail.sh, the one home of 999's ids. */
function railIds() {
  const text = readFileSync(join(HERE, 'rail.sh'), 'utf8')
  const pick = k => (new RegExp(`^${k}=(\\S+)`, 'm').exec(text) || [])[1]
  return { project: pick('RAIL_PROJECT'), env: pick('RAIL_ENV') }
}

function readDeploys(from) {
  if (from) return JSON.parse(readFileSync(from, 'utf8'))
  const { project, env } = railIds()
  const r = sh('railway', [
    'deployment',
    'list',
    '--json',
    '--project',
    project,
    '--environment',
    env,
    '--service',
    SERVICE,
  ])
  if (r.status !== 0) return null
  try {
    return JSON.parse(r.stdout)
  } catch {
    return null
  }
}

function gh(args) {
  const cmd = process.env.STANDS_GH || 'gh'
  return sh(cmd, args)
}

/** The deployed commit, checked out in a worktree of the main checkout. */
function ensureTree(main, tree, sha) {
  const git = (...a) => sh('git', ['-C', main, ...a])
  if (git('cat-file', '-e', `${sha}^{commit}`).status !== 0)
    git('fetch', '-q', 'origin', 'main')
  // A tree whose registration was pruned (`tri worktrees --apply`, a manual
  // `git worktree prune`) keeps its .git file but no longer checks out:
  // rebuild it instead of reporting "not measured" on every deploy.
  const reused =
    existsSync(join(tree, '.git')) &&
    sh('git', ['-C', tree, 'checkout', '-q', '--detach', '--force', sha])
      .status === 0
  if (!reused) {
    rmSync(tree, { recursive: true, force: true })
    git('worktree', 'prune')
    const add = git('worktree', 'add', '-q', '--detach', tree, sha)
    if (add.status !== 0)
      return `worktree add failed: ${add.stderr.trim().slice(0, 200)}`
  }
  sh('bash', [join(tree, 'bin/helpers/wt-deps.sh'), tree], {
    env: { ...process.env, TRI_WT_MAIN: main },
  })
  const P = 'apps/vibee-editor/player/node_modules'
  let present = false
  try {
    lstatSync(join(tree, P))
    present = true
  } catch {}
  if (!present) symlinkSync(join(main, P), join(tree, P))
  return ''
}

function lock(dir) {
  const l = join(dir, 'lock')
  try {
    mkdirSync(l)
    return () => rmSync(l, { recursive: true, force: true })
  } catch {
    // The lock may vanish between the two calls, and two runs may both find
    // it stale: either way one of them loses quietly, never crashes.
    try {
      const age = (Date.now() - statSync(l).mtimeMs) / 1000
      if (age < LOCK_STALE_S) return null
      rmSync(l, { recursive: true, force: true })
      mkdirSync(l)
      return () => rmSync(l, { recursive: true, force: true })
    } catch {
      return null
    }
  }
}

const get = (dir, f, d = '') => {
  try {
    return readFileSync(join(dir, f), 'utf8').trim()
  } catch {
    return d
  }
}

async function run(opt) {
  const dir = resolve(opt.stateDir)
  mkdirSync(dir, { recursive: true })
  const unlock = lock(dir)
  if (!unlock) {
    console.log('== stands busy -- another run holds the lock')
    return 0
  }
  try {
    return await runLocked(opt, dir)
  } finally {
    unlock()
  }
}

async function runLocked(opt, dir) {
  const rows = readDeploys(opt.deploysFrom)
  const deploy = rows && latestSuccess(rows)
  if (!deploy) {
    console.log(
      `== stands NOT MEASURED -- railway gave no SUCCESS deploy of ${SERVICE}`
    )
    return 2
  }
  if (!opt.force && get(dir, 'last-deploy') === deploy.id) {
    console.log(`== stands steady -- deploy ${deploy.id} already checked`)
    return 0
  }
  // --dry reads and measures but changes no state: no ledger line, no
  // attempt count, no last-deploy (a dry run must not use up a real try).
  const ledger = entry =>
    opt.dry ||
    appendFileSync(
      join(dir, 'ledger.jsonl'),
      JSON.stringify({
        at: new Date().toISOString(),
        deploy: deploy.id,
        sha: deploy.sha,
        ...entry,
      }) + '\n'
    )

  let text
  const tree = join(dir, 'tree')
  if (opt.shotsFrom) text = readFileSync(opt.shotsFrom, 'utf8')
  else {
    const bad = deploy.sha
      ? ensureTree(opt.main, tree, deploy.sha)
      : 'the deploy names no commit'
    text = bad
      ? `== shot NOT MEASURED -- all: ${bad}`
      : sh('node', [join(tree, 'bin/helpers/shot.mjs'), 'all'], {
          cwd: tree,
          timeout: 1800_000,
        }).stdout || ''
  }
  const doctor = opt.doctorFrom
    ? (t => ({ status: /^\s+! /m.test(t) ? 1 : 0, stdout: t }))(
        readFileSync(opt.doctorFrom, 'utf8')
      )
    : sh(
        'bash',
        [
          join(existsSync(tree) ? tree : resolve(HERE, '../..'), 'bin/tri'),
          'browser',
          'doctor',
        ],
        { timeout: 300_000 }
      )
  const anomalies = String(doctor.stdout || '')
    .split('\n')
    .filter(l => /^\s+! /.test(l))
    .map(l => l.trim())
  const doctorSaid = `browser doctor rc ${doctor.status ?? 2}${anomalies.length ? `, ${anomalies.length} anomalies` : ''}`

  const { down, measured, stands } = failingStands(text)
  if (down) {
    const tries = Number(get(dir, `attempts-${deploy.id}`, '0')) + 1
    if (!opt.dry)
      writeFileSync(join(dir, `attempts-${deploy.id}`), String(tries))
    const done = tries >= MAX_ATTEMPTS
    ledger({
      verdict: 'not measured',
      why: down.slice(0, 300),
      tries,
      gaveUp: done,
      doctor: doctor.status ?? 2,
      anomalies,
    })
    if (done && !opt.dry) writeFileSync(join(dir, 'last-deploy'), deploy.id)
    console.log(
      `== stands NOT MEASURED -- deploy ${deploy.id}: ${down.slice(0, 200)} (try ${tries}/${MAX_ATTEMPTS}${done ? ', giving up on this deploy' : ''}); ${doctorSaid}`
    )
    return 2
  }

  // Keep the red screenshots: the next deploy's run overwrites the tree's.
  const keep = join(dir, 'shots', deploy.id.slice(0, 8))
  for (const st of stands)
    for (const r of st.runs)
      r.shots = r.shots.map(p => {
        if (!existsSync(p)) return p
        mkdirSync(keep, { recursive: true })
        const to = join(keep, basename(p))
        copyFileSync(p, to)
        return to
      })

  const filed = []
  if (stands.length) {
    const list = gh([
      'issue',
      'list',
      '--repo',
      REPO,
      '--label',
      LABEL,
      '--state',
      'all',
      '--limit',
      '200',
      '--json',
      'number,title,body,state,comments',
    ])
    let issues
    try {
      issues = list.status === 0 ? JSON.parse(list.stdout || '[]') : null
    } catch {
      issues = null
    }
    if (!issues) {
      ledger({
        verdict: 'red',
        stands: stands.map(s => s.name),
        filed: 'gh issue list failed -- retry next tick',
      })
      console.log(
        `== stands RED -- ${stands.length} stand(s) failed, but GitHub could not be read; nothing filed, retried next tick`
      )
      return 1
    }
    for (const p of planIssues(stands, deploy, issues)) {
      const stand = stands.find(s => s.name === p.stand)
      if (p.kind === 'skip') {
        filed.push(`${p.stand} #${p.number} (already filed)`)
        continue
      }
      if (opt.dry) {
        filed.push(
          `${p.stand}: would ${p.kind}${p.number ? ` #${p.number}` : ''}`
        )
        continue
      }
      if (p.kind === 'comment') {
        const c = gh([
          'issue',
          'comment',
          String(p.number),
          '--repo',
          REPO,
          '--body',
          `Still failing.\n\n${findings(stand, deploy)}`,
        ])
        filed.push(
          `${p.stand} #${p.number} ${c.status === 0 ? 'commented' : 'comment FAILED'}`
        )
      } else {
        gh([
          'label',
          'create',
          LABEL,
          '--repo',
          REPO,
          '--color',
          'B60205',
          '--description',
          'A phone stand failed after a mini-app deploy',
        ])
        const c = gh([
          'issue',
          'create',
          '--repo',
          REPO,
          '--label',
          LABEL,
          '--title',
          issueTitle(p.stand),
          '--body',
          issueBody(stand, deploy),
        ])
        filed.push(
          `${p.stand} ${c.status === 0 ? c.stdout.trim() : 'create FAILED'}`
        )
      }
    }
  }
  const failedGh = filed.some(f => /FAILED/.test(f))
  ledger({
    verdict: stands.length ? 'red' : 'green',
    measured,
    stands: stands.map(s => s.name),
    filed,
    doctor: doctor.status ?? 2,
    anomalies,
  })
  if (!failedGh && !opt.dry) writeFileSync(join(dir, 'last-deploy'), deploy.id)
  for (const f of filed) console.log(`   issue   ${f}`)
  console.log(
    `== stands ${stands.length ? 'RED' : 'green'} -- deploy ${deploy.id} (${deploy.sha.slice(0, 9)}): ` +
      `${stands.length} stand(s) failed; ${doctorSaid}`
  )
  return stands.length ? 1 : 0
}

/**
 * The launchd job runs the installed copy against the main checkout. PATH is
 * pinned to the railway, node and gh found here (launchd's bare PATH once
 * found an old, logged-out railway -- relays-watch.sh, 2026-10-03).
 * The lookup uses THIS process's PATH (`bash -c`, as relays-watch does), not
 * a login shell: on this Mac `bash -lc` finds /usr/local/bin/railway 4.5.4,
 * logged out, ahead of the working nvm one, and install refused (2026-10-07).
 */
function install(opt) {
  const which = c => sh('bash', ['-c', `command -v ${c}`]).stdout.trim()
  const bins = ['railway', 'node', 'gh', 'git'].map(which)
  if (bins.some(b => !b)) {
    console.log(
      `stands: missing on PATH: ${['railway', 'node', 'gh', 'git'].filter((_, i) => !bins[i]).join(' ')} -- not installed`
    )
    return 1
  }
  const path =
    [...new Set(bins.map(b => dirname(b)))].join(':') +
    ':/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'
  if (
    sh('railway', ['whoami'], { env: { HOME: homedir(), PATH: path } })
      .status !== 0
  ) {
    console.log(
      `stands: ${bins[0]} is not logged in under the job PATH -- run railway login; not installed`
    )
    return 1
  }
  const lib = join(homedir(), '.local/lib/t27-stands')
  mkdirSync(lib, { recursive: true })
  for (const f of ['stands-after-deploy.mjs', 'rail.sh'])
    copyFileSync(join(HERE, f), join(lib, f))
  const plist = join(homedir(), 'Library/LaunchAgents', `${JOB}.plist`)
  const log = join(homedir(), 'Library/Logs/t27-stands-after-deploy.log')
  mkdirSync(dirname(plist), { recursive: true })
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  writeFileSync(
    plist,
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>${JOB}</string>
	<key>ProcessType</key>
	<string>Standard</string>
	<key>ProgramArguments</key>
	<array>
		<string>${esc(bins[1])}</string>
		<string>${esc(join(lib, 'stands-after-deploy.mjs'))}</string>
		<string>run</string>
		<string>--main</string>
		<string>${esc(opt.main)}</string>
	</array>
	<key>EnvironmentVariables</key>
	<dict>
		<key>PATH</key>
		<string>${esc(path)}</string>
	</dict>
	<key>RunAtLoad</key>
	<true/>
	<key>StartInterval</key>
	<integer>${INTERVAL_S}</integer>
	<key>StandardOutPath</key>
	<string>${esc(log)}</string>
	<key>StandardErrorPath</key>
	<string>${esc(log)}</string>
</dict>
</plist>
`
  )
  const uid = sh('id', ['-u']).stdout.trim()
  const lc = process.env.LAUNCHCTL || 'launchctl'
  sh(lc, ['bootout', `gui/${uid}/${JOB}`])
  const b = sh(lc, ['bootstrap', `gui/${uid}`, plist])
  console.log(
    b.status === 0
      ? `stands: installed, every ${INTERVAL_S / 60} min, log ${log}`
      : `stands: launchctl bootstrap failed: ${b.stderr.trim()}`
  )
  return b.status === 0 ? 0 : 1
}

function status(opt) {
  const uid = sh('id', ['-u']).stdout.trim()
  const p = sh('launchctl', ['print', `gui/${uid}/${JOB}`])
  console.log(
    p.status === 0
      ? p.stdout
          .split('\n')
          .filter(l => /state =|last exit code/.test(l))
          .map(l => `  ${l.trim()}`)
          .join('\n')
      : '  not installed (tri stands-after-deploy install)'
  )
  console.log(
    `  last deploy checked: ${get(resolve(opt.stateDir), 'last-deploy', 'none')}`
  )
  const led = get(resolve(opt.stateDir), 'ledger.jsonl')
    .split('\n')
    .filter(Boolean)
    .slice(-3)
  for (const l of led) console.log(`  ledger: ${l.slice(0, 220)}`)
  return 0
}

async function main(argv) {
  const opt = name => {
    const i = argv.indexOf(`--${name}`)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const common = sh('git', [
    '-C',
    HERE,
    'rev-parse',
    '--path-format=absolute',
    '--git-common-dir',
  ]).stdout.trim()
  const o = {
    stateDir: opt('state-dir') ?? join(homedir(), '.local/state/stands'),
    main: resolve(opt('main') ?? (common ? dirname(common) : '.')),
    deploysFrom: opt('deploys-from'),
    shotsFrom: opt('shots-from'),
    doctorFrom: opt('doctor-from'),
    dry: argv.includes('--dry'),
    force: argv.includes('--force'),
  }
  const cmd = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'status'
  if (cmd === 'run') return run(o)
  if (cmd === 'install') return install(o)
  if (cmd === 'status') return status(o)
  console.log(
    'usage: tri stands-after-deploy run|install|status [--dry] [--force]'
  )
  return 2
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  process.exit(await main(process.argv.slice(2)))
