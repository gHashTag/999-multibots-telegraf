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
 * Dependencies are installed once per lockfile and kept on the volume
 * (/cache), keyed by the lockfile's hash, so a run with unchanged
 * dependencies starts in seconds. One run at a time: a second request
 * waits, so memory stays what the service was sized for.
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

/* Every project that has its own lockfile and node_modules. */
const PROJECTS = [
  { dir: '.', lock: 'package-lock.json' },
  { dir: 'apps/vibee-editor/render', lock: 'package-lock.json' },
  { dir: 'apps/vibee-editor/player', lock: 'package-lock.json' },
  { dir: 'apps/vibee-editor/packages/vibee-atoms', lock: 'package-lock.json' },
]

/* What each suite runs, from the repository root. */
export function suiteCommands(suite, files) {
  const only = files.length ? ' ' + files.map(quote).join(' ') : ''
  switch (suite) {
    case 'render':
      return [
        'cd apps/vibee-editor/render && npx tsc --noEmit -p .',
        `cd apps/vibee-editor/render && npx vitest run${only}`,
      ]
    case 'player':
      return [
        'node scripts/check-player-types.cjs',
        `cd apps/vibee-editor/player && npx vitest run${only}`,
      ]
    case 'root':
      return ['npx tsc --noEmit -p .', `npx vitest run${only}`]
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
    default:
      return null
  }
}

function quote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`
}

function keyOk(given) {
  if (!KEY || typeof given !== 'string') return false
  const a = Buffer.from(given)
  const b = Buffer.from(KEY)
  return a.length === b.length && timingSafeEqual(a, b)
}

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
    const code = await run(
      'npm ci --install-links --no-audit --no-fund --loglevel=error',
      at,
      out
    )
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

let queue = Promise.resolve()

async function handleRun(req, res, url) {
  const suites = (url.searchParams.get('suites') || 'render')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  const files = (url.searchParams.get('files') || '')
    .split(',')
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('-'))
  for (const s of suites) {
    if (!suiteCommands(s, [])) {
      res.writeHead(400, { 'content-type': 'text/plain' })
      res.end(`unknown suite: ${s}\n`)
      return
    }
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
      for (const p of PROJECTS) await modulesFor(job, p, res)
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

const server = http.createServer(async (req, res) => {
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
