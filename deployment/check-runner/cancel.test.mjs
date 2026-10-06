/*
 * A job whose caller is gone does not hold the queue (2026-10-06).
 *
 * Measured that day: `tri remote-check player` answered "no result" again
 * and again. Every cut-off request left its job running, jobs run one at a
 * time, and the per-command limit (20 min) was longer than Railway's request
 * cap (15 min), so no caller behind an orphan could ever get a result.
 *
 * Runs under both runners, as server.test.mjs does. Its own file: the
 * server reads its environment once, on import, and these tests need a fake
 * experiments program and a fast heartbeat.
 */
const { describe, it, before, after } = process.env.VITEST
  ? await import('vitest')
  : await import('node:test')
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmp = mkdtempSync(join(tmpdir(), 'check-runner-cancel-'))
const LOG = join(tmp, 'calls.log')
const PIDS = join(tmp, 'pids')
/*
 * Stands in for suites.mjs: notes each name it is given; a name starting
 * with "long" starts a grandchild that sleeps a minute and waits for it,
 * any other name takes 1.5 s and passes.
 */
const FAKE = join(tmp, 'fake-suites.mjs')
writeFileSync(
  FAKE,
  `import { appendFileSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
const name = process.argv[3]
appendFileSync(${JSON.stringify(LOG)}, name + '\\n')
if (name.startsWith('long')) {
  const kid = spawn('sleep', ['60'], { stdio: 'ignore' })
  writeFileSync(${JSON.stringify(PIDS)}, process.pid + ' ' + kid.pid)
  kid.on('close', () => process.exit(0))
} else setTimeout(() => process.exit(0), 1500)
`
)

process.env.CHECK_RUNNER_KEY = 'test-key'
process.env.CHECK_WORK = join(tmp, 'work')
process.env.CHECK_CACHE = join(tmp, 'cache')
process.env.CHECK_SUITES_BIN = FAKE
process.env.CHECK_BEAT_MS = '200'
delete process.env.CHECK_RUN_LIMIT_MS
const { server, run, newJob, RUN_LIMIT_MS, REQUEST_CAP_MS } = await import(
  './server.mjs'
)

/* A small real archive: the runner refuses anything else. */
const src = join(tmp, 'src')
mkdirSync(src)
writeFileSync(join(src, 'a.txt'), 'a\n')
const ARCHIVE = execFileSync('tar', ['-czf', '-', '-C', src, '.'])

const sleep = ms => new Promise(r => setTimeout(r, ms))
const alive = pid => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
const calls = () =>
  existsSync(LOG) ? readFileSync(LOG, 'utf8').split('\n').filter(Boolean) : []
async function until(cond, ms, what) {
  const end = Date.now() + ms
  while (!cond()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`)
    await sleep(50)
  }
}

let base
/* POST a mutants run; resolves with the response once headers are in. */
function post(name, signal) {
  return fetch(`${base}/run?suites=mutants&files=${name}`, {
    method: 'POST',
    headers: { 'x-check-key': 'test-key' },
    body: ARCHIVE,
    signal,
  })
}
/* Read a response's stream until a line matches, then stop reading. */
async function readUntil(res, re, ms) {
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let text = ''
  const end = Date.now() + ms
  while (!re.test(text)) {
    if (Date.now() > end) throw new Error(`no ${re} in: ${text}`)
    const { value, done } = await reader.read()
    if (done) break
    text += dec.decode(value)
  }
  return text
}

describe('a job whose caller is gone is cancelled', () => {
  before(async () => {
    await new Promise(r => server.listen(0, '127.0.0.1', r))
    base = `http://127.0.0.1:${server.address().port}`
  })
  after(async () => {
    server.closeAllConnections()
    await new Promise(r => server.close(r))
    rmSync(tmp, { recursive: true, force: true })
  })

  it('a disconnect kills the running command and its children', async () => {
    const ac = new AbortController()
    const res = await post('long1.mutants.json', ac.signal)
    assert.equal(res.status, 200)
    await until(() => existsSync(PIDS), 15_000, 'the command to start')
    const pids = readFileSync(PIDS, 'utf8').trim().split(' ').map(Number)
    assert.ok(pids.every(alive), 'running before the disconnect')
    ac.abort()
    await until(() => !pids.some(alive), 5_000, 'the process tree to die')
  }, 30_000)

  it('a queued job of a gone caller never starts', async () => {
    rmSync(LOG, { force: true })
    /* A holds the queue for 1.5 s and finishes on its own. */
    const a = await post('first.mutants.json')
    /* B queues behind it, and its caller hangs up while it waits. */
    const ac = new AbortController()
    const b = await post('second.mutants.json', ac.signal)
    assert.match(await readUntil(b, /queued, 1 ahead/, 10_000), /1 ahead/)
    ac.abort()
    assert.match(await readUntil(a, /::result /, 15_000), /"mutants:first/)
    /* Time enough for B to have run, had it not been dropped. */
    await sleep(2_500)
    assert.deepEqual(calls(), ['first.mutants.json'])
  }, 30_000)
})

describe('a job always answers inside the request cap', () => {
  it('the limit is under Railway 15-minute cap', () => {
    assert.equal(REQUEST_CAP_MS, 15 * 60_000)
    assert.ok(RUN_LIMIT_MS < REQUEST_CAP_MS, `${RUN_LIMIT_MS}`)
  })

  it('a command past the job deadline is killed, tree and all', async () => {
    const job = newJob(Date.now() + 300)
    const out = { text: '', write: d => (out.text += d) }
    const t0 = Date.now()
    const cwd = mkdtempSync(join(tmpdir(), 'check-runner-limit-'))
    const code = await run('sleep 30 & echo $! > pid; wait', cwd, out, {}, job)
    assert.notEqual(code, 0)
    assert.ok(Date.now() - t0 < 5_000, 'stopped at the deadline')
    assert.ok(job.timedOut)
    assert.match(out.text, /out of time/)
    const pid = Number(readFileSync(join(cwd, 'pid'), 'utf8'))
    await until(() => !alive(pid), 3_000, 'the grandchild to die')
    rmSync(cwd, { recursive: true, force: true })
  }, 15_000)
})
