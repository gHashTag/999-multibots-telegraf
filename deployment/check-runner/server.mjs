/**
 * THE CHECKS RUN IN THE CLOUD, NOT ON THE OWNER'S MAC.
 *
 * Owner, 2026-09-22: "everything should work in the cloud -- on Railway".
 * Measured that day: the Mac has 8 cores and 8 GB, three or four sessions
 * each ran tsc and a vitest of 7-8 workers at once, swap sat at 9 of 10 GB
 * and tests that take 5 s timed out at 30. So the checks come here.
 *
 *   POST /run?suites=render,player,root&files=a.test.ts,b.test.ts
 *     header  X-Check-Key: <CHECK_RUNNER_KEY>
 *     body    a .tar.gz of the code at the commit (tri remote-check makes it)
 *   -> a text stream of the checks' own output, ending in one line
 *      "::result {json}" with every suite's exit code.
 *
 *   POST /run?suites=website&files=check:queen-castle,typecheck:ratchet
 *     body    a .tar.gz of a gHashTag/trinity checkout instead (owner,
 *             2026-10-04: "run all experiments on Railway, the computer
 *             here is choking" -- the Mac sat at load average 800). Each
 *             name is an npm script of apps/website, run in order, each
 *             with its own exit code under "website:<name>".
 *
 * Dependencies are installed once per lockfile and kept on the volume
 * (/cache), keyed by the lockfile's hash, so a run with unchanged
 * dependencies starts in seconds. Only the projects the requested suites
 * use are installed. One run at a time: a second request waits, so memory
 * stays what the service was sized for.
 *
 * No GitHub credential lives here: the code arrives in the request.
 */
import http from 'node:http'
import { spawn } from 'node:child_process'
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import {
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  stat,
  rename,
} from 'node:fs/promises'
import { join } from 'node:path'

const PORT = Number(process.env.PORT || 8080)
const KEY = process.env.CHECK_RUNNER_KEY || ''
const CACHE = process.env.CHECK_CACHE || '/cache'
const WORK = process.env.CHECK_WORK || '/work'
const MAX_BODY = 64 * 1024 * 1024
/* A run that outlives this is stopped: a hung test must not hold the queue. */
const RUN_LIMIT_MS = Number(process.env.CHECK_RUN_LIMIT_MS || 20 * 60_000)

/*
 * trinity's website checks run on Node 22, the version trinity's own CI pins
 * (.github/workflows/website-checks.yml): its contracts use
 * --experimental-strip-types and the WebSocket client built into 22, and
 * Node 20 has neither. The Dockerfile puts a whole Node 22 (node and its
 * npm) here; the bot's suites stay on the image's Node 20. The version is
 * chosen inside the command, not in its environment: `bash -l` reads
 * Debian's /etc/profile, which sets PATH afresh and would drop a prefix.
 */
const NODE22_BIN = process.env.CHECK_NODE22_BIN || '/opt/node22/bin'
export const onNode22 = cmd =>
  `export PATH=${quote(NODE22_BIN)}:"$PATH" && ${cmd}`

/* Which repository's archive a suite checks: website is trinity's. */
const repoOf = suite => (suite === 'website' ? 'trinity' : 'bot')

/*
 * Every project that has its own lockfile and node_modules, and the
 * repository it belongs to. Until 2026-10-04 every run installed every
 * project whose lockfile arrived; a trinity archive carries a root
 * package-lock.json of its own, which a website run must not install at the
 * bot's '.' entry. The bot's suites keep what they had: all four projects.
 */
export const PROJECTS = [
  { dir: '.', lock: 'package-lock.json', repo: 'bot' },
  { dir: 'apps/vibee-editor/render', lock: 'package-lock.json', repo: 'bot' },
  { dir: 'apps/vibee-editor/player', lock: 'package-lock.json', repo: 'bot' },
  {
    dir: 'apps/vibee-editor/packages/vibee-atoms',
    lock: 'package-lock.json',
    repo: 'bot',
  },
  {
    dir: 'apps/website',
    lock: 'package-lock.json',
    repo: 'trinity',
    node22: true,
  },
]

/* The projects a run of these suites installs, in table order. */
export function projectsFor(suites) {
  const repos = new Set(suites.map(repoOf))
  return PROJECTS.filter(p => repos.has(p.repo))
}

/*
 * The website suite runs `npm run <name>` per name it is given, so a name is
 * a check script or nothing: no flag (--help), no path, no shell, no `dev`
 * server that never exits. Checked before the archive is even read.
 */
export const WEBSITE_SCRIPT = /^(check|typecheck)(:[a-z0-9-]+)*$/

/* Why a request is refused before anything runs, or null. */
export function refusal(suites, files) {
  for (const s of suites)
    if (!suiteCommands(s, [])) return `unknown suite: ${s}`
  if (!suites.includes('website')) return null
  /* Its files are script names and its archive is trinity: no mixing. */
  if (suites.length > 1) return 'website runs alone: its archive is trinity'
  if (!files.length) return 'website needs files=<npm script>[,...]'
  for (const f of files)
    if (!WEBSITE_SCRIPT.test(f))
      return `not a website check script: ${JSON.stringify(f)}`
  return null
}

/*
 * A browser contract that finds no Chrome prints "no Chrome found --
 * skipping ..." and exits 0. Taken at its word that is a pass that checked
 * nothing, so a check whose output has such a line has failed.
 */
const BROWSER_SKIP = /chrome.*skipping|skipping.*chrome/i
export const browserSkipped = text =>
  String(text)
    .split('\n')
    .some(l => BROWSER_SKIP.test(l))
export const SKIPPED_BROWSER = 1

/* A check's exit code, read together with what it printed. */
export function verdict(code, skipped) {
  return code === 0 && skipped ? SKIPPED_BROWSER : code
}

/*
 * A writer that passes a check's output through to the client and notes
 * whether any whole line of it was a browser skip. Chunks split lines
 * anywhere, so the unfinished tail waits for the next one.
 */
export function skipWatcher(out) {
  let tail = ''
  let seen = false
  return {
    write(d) {
      out.write(d)
      const lines = (tail + d).split('\n')
      tail = lines.pop()
      if (!seen) seen = browserSkipped(lines.join('\n'))
    },
    skipped: () => seen || browserSkipped(tail),
  }
}

/*
 * Two test workers, not one per core. 2026-09-22 the render suite (300+
 * files) died at start with EPIPE: the forked workers were killed before
 * the first message, the service sized for one run at a time. The same
 * suite passes with two workers in about three minutes.
 */
const WORKERS = process.env.CHECK_WORKERS || '2'

/* What each suite runs, from the repository root. */
export function suiteCommands(suite, files) {
  const only = files.length ? ' ' + files.map(quote).join(' ') : ''
  switch (suite) {
    case 'render':
      return [
        'cd apps/vibee-editor/render && npx tsc --noEmit -p .',
        `cd apps/vibee-editor/render && npx vitest run --maxWorkers=${WORKERS}${only}`,
      ]
    case 'player':
      return [
        'node scripts/check-player-types.cjs',
        `cd apps/vibee-editor/player && npx vitest run --maxWorkers=${WORKERS}${only}`,
      ]
    case 'root':
      return [
        'npx tsc --noEmit -p .',
        `npx vitest run --maxWorkers=${WORKERS}${only}`,
      ]
    /*
     * The pre-push gate itself (scripts/test-guard.cjs): the push's files
     * arrive in the archive as .check-files, listed on the Mac where git is.
     */
    case 'guard':
      return ['TEST_GUARD_FILES_FROM=.check-files node scripts/test-guard.cjs']
    /* The production bot bundle gets past its own imports (pre-push). */
    case 'boots':
      return ['npx vitest run src/__tests__/bot/bundleBootsPastImports.test.ts']
    /* The pre-commit type gates, together or one at a time. */
    case 'types':
      return [
        'npx tsc --noEmit --pretty false',
        'node scripts/check-player-types.cjs',
      ]
    case 'root-types':
      return ['npx tsc --noEmit --pretty false']
    case 'player-types':
      return ['node scripts/check-player-types.cjs']
    case 'render-types':
      return ['node scripts/check-render-types.cjs']
    /*
     * gHashTag/trinity's site: one command per npm script, in order. The
     * names are checked by refusal() first; checked again here, so a name
     * that never passed it can still never reach the shell.
     */
    case 'website':
      if (!files.every(f => WEBSITE_SCRIPT.test(f))) return null
      return files.map(f => `cd apps/website && npm run ${quote(f)}`)
    default:
      return null
  }
}

/*
 * The archive carries the tree but no .git, and 2026-10-03 that reddened 15
 * guard tests at once: every whole-tree guard reads its population with
 * `git ls-files` (scripts/lib/repo-sources.cjs), and a directory that is not
 * a repository answers "fatal: not a git repository". So the unpacked tree
 * becomes one, committed as it arrived: `git ls-files` then lists exactly
 * the files that were sent and nothing is untracked. .check-files is the
 * gate's own list, not code, so it is excluded rather than committed.
 */
export const SNAPSHOT =
  'git init -q && echo .check-files >> .git/info/exclude && git add -A && ' +
  'git -c user.name=check-runner -c user.email=check-runner@localhost ' +
  '-c commit.gpgsign=false commit -q --no-verify -m snapshot'

function quote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`
}

function keyOk(given) {
  if (!KEY || typeof given !== 'string') return false
  const a = Buffer.from(given)
  const b = Buffer.from(KEY)
  return a.length === b.length && timingSafeEqual(a, b)
}

/* A GIT_DIR inherited by the server must not aim the snapshot elsewhere. */
const NO_GIT_ENV = Object.fromEntries(
  Object.keys(process.env)
    .filter(k => k.startsWith('GIT_'))
    .map(k => [k, undefined])
)

function run(cmd, cwd, out, env = {}) {
  return new Promise(resolve => {
    const child = spawn('bash', ['-lc', cmd], {
      cwd,
      env: { ...process.env, CI: '1', FORCE_COLOR: '0', ...env },
    })
    const timer = setTimeout(() => child.kill('SIGKILL'), RUN_LIMIT_MS)
    child.stdout.on('data', d => out.write(d))
    child.stderr.on('data', d => out.write(d))
    child.on('close', code => {
      clearTimeout(timer)
      resolve(code ?? 1)
    })
  })
}

async function exists(p) {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

/*
 * A hash of every file under a directory, for the cache key: the render and
 * the player take @vibee/atoms as `file:../packages/vibee-atoms`, so a
 * change there must not be served from a cache made before it.
 */
async function treeHash(dir) {
  const h = createHash('sha256')
  const walk = async d => {
    let entries = []
    try {
      entries = await readdir(d, { withFileTypes: true })
    } catch {
      return
    }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const e of entries) {
      if (e.name === 'node_modules') continue
      const p = join(d, e.name)
      if (e.isDirectory()) await walk(p)
      else if (e.isFile())
        h.update(p.slice(dir.length)).update(await readFile(p))
    }
  }
  await walk(dir)
  return h.digest('hex')
}

/*
 * node_modules for one project, from the cache or installed once. Installed
 * IN PLACE -- a `file:../` dependency only resolves from where the package
 * really sits -- with --install-links, so that dependency is copied in and
 * the folder can move to the cache without a dangling link.
 */
async function modulesFor(root, project, out) {
  const at = join(root, project.dir)
  const lockPath = join(at, project.lock)
  if (!(await exists(lockPath))) return
  const pkg = await readFile(join(at, 'package.json'), 'utf8').catch(() => '')
  const h = createHash('sha256').update(await readFile(lockPath))
  if (pkg.includes('file:../packages/vibee-atoms'))
    h.update(
      await treeHash(join(root, 'apps/vibee-editor/packages/vibee-atoms'))
    )
  const hash = h.digest('hex').slice(0, 16)
  const cached = join(
    CACHE,
    'nm',
    `${project.dir.replace(/[/.]/g, '_')}-${hash}`
  )
  if (!(await exists(join(cached, 'node_modules')))) {
    out.write(`:: installing ${project.dir} (${hash})\n`)
    const ci = 'npm ci --install-links --no-audit --no-fund --loglevel=error'
    const code = await run(project.node22 ? onNode22(ci) : ci, at, out)
    if (code !== 0 || !(await exists(join(at, 'node_modules')))) {
      out.write(`:: install failed for ${project.dir}\n`)
      return
    }
    const tmp = `${cached}.tmp-${randomUUID()}`
    await mkdir(tmp, { recursive: true })
    /* The work dir and the volume are different devices: mv, not rename. */
    if ((await run(`mv node_modules ${quote(tmp)}/`, at, out)) !== 0) {
      out.write(`:: could not keep ${project.dir} in the cache\n`)
      return
    }
    await rm(cached, { recursive: true, force: true })
    await rename(tmp, cached)
  }
  await symlink(join(cached, 'node_modules'), join(at, 'node_modules')).catch(
    () => {}
  )
}

/*
 * trinity's website checks, every one of them: unlike the bot's suites a
 * failure does not stop the rest, since each name is its own question and
 * gets its own exit code under "website:<name>". They run under Node 22.
 */
async function runWebsite(job, names, res, result) {
  const cmds = suiteCommands('website', names)
  for (let i = 0; i < names.length; i++) {
    res.write(`\n:: website: ${cmds[i]}\n`)
    const watch = skipWatcher(res)
    const code = await run(onNode22(cmds[i]), job, watch)
    if (code === 0 && watch.skipped())
      res.write(
        `:: website: ${names[i]} said it skipped for want of Chrome and ` +
          'exited 0 -- a browser check that did not run has not passed; ' +
          'counted as failed\n'
      )
    result[`website:${names[i]}`] = verdict(code, watch.skipped())
  }
}

let queue = Promise.resolve()

async function handleRun(req, res, url) {
  const suites = (url.searchParams.get('suites') || 'render')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  const given = url.searchParams.get('files')
  const named = given === null ? [] : given.split(',').map(s => s.trim())
  /*
   * The bot's suites quietly drop an empty name or a flag, as before. A
   * website name is a command, so every name as sent is checked and one bad
   * name refuses the whole request.
   */
  const files = suites.includes('website')
    ? named
    : named.filter(s => s && !s.startsWith('-'))
  const refused = refusal(suites, files)
  if (refused) {
    res.writeHead(400, { 'content-type': 'text/plain' })
    res.end(`${refused}\n`)
    return
  }
  const job = join(WORK, randomUUID())
  await mkdir(job, { recursive: true })
  /* The archive straight into tar, capped. */
  let size = 0
  const tar = spawn('tar', ['-xzf', '-', '-C', job])
  const extracted = new Promise(resolve =>
    tar.on('close', code => resolve(code))
  )
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY) {
      tar.kill('SIGKILL')
      res.writeHead(413, { 'content-type': 'text/plain' })
      res.end('archive too large\n')
      await rm(job, { recursive: true, force: true })
      return
    }
    tar.stdin.write(chunk)
  }
  tar.stdin.end()
  if ((await extracted) !== 0) {
    res.writeHead(400, { 'content-type': 'text/plain' })
    res.end('not a .tar.gz\n')
    await rm(job, { recursive: true, force: true })
    return
  }

  res.writeHead(200, {
    'content-type': 'text/plain; charset=utf-8',
    'x-accel-buffering': 'no',
  })
  /* A heartbeat while queued or installing, so no proxy calls it idle. */
  const beat = setInterval(() => res.write(':: still working\n'), 20_000)
  const mine = queue.then(async () => {
    const result = {}
    try {
      if ((await run(SNAPSHOT, job, res, NO_GIT_ENV)) !== 0)
        res.write(':: could not make the tree a repository\n')
      for (const p of projectsFor(suites)) await modulesFor(job, p, res)
      if (suites.includes('website')) await runWebsite(job, files, res, result)
      else
        for (const s of suites) {
          let code = 0
          for (const cmd of suiteCommands(s, files)) {
            res.write(`\n:: ${s}: ${cmd}\n`)
            code = await run(cmd, job, res)
            if (code !== 0) break
          }
          result[s] = code
        }
    } finally {
      clearInterval(beat)
      res.write(`\n::result ${JSON.stringify(result)}\n`)
      res.end()
      await rm(job, { recursive: true, force: true })
    }
  })
  queue = mine.catch(() => {})
  await mine.catch(e => {
    clearInterval(beat)
    res.end(`\n::result {"error":${JSON.stringify(String(e).slice(0, 200))}}\n`)
  })
}

export const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://x')
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
    return
  }
  if (url.pathname === '/run' && req.method === 'POST') {
    if (!keyOk(req.headers['x-check-key'])) {
      res.writeHead(401, { 'content-type': 'text/plain' })
      res.end('no\n')
      return
    }
    await handleRun(req, res, url).catch(e => {
      if (!res.headersSent) res.writeHead(500)
      res.end(
        `\n::result {"error":${JSON.stringify(String(e).slice(0, 200))}}\n`
      )
    })
    return
  }
  res.writeHead(404)
  res.end()
})

if (process.argv[1] && process.argv[1].endsWith('server.mjs')) {
  await mkdir(join(CACHE, 'nm'), { recursive: true })
  await mkdir(WORK, { recursive: true })
  server.requestTimeout = 0
  server.listen(PORT, () => console.log(`[check-runner] listening on ${PORT}`))
}
