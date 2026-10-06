/*
 * Runs under both runners: vitest collects it with the repository's suite,
 * and `node --test deployment/check-runner/server.test.mjs` runs it alone
 * with nothing installed -- the runner's own image carries no vitest.
 */
const { describe, it, afterEach } = process.env.VITEST
  ? await import('vitest')
  : await import('node:test')
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/* The server reads these once, on import: a test key and a scratch dir. */
process.env.CHECK_RUNNER_KEY = 'test-key'
process.env.CHECK_WORK = mkdtempSync(join(tmpdir(), 'check-runner-work-'))
const {
  SNAPSHOT,
  WEBSITE_SCRIPT,
  refusal,
  suiteCommands,
  projectsFor,
  onNode22,
  browserSkipped,
  verdict,
  skipWatcher,
  SKIPPED_BROWSER,
  server,
} = await import('./server.mjs')

/* The hook's GIT_DIR must not aim these fixtures at the real repository. */
const NO_GIT_ENV = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))
)

const dirs = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

/* A tree the way tar leaves it on the runner: files, no .git. */
function unpacked() {
  const d = mkdtempSync(join(tmpdir(), 'check-runner-'))
  dirs.push(d)
  mkdirSync(join(d, 'src'))
  writeFileSync(join(d, 'src', 'a.ts'), 'export const a = 1\n')
  writeFileSync(join(d, 'src', 'Привет.ts'), 'export const b = 2\n')
  writeFileSync(join(d, '.gitignore'), 'node_modules\n')
  writeFileSync(join(d, '.check-files'), 'src/a.ts\n')
  return d
}

const lsFiles = (cwd, ...extra) =>
  spawnSync('git', ['ls-files', '-z', ...extra], {
    cwd,
    env: NO_GIT_ENV,
    encoding: 'utf8',
  })

describe('the unpacked tree is a repository before any check runs', () => {
  it('without the snapshot, a guard reading git ls-files is blind', () => {
    const r = lsFiles(unpacked())
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /not a git repository/)
  })

  it('git ls-files lists exactly what arrived, minus the gate list', () => {
    const d = unpacked()
    /* Present or not, node_modules stays out: the archive's .gitignore. */
    mkdirSync(join(d, 'node_modules'))
    writeFileSync(join(d, 'node_modules', 'x.js'), '')
    execFileSync('bash', ['-lc', SNAPSHOT], { cwd: d, env: NO_GIT_ENV })
    const tracked = lsFiles(d).stdout.split('\0').filter(Boolean).sort()
    assert.deepEqual(
      tracked,
      ['.gitignore', 'src/a.ts', 'src/Привет.ts'].sort()
    )
    const others = lsFiles(d, '--others', '--exclude-standard').stdout
    assert.equal(others, '')
  })
})

/* What a hostile or careless caller could put in files=. */
const NOT_SCRIPTS = [
  'check:x;rm -rf /',
  '../',
  '',
  '--help',
  'check:x --help',
  'check:$(id)',
  'check:x\nrm -rf /',
  'dev',
  'build',
  'test:unit',
  'check:Queen',
]

describe('website: only a check script name ever reaches the shell', () => {
  it('a check or typecheck script of apps/website passes', () => {
    for (const name of [
      'check:queen-castle',
      'typecheck:ratchet',
      'check',
      'check:docs:links-2',
    ]) {
      assert.ok(WEBSITE_SCRIPT.test(name), name)
      assert.equal(refusal(['website'], [name]), null, name)
    }
    assert.deepEqual(suiteCommands('website', ['check:queen-castle']), [
      "cd apps/website && npm run 'check:queen-castle'",
    ])
  })

  it('anything else is refused, and the suite has no command for it', () => {
    for (const name of NOT_SCRIPTS) {
      const why = JSON.stringify(name)
      assert.match(
        refusal(['website'], [name]) ?? 'passed',
        /not a website check script/,
        why
      )
      assert.equal(suiteCommands('website', [name]), null, why)
    }
  })

  it('one bad name refuses the whole list', () => {
    const names = ['check:queen-castle', 'check:x;rm -rf /']
    assert.match(refusal(['website'], names), /not a website check script/)
    assert.equal(suiteCommands('website', names), null)
  })

  it('no names, a mix with a bot suite, or an unknown suite is refused', () => {
    assert.match(refusal(['website'], []), /needs files=/)
    assert.match(refusal(['website', 'render'], ['check:x']), /runs alone/)
    assert.match(refusal(['nope'], []), /unknown suite: nope/)
    assert.equal(refusal(['render', 'root'], ['a.test.ts']), null)
  })
})

describe('the HTTP door refuses a bad name before reading the archive', () => {
  let base
  const post = async query => {
    if (!base) {
      await new Promise(r => server.listen(0, '127.0.0.1', r))
      base = `http://127.0.0.1:${server.address().port}`
    }
    const r = await fetch(`${base}/run?${query}`, {
      method: 'POST',
      headers: { 'x-check-key': 'test-key' },
      body: 'not an archive',
    })
    return { status: r.status, text: await r.text() }
  }

  it('every name as sent is checked: a flag is refused, not dropped', async () => {
    try {
      for (const name of ['--help', '', 'check:x;rm -rf /', '../']) {
        const q = `suites=website&files=${encodeURIComponent(name)}`
        const r = await post(q)
        assert.equal(r.status, 400, q)
        assert.match(r.text, /not a website check script/, q)
      }
      const none = await post('suites=website')
      assert.equal(none.status, 400)
      assert.match(none.text, /needs files=/)
      /* A good name gets past the door and on to the (bad) archive. */
      const good = await post('suites=website&files=check:queen-castle')
      assert.equal(good.status, 400)
      assert.match(good.text, /not a \.tar\.gz/)
    } finally {
      server.closeAllConnections()
      await new Promise(r => server.close(r))
      rmSync(process.env.CHECK_WORK, { recursive: true, force: true })
    }
  })
})

describe('a run installs only the projects its suites use', () => {
  const BOT = [
    '.',
    'apps/vibee-editor/render',
    'apps/vibee-editor/player',
    'apps/vibee-editor/packages/vibee-atoms',
  ]
  const dirsFor = suites => projectsFor(suites).map(p => p.dir)

  it("website installs trinity's apps/website and nothing of the bot", () => {
    assert.deepEqual(dirsFor(['website']), ['apps/website'])
  })

  it("the bot's suites install the four bot projects, as before", () => {
    for (const s of ['render', 'player', 'root', 'guard', 'types'])
      assert.deepEqual(dirsFor([s]), BOT, s)
    assert.deepEqual(dirsFor(['render', 'root-types']), BOT)
  })

  it('apps/website installs and runs on Node 22', () => {
    assert.equal(projectsFor(['website'])[0].node22, true)
    assert.match(onNode22('npm ci'), /^export PATH='[^']+':"\$PATH" && npm ci$/)
  })
})

describe('a browser check that skipped for want of Chrome has failed', () => {
  /* trinity's own words, from apps/website/qa/*-contract.mjs. */
  const SKIP = '  no Chrome found — skipping the pick check.'

  it('a skip line turns exit 0 into a failure', () => {
    assert.equal(browserSkipped(`vite built in 4s\n${SKIP}\n`), true)
    assert.notEqual(SKIPPED_BROWSER, 0)
    assert.equal(verdict(0, true), SKIPPED_BROWSER)
  })

  it('a check that met its browser passes; a failure keeps its code', () => {
    const ran = 'chrome: /usr/bin/chromium\n  pick check: 12/12 ok\n'
    assert.equal(browserSkipped(ran), false)
    assert.equal(verdict(0, false), 0)
    assert.equal(verdict(2, true), 2)
    assert.equal(verdict(137, false), 137)
  })

  it('the watcher passes output through and finds a split skip line', () => {
    const seen = []
    const w = skipWatcher({ write: d => seen.push(String(d)) })
    w.write('vite built\n  no Chr')
    assert.equal(w.skipped(), false)
    w.write('ome found — skip')
    w.write('ping the pick check.\n')
    assert.equal(w.skipped(), true)
    assert.equal(seen.join(''), `vite built\n${SKIP}\n`)
  })
})

/*
 * The experiments (suites.mjs): mutant lists and spec controls. Every
 * verdict below is pinned by a negative control -- the case that must NOT
 * read as green.
 */
const {
  experimentPath,
  combine,
  reportVerdict,
  runMutants,
  runSpec,
  findT27c,
  UNMEASURED,
} = await import('./suites.mjs')
const { chmodSync, copyFileSync } = await import('node:fs')
const { fileURLToPath } = await import('node:url')
const REPO = fileURLToPath(new URL('../..', import.meta.url))
const { readTestReport } = await import(
  new URL('../../scripts/check-t27-specs.mjs', import.meta.url).href
)
const sink = () => {
  const seen = []
  return { write: d => seen.push(String(d)), text: () => seen.join('') }
}
const scratch = () => {
  const d = mkdtempSync(join(tmpdir(), 'check-runner-exp-'))
  dirs.push(d)
  return d
}
const COMMIT_ENV = {
  ...NO_GIT_ENV,
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@t',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@t',
}

describe('experiments: only a plain list or spec path reaches the shell', () => {
  const BAD = [
    'a.json;rm -rf /',
    '../x.json',
    'a/../../x.json',
    './x.json',
    '-x.json',
    '--help',
    '',
    '.json',
    'a b.json',
    '$(id).json',
    'x.json\nrm -rf /',
    "it's.json",
    '/etc/x.json',
  ]

  it('a list is a .json path, a spec a .t27 path', () => {
    assert.ok(
      experimentPath('mutants', 'render/src/spec/split-reel.mutants.json')
    )
    assert.ok(
      experimentPath('mutants', '.claude/loop-state/crm-mobile-mutants.json')
    )
    assert.ok(experimentPath('spec', 'render/src/spec/split-reel.t27'))
    assert.equal(experimentPath('mutants', 'x.t27'), false)
    assert.equal(experimentPath('spec', 'x.json'), false)
    assert.equal(experimentPath('website', 'x.json'), false)
    for (const name of BAD) {
      const why = JSON.stringify(name)
      assert.equal(experimentPath('mutants', name), false, why)
      assert.equal(
        experimentPath('spec', name.replace('.json', '.t27')),
        false,
        why
      )
    }
  })

  it('a bad name refuses the run and has no command', () => {
    for (const name of BAD) {
      const why = JSON.stringify(name)
      assert.match(
        refusal(['mutants'], [name]) ?? 'passed',
        /not a mutants path|needs files=/,
        why
      )
      assert.equal(suiteCommands('mutants', [name]), null, why)
    }
    const mixed = ['ok.mutants.json', 'x.json;id']
    assert.match(refusal(['mutants'], mixed), /not a mutants path/)
    assert.equal(suiteCommands('mutants', mixed), null)
  })

  it('no names or a mix with another suite is refused', () => {
    assert.match(refusal(['mutants'], []), /needs files=/)
    assert.match(refusal(['spec'], []), /needs files=/)
    assert.match(
      refusal(['mutants', 'render'], ['a.mutants.json']),
      /runs alone/
    )
    assert.match(refusal(['spec', 'mutants'], ['a.t27']), /runs alone/)
    assert.equal(refusal(['spec'], ['specs/a.t27']), null)
  })

  it('one quoted command per name; spec installs nothing', () => {
    const cmds = suiteCommands('mutants', ['a/x.mutants.json', 'y.json'])
    assert.equal(cmds.length, 2)
    assert.match(
      cmds[0],
      /^node '[^']+suites\.mjs' mutants 'a\/x\.mutants\.json'$/
    )
    assert.match(suiteCommands('spec', ['s/a.t27'])[0], / spec 's\/a\.t27'$/)
    assert.deepEqual(projectsFor(['spec']), [])
    assert.ok(projectsFor(['mutants']).length > 0)
  })

  it('verdicts combine: a failure wins, unmeasured is never green', () => {
    assert.equal(combine([0, 0]), 0)
    assert.equal(combine([0, 1, 2]), 1)
    assert.equal(combine([0, 2]), UNMEASURED)
    assert.equal(combine([]), UNMEASURED)
    assert.equal(combine([0, 137]), 1)
  })
})

/* t27c's own table (the format specs-of-record.test.ts pins). */
const table = rows => {
  const fail = rows.filter(r => r[0] === 'FAIL').length
  return [
    '--- test report: specs/x.t27 ---',
    ...rows.map(([v, n]) => `  ${v.padEnd(4)}  ${n}`),
    '',
    `  tests       ${rows.length}`,
    `  pass        ${rows.length - fail}`,
    `  FAIL        ${fail}`,
    `  rate    ${(((rows.length - fail) / rows.length) * 100).toFixed(1)}%`,
    '',
  ].join('\n')
}

describe('spec: the table is the verdict, not the t27c exit code', () => {
  it('reportVerdict reads FAIL rows, no table and no zig', () => {
    assert.equal(
      reportVerdict(table([['pass', 'one']]), readTestReport).code,
      0
    )
    assert.equal(
      reportVerdict(
        table([
          ['pass', 'one'],
          ['FAIL', 'two'],
        ]),
        readTestReport
      ).code,
      1
    )
    assert.equal(reportVerdict('nothing ran', readTestReport).code, UNMEASURED)
    assert.equal(
      reportVerdict('error: zig not on PATH', readTestReport).code,
      UNMEASURED
    )
  })

  /* A tree with the reader, one spec, and a fake t27c that exits 0. */
  const specTree = report => {
    const root = scratch()
    mkdirSync(join(root, 'scripts'))
    mkdirSync(join(root, 'specs'))
    copyFileSync(
      join(REPO, 'scripts/check-t27-specs.mjs'),
      join(root, 'scripts/check-t27-specs.mjs')
    )
    writeFileSync(join(root, 'specs/x.t27'), 'module x\n')
    const bin = join(root, 'fake-bin')
    mkdirSync(bin)
    writeFileSync(join(bin, 'report.txt'), report)
    writeFileSync(
      join(bin, 't27c'),
      '#!/bin/sh\ncat "$(dirname "$0")/report.txt"\nexit 0\n'
    )
    chmodSync(join(bin, 't27c'), 0o755)
    return { root, t27c: join(bin, 't27c') }
  }
  const withT27c = t27c => ({ ...NO_GIT_ENV, T27C: t27c })

  it('a FAIL row with t27c exit 0 is a failure (1)', async () => {
    const { root, t27c } = specTree(
      table([
        ['pass', 'one'],
        ['FAIL', 'two'],
      ])
    )
    const out = sink()
    const rc = await runSpec(root, 'specs/x.t27', { out, env: withT27c(t27c) })
    assert.equal(rc, 1, out.text())
    assert.match(out.text(), /FAIL -- 1 of 2 fail: two \(t27c exit 0\)/)
  })

  it('the same tree with every row passing is green (0)', async () => {
    const { root, t27c } = specTree(
      table([
        ['pass', 'one'],
        ['pass', 'two'],
      ])
    )
    const out = sink()
    const rc = await runSpec(root, 'specs/x.t27', { out, env: withT27c(t27c) })
    assert.equal(rc, 0, out.text())
  })

  it('no t27c is unmeasured (2), never 0', async () => {
    const { root } = specTree(table([['pass', 'one']]))
    for (const env of [
      { PATH: '' },
      { PATH: join(root, 'nowhere') },
      { PATH: process.env.PATH, T27C: join(root, 'no-such-t27c') },
    ]) {
      assert.equal(findT27c(env), null, JSON.stringify(env))
      const out = sink()
      assert.equal(await runSpec(root, 'specs/x.t27', { out, env }), UNMEASURED)
      assert.match(out.text(), /unmeasured: no t27c/)
    }
  })

  it('no table, or no zig, is unmeasured (2)', async () => {
    for (const report of ['nothing ran\n', 'error: zig not on PATH\n']) {
      const { root, t27c } = specTree(report)
      const rc = await runSpec(root, 'specs/x.t27', {
        out: sink(),
        env: withT27c(t27c),
      })
      assert.equal(rc, UNMEASURED, report)
    }
  })
})

describe('mutants: tri mutants in the runner tree, reverted by git', () => {
  /*
   * A repository like the snapshot: the tool from this checkout, one source
   * file, and a loop guard list whose marker is a plain shell test -- the
   * same path a real loop list takes, without vitest.
   */
  const LIST = '.claude/loop-state/demo-mutants.json'
  const mutantTree = (mutants, rule = 'limit good\nnote spare\n') => {
    const root = scratch()
    mkdirSync(join(root, 'bin/helpers'), { recursive: true })
    for (const f of ['mutants.py', 'gate.mjs'])
      copyFileSync(join(REPO, 'bin/helpers', f), join(root, 'bin/helpers', f))
    mkdirSync(join(root, 'src'))
    writeFileSync(join(root, 'src/rule.txt'), rule)
    mkdirSync(join(root, '.claude/loop-state'), { recursive: true })
    writeFileSync(
      join(root, '.claude/loop-state/demo-loop.md'),
      '# demo\n<!-- loop-tests: grep -q "limit good" src/rule.txt -->\n'
    )
    writeFileSync(join(root, LIST), JSON.stringify(mutants))
    execFileSync('bash', ['-lc', SNAPSHOT], { cwd: root, env: COMMIT_ENV })
    return root
  }
  const killed = { file: 'src/rule.txt', from: 'limit good', to: 'limit bad' }
  const survivor = {
    file: 'src/rule.txt',
    from: 'note spare',
    to: 'note other',
  }
  const dirty = root =>
    spawnSync('git', ['status', '--porcelain', '--untracked-files=no'], {
      cwd: root,
      env: NO_GIT_ENV,
      encoding: 'utf8',
    }).stdout

  it('every mutant killed is green (0), and the tree is back', () => {
    const root = mutantTree([killed])
    assert.equal(runMutants(root, LIST, { out: sink(), env: NO_GIT_ENV }), 0)
    assert.equal(dirty(root), '')
  })

  it('a survivor is a failure (1), and the tree is back', () => {
    const root = mutantTree([killed, survivor])
    assert.equal(runMutants(root, LIST, { out: sink(), env: NO_GIT_ENV }), 1)
    assert.equal(dirty(root), '')
  })

  it('a tree that is not a repository is unmeasured (2)', () => {
    const out = sink()
    assert.equal(
      runMutants(scratch(), LIST, { out, env: NO_GIT_ENV }),
      UNMEASURED
    )
    assert.match(out.text(), /not a repository/)
  })

  it('no loop-tests marker, or a stale anchor, is unmeasured (2)', () => {
    const root = mutantTree([killed])
    writeFileSync(
      join(root, '.claude/loop-state/demo-loop.md'),
      '# no marker\n'
    )
    const out = sink()
    assert.equal(runMutants(root, LIST, { out, env: NO_GIT_ENV }), UNMEASURED)
    assert.match(out.text(), /no loop-tests marker/)
    const stale = mutantTree([
      { file: 'src/rule.txt', from: 'absent', to: 'x' },
    ])
    assert.equal(
      runMutants(stale, LIST, { out: sink(), env: NO_GIT_ENV }),
      UNMEASURED
    )
  })

  it('a green run that already fails is unmeasured (2), not "all killed"', () => {
    const root = mutantTree([survivor], 'limit broken\nnote spare\n')
    assert.equal(
      runMutants(root, LIST, { out: sink(), env: NO_GIT_ENV }),
      UNMEASURED
    )
  })
})
