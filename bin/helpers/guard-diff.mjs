// tri guard-diff <claims|prices> <rows-file|-> [--base REF] [--head REF|PR|DIR]
//
// WHY (#3772). In rounds 1-3 of #3758 (printed-facts.ts) and #3759
// (claimed-but-not-done.ts) every reviewer rebuilt the same probe by hand:
// worktrees for main and the PR, a scratch script importing the guard, a list
// of rows run against both, lost claims and needless notes counted. The probe
// was deleted after each round, so no row reached the next one. This is that
// probe, kept: rows live in a file, and scripts/guard-corpus/ is the start.
//
// Rows, one JSON object per line (blank lines and lines starting with # are
// skipped):
//   claims  {"text": "...", "expect": "flag" | "silent"}
//   prices  {"heard": "...", "printed": "...", "expect": "ask" | "confirm"}
// `expect` is the safe-side truth: a claim of delivered media flags, a price
// changed by a multiplier asks.
//
// Refs: --base defaults to origin/main; --head defaults to THIS tree (its
// uncommitted edits included). A number is a PR (its head commit is fetched),
// an existing directory is reused as is, anything else is a git ref. Each ref
// is checked out into a temporary worktree under $TMPDIR, removed on exit.
//
// rc 0 = no regression vs base, 1 = a REGRESSION (head loses a claim or
// confirms a price that base caught), 2 = nothing measured (bad rows, a ref
// that does not resolve, an evaluator that failed).
//
// Test seam: TRI_GUARD_DIFF_STUB=<file> holding {"base": [...], "head": [...]}
// verdicts; no git, no worktree and no tsx are touched then.
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const AGENT = 'apps/vibee-editor/render/src/agent'

export const GUARDS = {
  claims: {
    file: `${AGENT}/claimed-but-not-done.ts`,
    fields: ['text'],
    safe: 'flag',
    unsafe: 'silent',
    caught: 'flagged',
    lost: 'lost',
    noted: 'needless notes',
  },
  prices: {
    file: `${AGENT}/printed-facts.ts`,
    fields: ['heard', 'printed'],
    safe: 'ask',
    unsafe: 'confirm',
    caught: 'asked',
    lost: 'wrong confirms',
    noted: 'needless asks',
  },
}

export const USAGE = `tri guard-diff <claims|prices> <rows-file|-> [--base REF] [--head REF|PR|DIR]
  claims rows: {"text": "...", "expect": "flag"|"silent"}
  prices rows: {"heard": "...", "printed": "...", "expect": "ask"|"confirm"}
  --base  default origin/main      --head  default this tree (uncommitted included)
  rc 0 no regression, 1 REGRESSION vs base, 2 not measured
  corpus: scripts/guard-corpus/claims.jsonl, scripts/guard-corpus/prices.jsonl`

/**
 * Rows of a JSONL file for one guard. Never throws: a broken line is an
 * error naming its line number, and a file with no rows is an error too (a
 * probe that measured nothing is not a pass).
 */
export function parseRows(text, guard) {
  const g = GUARDS[guard]
  if (!g) return { rows: [], errors: [`unknown guard "${guard}"`] }
  const rows = []
  const errors = []
  String(text)
    .split(/\r?\n/)
    .forEach((raw, i) => {
      const line = i + 1
      const s = raw.trim()
      if (!s || s.startsWith('#')) return
      let o
      try {
        o = JSON.parse(s)
      } catch {
        errors.push(`line ${line}: not JSON`)
        return
      }
      if (!o || typeof o !== 'object' || Array.isArray(o)) {
        errors.push(`line ${line}: not a JSON object`)
        return
      }
      for (const f of g.fields) {
        if (typeof o[f] !== 'string' || !o[f].trim()) {
          errors.push(`line ${line}: "${f}" must be a non-empty string`)
          return
        }
      }
      if (o.expect !== g.safe && o.expect !== g.unsafe) {
        errors.push(
          `line ${line}: "expect" must be "${g.safe}" or "${g.unsafe}"`
        )
        return
      }
      const row = { line, expect: o.expect }
      for (const f of g.fields) row[f] = o[f]
      rows.push(row)
    })
  if (!rows.length && !errors.length) errors.push('no rows')
  return { rows, errors }
}

/**
 * The mark of one row whose verdict changed, or null when it did not.
 * REGRESSION: the row's truth is the safe side, base was on it, head left it
 * (a lost claim, a wrong confirm). The other three marks are reported only.
 */
export function markOf(guard, expect, base, head) {
  if (base === head) return null
  const { safe } = GUARDS[guard]
  if (expect === safe) return base === safe ? 'REGRESSION' : 'fixed'
  return head === safe ? 'needless' : 'cleared'
}

/** Counts for each side and every changed row. Pure. */
export function judge(guard, rows, base, head) {
  const g = GUARDS[guard]
  if (base.length !== rows.length || head.length !== rows.length)
    throw new Error(
      `verdict count mismatch: ${rows.length} rows, base ${base.length}, head ${head.length}`
    )
  const count = verdicts => {
    const c = { caught: 0, lost: 0, noted: 0 }
    rows.forEach((r, i) => {
      if (r.expect === g.safe) c[verdicts[i] === g.safe ? 'caught' : 'lost']++
      else if (verdicts[i] === g.safe) c.noted++
    })
    return c
  }
  const changes = []
  rows.forEach((r, i) => {
    const mark = markOf(guard, r.expect, base[i], head[i])
    if (mark) changes.push({ row: r, base: base[i], head: head[i], mark })
  })
  return {
    safeTotal: rows.filter(r => r.expect === g.safe).length,
    honestTotal: rows.filter(r => r.expect === g.unsafe).length,
    base: count(base),
    head: count(head),
    changes,
  }
}

/** rc 1 when head regressed against base on soundness, else 0. */
export function exitCode(report) {
  return report.changes.some(c => c.mark === 'REGRESSION') ? 1 : 0
}

const ORDER = ['REGRESSION', 'needless', 'fixed', 'cleared']

function rowText(guard, r) {
  return guard === 'claims'
    ? JSON.stringify(r.text)
    : `${JSON.stringify(r.heard)} -> ${JSON.stringify(r.printed)}`
}

/** The printed report. Pure. */
export function format(guard, report, labels) {
  const g = GUARDS[guard]
  const pad = (s, n) => String(s).padEnd(n)
  const side = (name, c) =>
    `  ${pad(name, 6)}${pad(labels[name], 34)}${pad(`${c.caught}/${report.safeTotal}`, 10)}${pad(c.lost, 16)}${c.noted}/${report.honestTotal}`
  const out = [
    `tri guard-diff ${guard}: ${report.safeTotal + report.honestTotal} rows (${report.safeTotal} ${g.safe}, ${report.honestTotal} ${g.unsafe})`,
    `  ${pad('', 6)}${pad('ref', 34)}${pad(g.caught, 10)}${pad(g.lost, 16)}${g.noted}`,
    side('base', report.base),
    side('head', report.head),
    '',
  ]
  const changes = [...report.changes].sort(
    (a, b) => ORDER.indexOf(a.mark) - ORDER.indexOf(b.mark)
  )
  out.push(`changed rows: ${changes.length}`)
  for (const c of changes)
    out.push(
      `  ${pad(c.mark, 11)}line ${pad(c.row.line, 5)}expect ${pad(c.row.expect, 8)}base ${pad(c.base, 8)}head ${pad(c.head, 8)}${rowText(guard, c.row)}`
    )
  const reg = changes.filter(c => c.mark === 'REGRESSION').length
  out.push(
    '',
    reg
      ? `REGRESSION: head is worse than base on ${reg} row(s) -- rc 1`
      : 'no regression vs base -- rc 0'
  )
  return out.join('\n')
}

/* ---------- refs, worktrees and the evaluator (not used under the stub) */

const git = (...args) =>
  execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()

const short = sha => sha.slice(0, 9)

/** {label, sha} for a ref to check out, or {label, tree} for a reused tree. */
function resolveRef(spec) {
  if (spec === undefined) return { label: 'this tree', tree: ROOT }
  if (fs.existsSync(spec) && fs.statSync(spec).isDirectory()) {
    const tree = path.resolve(spec)
    return { label: `tree ${tree}`, tree }
  }
  if (/^\d+$/.test(spec)) {
    const r = spawnSync(
      'gh',
      ['pr', 'view', spec, '--json', 'headRefOid', '-q', '.headRefOid'],
      { cwd: ROOT, encoding: 'utf8' }
    )
    const sha = (r.stdout || '').trim()
    if (r.status !== 0 || !/^[0-9a-f]{40}$/.test(sha))
      throw new Error(`PR ${spec}: gh did not name a head commit`)
    git('fetch', '-q', 'origin', `pull/${spec}/head`)
    git('cat-file', '-e', `${sha}^{commit}`)
    return { label: `PR ${spec} ${short(sha)}`, sha }
  }
  if (spec.startsWith('origin/')) {
    const r = spawnSync(
      'git',
      ['fetch', '-q', 'origin', spec.slice('origin/'.length)],
      {
        cwd: ROOT,
        encoding: 'utf8',
      }
    )
    if (r.status !== 0)
      process.stderr.write(`  fetch ${spec} failed; using the local copy\n`)
  }
  const sha = git('rev-parse', '--verify', `${spec}^{commit}`)
  return { label: `${spec} ${short(sha)}`, sha }
}

function tsxBin() {
  for (const p of [
    path.join(ROOT, 'apps/vibee-editor/render/node_modules/.bin/tsx'),
    path.join(ROOT, 'node_modules/.bin/tsx'),
  ])
    if (fs.existsSync(p)) return p
  throw new Error(
    'no tsx in this tree (render or root node_modules): run tri wt-deps'
  )
}

/* The guard modules import nothing today; a bare import needs node_modules. */
function needsDeps(file) {
  return /\bfrom\s+['"][^./]|\bimport\(\s*['"][^./]/.test(
    fs.readFileSync(file, 'utf8')
  )
}

function evaluateTree(guard, tree, rows, fresh) {
  const file = path.join(tree, GUARDS[guard].file)
  if (!fs.existsSync(file)) throw new Error(`${file} does not exist`)
  if (fresh && needsDeps(file)) {
    const d = spawnSync(
      'bash',
      [path.join(ROOT, 'bin/helpers/wt-deps.sh'), tree],
      {
        encoding: 'utf8',
      }
    )
    if (d.status !== 0) throw new Error(`wt-deps failed for ${tree}`)
  }
  const r = spawnSync(tsxBin(), [path.join(HERE, 'guard-diff-eval.ts')], {
    cwd: tree,
    input: JSON.stringify({ guard, file, rows }),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (r.status !== 0)
    throw new Error(
      `evaluator failed in ${tree}: ${(r.stderr || '').trim().split('\n')[0]}`
    )
  return JSON.parse(r.stdout)
}

function makeTrees() {
  const made = []
  let dir
  const cleanup = () => {
    for (const t of made.splice(0)) {
      spawnSync('git', ['worktree', 'remove', '--force', t], { cwd: ROOT })
    }
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
    dir = undefined
    spawnSync('git', ['worktree', 'prune'], { cwd: ROOT })
  }
  const add = (name, sha) => {
    dir = dir || fs.mkdtempSync(path.join(os.tmpdir(), 'tri-guard-diff-'))
    const t = path.join(dir, name)
    git('worktree', 'add', '-q', '--detach', t, sha)
    made.push(t)
    return t
  }
  return { add, cleanup }
}

function parseArgs(argv) {
  const a = { pos: [] }
  for (let i = 0; i < argv.length; i++) {
    const s = argv[i]
    if (s === '--base' || s === '--head') {
      if (argv[i + 1] === undefined) throw new Error(`${s} needs a value`)
      a[s.slice(2)] = argv[++i]
    } else if (s === '-h' || s === '--help') a.help = true
    else a.pos.push(s)
  }
  return a
}

export function main(argv, env = process.env) {
  let args
  try {
    args = parseArgs(argv)
  } catch (e) {
    console.error(`${e.message}\n${USAGE}`)
    return 2
  }
  if (args.help) {
    console.log(USAGE)
    return 0
  }
  const [guard, rowsFile] = args.pos
  if (!GUARDS[guard] || !rowsFile || args.pos.length > 2) {
    console.error(USAGE)
    return 2
  }
  let text
  try {
    text = fs.readFileSync(rowsFile === '-' ? 0 : rowsFile, 'utf8')
  } catch (e) {
    console.error(`cannot read ${rowsFile}: ${e.message}`)
    return 2
  }
  const { rows, errors } = parseRows(text, guard)
  if (errors.length) {
    console.error(`${rowsFile}: ${errors.length} bad row(s), nothing measured`)
    for (const e of errors.slice(0, 20)) console.error(`  ${e}`)
    return 2
  }

  let base, head
  const labels = {}
  const trees = makeTrees()
  const onSignal = () => {
    trees.cleanup()
    process.exit(130)
  }
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)
  try {
    if (env.TRI_GUARD_DIFF_STUB) {
      const s = JSON.parse(fs.readFileSync(env.TRI_GUARD_DIFF_STUB, 'utf8'))
      ;[base, head] = [s.base, s.head]
      labels.base = labels.head = 'stub'
    } else {
      const refs = {
        base: resolveRef(args.base ?? 'origin/main'),
        head: resolveRef(args.head),
      }
      const bySha = new Map()
      for (const role of ['base', 'head']) {
        const ref = refs[role]
        labels[role] = ref.label
        let tree = ref.tree
        let fresh = false
        if (!tree) {
          tree = bySha.get(ref.sha)
          if (!tree) {
            tree = trees.add(role, ref.sha)
            bySha.set(ref.sha, tree)
            fresh = true
          }
        }
        const v = evaluateTree(guard, tree, rows, fresh)
        if (role === 'base') base = v
        else head = v
      }
    }
    const report = judge(guard, rows, base, head)
    console.log(format(guard, report, labels))
    return exitCode(report)
  } catch (e) {
    console.error(`not measured: ${e.message}`)
    return 2
  } finally {
    trees.cleanup()
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
  }
}

// realpath: under $TMPDIR (/var -> /private/var) argv[1] and import.meta.url
// name one file two ways, and a bare comparison ran nothing and said rc 0.
const invoked = process.argv[1] && fs.realpathSync(process.argv[1])
if (invoked && import.meta.url === pathToFileURL(invoked).href)
  process.exitCode = main(process.argv.slice(2))
