/**
 * THE EXPERIMENTS RUN ON RAILWAY TOO: mutant lists and spec controls.
 *
 * Until 2026-10-05 the runner had tsc and vitest suites only, so every
 * `tri mutants` list and every `t27c test-report` still ran on the Mac --
 * the machine the runner exists to spare (queen-reel-keeper, "Known gap").
 * These two suites close that gap. server.mjs runs one command per name:
 *
 *   node suites.mjs mutants <list.json>   one mutant list (tri mutants)
 *   node suites.mjs spec <spec.t27>       one spec (t27c test-report, then
 *                                         tri spec-controls when a
 *                                         <id>.controls.json sits beside it)
 *
 * from the root of the unpacked archive, which server.mjs has already made
 * a git repository (SNAPSHOT). The tools themselves -- bin/helpers/mutants.py,
 * bin/helpers/spec-controls.mjs, readTestReport of scripts/check-t27-specs.mjs
 * -- come from that archive: this file only decides how to call them and
 * reads what they say. It lives in the image, not the archive, so a branch
 * without it still gets an answer.
 *
 * Exit 0 every mutant killed / every test and control passed; 1 a survivor,
 * a FAIL row or a missed control; 2 unmeasured -- no t27c, no zig, no table,
 * no test to run, a tree that is not a repository. 2 is never green.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { delimiter, dirname, join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

export const UNMEASURED = 2

/*
 * A name a caller may give either suite: a relative path inside the
 * archive, plain characters only, no `.`/`..` segment, no leading `-` (a
 * flag), ending in the suite's own extension. Checked before anything is
 * read; server.mjs quotes it besides.
 */
const PLAIN_PATH = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/
const EXT = { mutants: '.json', spec: '.t27' }
export function experimentPath(suite, name) {
  if (!EXT[suite] || typeof name !== 'string') return false
  if (!PLAIN_PATH.test(name) || name.startsWith('-')) return false
  if (name.split('/').some(s => s === '.' || s === '..')) return false
  return name.endsWith(EXT[suite]) && name.length > EXT[suite].length
}

/* Several verdicts as one: any real failure is 1; otherwise any unmeasured is 2. */
export function combine(codes) {
  if (!codes.length) return UNMEASURED
  if (codes.some(c => c !== 0 && c !== UNMEASURED)) return 1
  return codes.includes(UNMEASURED) ? UNMEASURED : 0
}

/* A tool's own exit code as one of ours: 0 and 1 are verdicts, the rest is not. */
const asVerdict = rc => (rc === 0 || rc === 1 ? rc : UNMEASURED)

const WORKERS = process.env.CHECK_WORKERS || '2'
const LOOP_LIST = /^\.claude\/loop-state\/([a-z0-9-]+)-mutants\.json$/
const LOOP_TESTS = /<!-- loop-tests: *(.*[^ ]) *-->/

/*
 * Where a list runs and against what. Its paths are relative to where it
 * is run (skill t27-spec-first: "tri mutants -- from the package dir"):
 *   - a loop's guard list, .claude/loop-state/<name>-mutants.json, from the
 *     repository root against its loop's `<!-- loop-tests: -->` marker, the
 *     command `tri loop-guard` runs it with;
 *   - any other list from the nearest directory holding a package.json,
 *     against vitest on its sibling test (<id>.mutants.json -> <id>.test.ts)
 *     plus each mutant's own "tests".
 * Returns { cwd, list, cmd } or { why } when there is nothing honest to run.
 */
export function listPlan(root, list) {
  const loop = LOOP_LIST.exec(list)
  if (loop) {
    const md = join(root, '.claude/loop-state', `${loop[1]}-loop.md`)
    const marker = existsSync(md)
      ? LOOP_TESTS.exec(readFileSync(md, 'utf8'))
      : null
    if (!marker) return { why: `no loop-tests marker in ${relative(root, md)}` }
    return { cwd: root, list, cmd: ['bash', '-c', marker[1]] }
  }
  let dir = dirname(join(root, list))
  while (dir !== root && !existsSync(join(dir, 'package.json')))
    dir = dirname(dir)
  const stem = join(root, list).replace(/(\.mutants)?\.json$/, '')
  const sibling = ['.test.ts', '.test.tsx', '.test.mjs', '.test.js']
    .map(ext => stem + ext)
    .find(existsSync)
  let muts
  try {
    muts = JSON.parse(readFileSync(join(root, list), 'utf8'))
  } catch (e) {
    return { why: `cannot read the list: ${String(e.message).slice(0, 120)}` }
  }
  if (!Array.isArray(muts) || !muts.length) return { why: 'the list is empty' }
  if (!sibling) {
    const bare = muts.findIndex(
      m => !m || !Array.isArray(m.tests) || !m.tests.length
    )
    if (bare >= 0)
      return {
        why: `mutant #${bare + 1} names no "tests" and the list has no sibling test file`,
      }
  }
  return {
    cwd: dir,
    list: relative(dir, join(root, list)),
    cmd: [
      'npx',
      'vitest',
      'run',
      `--maxWorkers=${WORKERS}`,
      ...(sibling ? [relative(dir, sibling)] : []),
    ],
  }
}

const git = (root, env, ...args) =>
  spawnSync('git', args, { cwd: root, env, encoding: 'utf8' })

/*
 * One mutant list. tri mutants restores each file itself; a run killed
 * outright (the runner's time limit is SIGKILL) cannot, so afterwards every
 * tracked file goes back to the snapshot BY GIT -- this tree is the
 * runner's own, nobody else's edit lives in it. A mutated file the tool
 * should have restored and did not makes the verdict unmeasured.
 */
export function runMutants(
  root,
  list,
  { out = process.stdout, env = process.env } = {}
) {
  const say = s => out.write(`${s}\n`)
  if (
    git(root, env, 'rev-parse', '--is-inside-work-tree').stdout.trim() !==
    'true'
  ) {
    say(
      'unmeasured: the tree is not a repository, so a mutant cannot be reverted by git'
    )
    return UNMEASURED
  }
  const tool = join(root, 'bin/helpers/mutants.py')
  if (!existsSync(tool)) {
    say('unmeasured: no bin/helpers/mutants.py in the archive')
    return UNMEASURED
  }
  if (!existsSync(join(root, list))) {
    say(`unmeasured: no ${list} in the archive`)
    return UNMEASURED
  }
  const plan = listPlan(root, list)
  if (plan.why) {
    say(`unmeasured: ${plan.why}`)
    return UNMEASURED
  }
  say(
    `:: mutants ${plan.list} (from ${relative(root, plan.cwd) || '.'}) -- ${plan.cmd.join(' ')}`
  )
  /* Straight through, unbuffered: a long list shows each verdict as it lands. */
  const r = spawnSync('python3', [tool, plan.list, '--', ...plan.cmd], {
    cwd: plan.cwd,
    env: { ...env, VITEST_MAX_WORKERS: WORKERS, PYTHONUNBUFFERED: '1' },
    stdio: ['ignore', 'inherit', 'inherit'],
  })
  let code = r.error ? UNMEASURED : asVerdict(r.status)
  const left = git(root, env, 'diff', '--name-only')
    .stdout.split('\n')
    .filter(Boolean)
  if (left.length) {
    git(root, env, 'checkout', '-q', '--', '.')
    say(`:: reverted by git: ${left.join(', ')}`)
    let muts = []
    try {
      muts = JSON.parse(readFileSync(join(root, list), 'utf8'))
    } catch {}
    const mutated = new Set(
      muts.map(m => relative(root, join(plan.cwd, String(m?.file))))
    )
    if (left.some(f => mutated.has(f))) {
      say('unmeasured: a mutated file was still mutated after the run')
      code = UNMEASURED
    }
  }
  if (git(root, env, 'diff', '--quiet').status !== 0) {
    say('unmeasured: the tree could not be put back')
    code = UNMEASURED
  }
  return code
}

/* t27c: T27C, else on PATH. */
export function findT27c(env = process.env) {
  if (env.T27C) return existsSync(env.T27C) ? env.T27C : null
  for (const d of String(env.PATH || '').split(delimiter))
    if (d && existsSync(join(d, 't27c'))) return join(d, 't27c')
  return null
}

/*
 * The verdict of one `t27c test-report` output. t27c exits 0 with FAIL
 * rows, so its exit code says nothing: the table does. No table, no test,
 * or no zig to run them is unmeasured.
 */
export function reportVerdict(text, readTestReport) {
  if (/zig not on PATH/.test(text)) return { code: UNMEASURED, why: 'no zig' }
  const r = readTestReport(text)
  if (r.tests === null || r.fail === null)
    return { code: UNMEASURED, why: 'the test-report table could not be read' }
  if (!r.tests) return { code: UNMEASURED, why: 'test-report ran no test' }
  if (r.fail)
    return {
      code: 1,
      why: `${r.fail} of ${r.tests} fail: ${r.failed.join('; ')}`,
    }
  return { code: 0, why: `${r.tests} tests pass` }
}

/* One spec: its own tests, then its negative controls when it has a list. */
export async function runSpec(
  root,
  spec,
  { out = process.stdout, env = process.env } = {}
) {
  const say = s => out.write(`${s}\n`)
  const t27c = findT27c(env)
  if (!t27c) {
    say('unmeasured: no t27c on this runner (T27C or PATH)')
    return UNMEASURED
  }
  if (!existsSync(join(root, spec))) {
    say(`unmeasured: no ${spec} in the archive`)
    return UNMEASURED
  }
  const reader = join(root, 'scripts/check-t27-specs.mjs')
  if (!existsSync(reader)) {
    say('unmeasured: no scripts/check-t27-specs.mjs to read the table with')
    return UNMEASURED
  }
  const { readTestReport } = await import(pathToFileURL(reader).href)
  const r = spawnSync(t27c, ['test-report', spec], {
    cwd: root,
    env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  const text = String(r.stdout || '') + String(r.stderr || '')
  out.write(text)
  const v = reportVerdict(text, readTestReport)
  say(
    `:: test-report ${spec}: ${v.code === 0 ? 'ok' : v.code === 1 ? 'FAIL' : 'unmeasured'} -- ${v.why} (t27c exit ${r.status})`
  )
  if (v.code !== 0) return v.code
  const controls = join(root, spec).replace(/\.t27$/, '.controls.json')
  if (!existsSync(controls)) return 0
  const tool = join(root, 'bin/helpers/spec-controls.mjs')
  if (!existsSync(tool)) {
    say('unmeasured: no bin/helpers/spec-controls.mjs in the archive')
    return UNMEASURED
  }
  say(`:: spec-controls ${spec} ${relative(root, controls)}`)
  const c = spawnSync(
    process.execPath,
    [tool, spec, relative(root, controls)],
    {
      cwd: root,
      env: { ...env, T27C: t27c },
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    }
  )
  out.write(String(c.stdout || ''))
  out.write(String(c.stderr || ''))
  return combine([0, c.error ? UNMEASURED : asVerdict(c.status)])
}

if (process.argv[1] && process.argv[1].endsWith('suites.mjs')) {
  const [suite, name] = process.argv.slice(2)
  if (!experimentPath(suite, name)) {
    console.log(`unmeasured: not a ${suite} name: ${JSON.stringify(name)}`)
    process.exit(UNMEASURED)
  }
  const root = process.cwd()
  process.exit(
    suite === 'mutants' ? runMutants(root, name) : await runSpec(root, name)
  )
}
