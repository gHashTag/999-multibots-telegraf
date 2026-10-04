import { afterEach, describe, expect, it } from 'vitest'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import net from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * THE PRE-PUSH MOCK CHECK MUST STOP ITS OWN SERVER, AND ONLY ITS OWN.
 *
 * 2026-10-04 a push hung for 18 minutes. mock-selfcheck.sh's trap was
 * `kill "$(lsof -ti:"$PORT")"`, and `lsof -i:N` lists every process with a
 * socket on port N at either end. With a second pid on that number the quoted
 * kill got ONE argument "pid1\npid2", refused it, `|| true` hid it, the server
 * lived on, its subshell held the hook's stdout, and lefthook read to EOF until
 * GitHub dropped the push.
 *
 * Two kinds of run, both read the way lefthook reads (EOF, not just exit):
 *
 *  - the REAL script and server, with a stranger holding the port NUMBER over
 *    UDP (lsof matches it exactly like the rapportd peer measured on the Mac).
 *    The port is probed by connecting -- the Linux check runner has no lsof.
 *
 *  - the real script COPIED next to stubs: the worst server it can meet (it
 *    and its grandchild ignore SIGTERM and write to stdout nonstop) and a
 *    mock-test that passes, fails, or is interrupted. Only these runs can tell
 *    a group kill from a pid kill, a deadline from none, and a forwarded exit
 *    code from `exit 0` -- the real server dies politely on SIGTERM, which is
 *    why the first version of this test let six of the reviewer's mutants live.
 *
 * Group membership is read from /proc on Linux (no ps on the runner) and from
 * ps on macOS, zombies excluded: the runner's PID 1 is node, which does not
 * reap orphans. Cleanup kills only what this file started.
 *
 * Mutants: mock-selfcheck.mutants.json (tri mutants, from this directory).
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const SCRIPT = join(HERE, 'mock-selfcheck.sh')

/** How long the pipe may stay open after the script exits. lefthook waits for EOF. */
const PIPE_GRACE_MS = 3_000
/** The script's own server deadline is 120 s; the whole run must fit with room to spare. */
const RUN_CAP_MS = 170_000
/** A stub run: tsx start-up under load, a 5 s stop, slack. A run without a deadline never ends. */
const STUB_CAP_MS = 60_000
/**
 * From the moment the script's last step ends (its mock-test returned or the
 * hook was interrupted) to its exit: the stop gives SIGTERM 5 s, then SIGKILL.
 */
const STOP_BOUND_MS = 12_000

type Run = {
  code: number | null
  signal: NodeJS.Signals | null
  out: string
  /** ms from exit to EOF on stdout/stderr; null = still open after PIPE_GRACE_MS (or never exited). */
  pipeClosedAfterExitMs: number | null
  /** Date.now() at exit; null = still running at the cap. */
  exitAt: number | null
  group: number | null
  log: string | null
}

const started: ChildProcess[] = []
const groups: number[] = []
const stubDirs: string[] = []
const logs: string[] = []

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer()
    s.once('error', reject)
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as net.AddressInfo
      s.close(() => resolve(port))
    })
  })
}

/**
 * A process of our own holding `port` with a UDP (stranger) or TCP (busy)
 * socket. It lives until its stdin closes -- i.e. no longer than this test
 * process, even if vitest dies without running afterEach -- and 240 s at most.
 */
function holder(kind: 'udp' | 'tcp', port: number): Promise<ChildProcess> {
  const py =
    kind === 'udp'
      ? 's = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.bind(("127.0.0.1", p))'
      : 's = socket.socket(); s.bind(("127.0.0.1", p)); s.listen(8)'
  const child = spawn(
    'python3',
    [
      '-c',
      `import select, socket, sys\np = int(sys.argv[1])\n${py}\nprint("ready", flush=True)\nselect.select([sys.stdin], [], [], 240)`,
      String(port),
    ],
    { stdio: ['pipe', 'pipe', 'pipe'] }
  )
  started.push(child)
  child.stdin!.on('error', () => {})
  return new Promise((resolve, reject) => {
    child.stdout!.on('data', d => {
      if (String(d).includes('ready')) resolve(child)
    })
    child.once('exit', code => reject(new Error(`holder exited ${code}`)))
  })
}

/** A port free for TCP whose number a stranger already holds over UDP. */
async function portWithStranger(): Promise<{
  port: number
  stranger: ChildProcess
}> {
  for (let i = 0; i < 5; i++) {
    const port = await freePort()
    try {
      return { port, stranger: await holder('udp', port) }
    } catch {
      /* that number is taken for UDP -- try another */
    }
  }
  throw new Error('no port free for both TCP and UDP')
}

function listening(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const c = net.connect({ port, host: '127.0.0.1' })
    c.once('connect', () => {
      c.destroy()
      resolve(true)
    })
    c.once('error', () => resolve(false))
  })
}

function alive(p: ChildProcess): boolean {
  if (p.exitCode !== null || p.signalCode !== null) return false
  try {
    process.kill(p.pid!, 0)
    return true
  } catch {
    return false
  }
}

/** Live (not zombie) members of a process group: /proc on Linux, ps on macOS. */
function liveMembers(pgid: number): number[] {
  if (existsSync('/proc/self/stat')) {
    const live: number[] = []
    for (const d of readdirSync('/proc')) {
      if (!/^\d+$/.test(d)) continue
      let stat: string
      try {
        stat = readFileSync(`/proc/${d}/stat`, 'utf8')
      } catch {
        continue
      }
      // "pid (comm) state ppid pgrp ..." -- comm may hold spaces and parens.
      const f = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
      if (Number(f[2]) === pgid && f[0] !== 'Z' && f[0] !== 'X')
        live.push(Number(d))
    }
    return live
  }
  const ps = spawnSync('ps', ['-axo', 'pid=,pgid=,stat='], {
    encoding: 'utf8',
  })
  if (ps.status !== 0) throw new Error(`ps failed: ${ps.stderr}`)
  return ps.stdout
    .split('\n')
    .map(l => l.trim().split(/\s+/))
    .filter(f => Number(f[1]) === pgid && f[2] && !f[2].startsWith('Z'))
    .map(f => Number(f[0]))
}

/** Members a SIGKILL has not finished off yet still count; give them 2 s. */
async function survivors(pgid: number): Promise<number[]> {
  const until = Date.now() + 2_000
  let live = liveMembers(pgid)
  while (live.length > 0 && Date.now() < until) {
    await new Promise(r => setTimeout(r, 100))
    live = liveMembers(pgid)
  }
  return live
}

/**
 * Run a copy of the script as lefthook does: stdin and stdout on pipes, done
 * only at EOF. stdin stays open -- a pre-push hook's stdin carries the refs.
 */
function startScript(
  script: string,
  env: Record<string, string>,
  capMs: number
): { child: ChildProcess; done: Promise<Run> } {
  const child = spawn('bash', [script], {
    cwd: dirname(script),
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
    // Its own group, so cleanup can reach whatever it leaves behind.
    detached: true,
  })
  started.push(child)
  groups.push(child.pid!)
  child.stdin!.on('error', () => {})
  child.stdin!.write(
    'refs/heads/x 1111111111111111111111111111111111111111 refs/heads/x 0000000000000000000000000000000000000000\n'
  )
  const done = new Promise<Run>(resolve => {
    let out = ''
    let group: number | null = null
    let log: string | null = null
    const take = (d: Buffer) => {
      out += String(d)
      const m = out.match(/server group (\d+) on :\d+, log (\S+)/)
      if (m && group === null) {
        group = Number(m[1])
        log = m[2]
        groups.push(group)
        logs.push(log)
      }
    }
    child.stdout!.on('data', take)
    child.stderr!.on('data', take)
    let exitAt: number | null = null
    let finished = false
    const finish = (closed: boolean) => {
      if (finished) return
      finished = true
      clearTimeout(cap)
      resolve({
        code: child.exitCode,
        signal: child.signalCode,
        out,
        pipeClosedAfterExitMs:
          closed && exitAt !== null ? Date.now() - exitAt : null,
        exitAt,
        group,
        log,
      })
    }
    const cap = setTimeout(() => finish(false), capMs)
    child.once('exit', () => {
      exitAt = Date.now()
      setTimeout(() => finish(false), PIPE_GRACE_MS)
    })
    child.once('close', () => finish(true))
  })
  return { child, done }
}

const runScript = (port: number) =>
  startScript(SCRIPT, { MOCK_SELFCHECK_PORT: String(port) }, RUN_CAP_MS).done

// ---- the stub world --------------------------------------------------------

/**
 * The worst server mock-selfcheck.sh can meet. It and its grandchild ignore
 * SIGTERM, SIGINT and SIGHUP and write to stdout nonstop; each exits on its
 * own after 60 s, so even a broken run leaves them for a minute at most.
 */
const STUB_SERVER = `// Stub written by mock-selfcheck.test.ts.
import { spawn } from 'node:child_process'
import { appendFileSync, fstatSync } from 'node:fs'
import http from 'node:http'

const say = (line: string) => appendFileSync(process.env.STUB_REPORT as string, line + '\\n')
for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) process.on(s, () => say('server ignored ' + s))
const GRANDCHILD =
  "for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(s, () => {});" +
  "setInterval(() => process.stdout.write('STUB-GRANDCHILD-TICK\\\\n'), 50);" +
  'setTimeout(() => process.exit(0), 60000)'
const kid = spawn(process.execPath, ['-e', GRANDCHILD], { stdio: ['ignore', 'inherit', 'inherit'] })
const fd0 = fstatSync(0)
const stdin = fd0.isCharacterDevice() ? 'chardev' : fd0.isFIFO() ? 'pipe' : fd0.isSocket() ? 'socket' : 'other'
say('server ' + process.pid + ' grandchild ' + kid.pid + ' stdin ' + stdin)
setInterval(() => process.stdout.write('STUB-SERVER-TICK\\n'), 50)
http.createServer((_req, res) => res.end('ok')).listen(Number(process.env.MOCK_PORT))
setTimeout(() => process.exit(0), 60000)
`

/** The stub mock-test: records when it ran, sleeps if asked, exits as asked. */
const STUB_TEST = `# Stub written by mock-selfcheck.test.ts.
import os, sys, time
with open(os.environ["STUB_REPORT"], "a") as f:
    f.write("test-start %d\\n" % int(time.time() * 1000))
time.sleep(float(os.environ.get("STUB_TEST_SLEEP", "0")))
sys.exit(int(os.environ.get("STUB_TEST_RC", "0")))
`

/** The node_modules that holds tsx, so `npx tsx` in the stub dir never reaches the network. */
function tsxModules(): string {
  for (let d = HERE; ; d = dirname(d)) {
    if (existsSync(join(d, 'node_modules', '.bin', 'tsx')))
      return join(d, 'node_modules')
    if (dirname(d) === d)
      throw new Error(`no node_modules/.bin/tsx above ${HERE}`)
  }
}

/** A temp dir with a copy of the real script (mutants included) next to the stubs. */
function stubDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mock-selfcheck-stub-'))
  stubDirs.push(dir)
  copyFileSync(SCRIPT, join(dir, 'mock-selfcheck.sh'))
  writeFileSync(join(dir, 'mock-server.ts'), STUB_SERVER)
  writeFileSync(join(dir, 'mock-test.py'), STUB_TEST)
  writeFileSync(join(dir, 'package.json'), '{ "private": true }\n')
  symlinkSync(tsxModules(), join(dir, 'node_modules'))
  return dir
}

type Report = {
  server?: number
  grandchild?: number
  stdin?: string
  testStart?: number
}

function readReport(path: string): Report {
  const r: Report = {}
  if (!existsSync(path)) return r
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const s = line.match(/^server (\d+) grandchild (\d+) stdin (\S+)/)
    if (s) Object.assign(r, { server: +s[1], grandchild: +s[2], stdin: s[3] })
    const t = line.match(/^test-start (\d+)/)
    if (t) r.testStart = +t[1]
  }
  return r
}

type StubRun = Run & {
  report: Report
  /** When the last step ended: the stub test returned, or the hook was interrupted. */
  lastStepAt: number | null
  live: number[]
  logText: string
}

async function stubRun(opts: {
  rc: number
  interrupt?: NodeJS.Signals
}): Promise<StubRun> {
  const dir = stubDir()
  const reportPath = join(dir, 'report.txt')
  const { child, done } = startScript(
    join(dir, 'mock-selfcheck.sh'),
    {
      STUB_REPORT: reportPath,
      STUB_TEST_RC: String(opts.rc),
      STUB_TEST_SLEEP: opts.interrupt ? '30' : '0',
    },
    STUB_CAP_MS
  )
  let interruptedAt: number | null = null
  if (opts.interrupt) {
    // Ctrl-C or a dropped session signals the hook's group: the script and its
    // foreground mock-test, never the server's own group.
    const until = Date.now() + STUB_CAP_MS
    while (readReport(reportPath).testStart === undefined && Date.now() < until)
      await new Promise(r => setTimeout(r, 100))
    interruptedAt = Date.now()
    try {
      process.kill(-child.pid!, opts.interrupt)
    } catch {
      /* already gone */
    }
  }
  const run = await done
  const report = readReport(reportPath)
  // The stub test exits at once, so its start is when the last step ended.
  const lastStepAt = opts.interrupt ? interruptedAt : (report.testStart ?? null)
  const live = run.group === null ? [] : await survivors(run.group)
  const logText =
    run.log && existsSync(run.log) ? readFileSync(run.log, 'utf8') : ''
  return { ...run, report, lastStepAt, live, logText }
}

afterEach(() => {
  // Only what this file started: the holders, the scripts' groups, the servers' groups.
  for (const g of groups.splice(0)) {
    try {
      process.kill(-g, 'SIGKILL')
    } catch {
      /* already gone */
    }
  }
  for (const p of started.splice(0)) if (alive(p)) p.kill('SIGKILL')
  for (const log of logs.splice(0)) rmSync(log, { force: true })
  for (const dir of stubDirs.splice(0)) {
    // Unlink the node_modules symlink first: never delete through it.
    try {
      unlinkSync(join(dir, 'node_modules'))
    } catch {
      /* not created */
    }
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('mock-selfcheck.sh stops its own server', () => {
  it(
    'kills the server with another process on the port number, leaves that process alone, closes the pipe',
    async () => {
      const { port, stranger } = await portWithStranger()

      const run = await runScript(port)

      expect(run.out).toMatch(/server group \d+/)
      expect(run.code, run.out.slice(-800)).toBe(0)
      // lefthook waits for EOF, not for exit: a held pipe is the 18-minute hang.
      expect(run.pipeClosedAfterExitMs).not.toBeNull()
      expect(run.pipeClosedAfterExitMs!).toBeLessThan(PIPE_GRACE_MS)
      // Nothing of ours is left serving the port.
      expect(await listening(port)).toBe(false)
      // And the stranger that shares the number was not touched.
      expect(alive(stranger)).toBe(true)
    },
    RUN_CAP_MS + 20_000
  )

  it('refuses an asked-for port that someone else listens on, and does not kill them', async () => {
    const port = await freePort()
    const owner = await holder('tcp', port)

    const t0 = Date.now()
    const run = await runScript(port)

    expect(run.code).toBe(1)
    expect(run.out).toMatch(/already taken/)
    expect(run.group).toBeNull()
    expect(Date.now() - t0).toBeLessThan(20_000)
    expect(alive(owner)).toBe(true)
    expect(await listening(port)).toBe(true)
  }, 40_000)

  it(
    'with a server and grandchild that ignore SIGTERM: exits on time, closes the pipe, leaves no one, forwards the result',
    async () => {
      // Concurrently: three stub runs of ~6 s each would be ~18 s in a row.
      const [pass, fail, cut] = await Promise.all([
        stubRun({ rc: 0 }),
        stubRun({ rc: 1 }),
        stubRun({ rc: 0, interrupt: 'SIGINT' }),
      ])

      for (const [name, r] of [
        ['pass', pass],
        ['fail', fail],
        ['interrupted', cut],
      ] as const) {
        const why = `${name}: ${r.out.slice(-600)}`
        // The stub really ran: a server, a grandchild, and the test step.
        expect(r.group, why).not.toBeNull()
        expect(r.report.server, why).toBeGreaterThan(0)
        expect(r.report.grandchild, why).toBeGreaterThan(0)
        expect(r.lastStepAt, why).not.toBeNull()
        // It exits: SIGTERM is ignored, so only the SIGKILL deadline ends it.
        expect(r.exitAt, why).not.toBeNull()
        expect(r.exitAt! - r.lastStepAt!, why).toBeLessThan(STOP_BOUND_MS)
        // lefthook reaches EOF.
        expect(r.pipeClosedAfterExitMs, why).not.toBeNull()
        expect(r.pipeClosedAfterExitMs!, why).toBeLessThan(PIPE_GRACE_MS)
        // No one from the server's group is left: not npx, tsx, the server, the grandchild.
        expect(r.live, why).toEqual([])
        // The server's chatter went to the log, never to the hook's output...
        expect(r.out, why).not.toMatch(/STUB-(SERVER|GRANDCHILD)-TICK/)
        // ...and it never shared the hook's stdin (with `set -m` bash does not
        // give a background job /dev/null by itself).
        expect(r.report.stdin, why).toBe('chardev')
      }

      // The gate's result is the test's result.
      expect(pass.code, pass.out.slice(-600)).toBe(0)
      expect(fail.code, fail.out.slice(-600)).toBe(1)
      expect(cut.code === 0, cut.out.slice(-600)).toBe(false)
      // A passing run cleans its log; a failing one keeps it, with the chatter in it.
      expect(existsSync(pass.log!)).toBe(false)
      expect(fail.logText).toMatch(/STUB-SERVER-TICK/)
      expect(fail.logText).toMatch(/STUB-GRANDCHILD-TICK/)
    },
    STUB_CAP_MS + 30_000
  )
})
