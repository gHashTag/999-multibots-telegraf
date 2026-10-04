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
