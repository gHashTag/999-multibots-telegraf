import { afterEach, describe, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import net from 'node:net'
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
 * The stand-in for "a second pid on that port" is a UDP socket bound to the
 * same number by a process this test starts: lsof matches it exactly like the
 * rapportd peer measured on the Mac, and it exists before the script starts,
 * so the case is deterministic. The test reads the pipe the way lefthook does
 * (EOF, not just exit), probes the port by connecting (no lsof: the Linux
 * check runner has none), and checks the stranger is still alive -- the cure
 * for this bug must never be "kill whatever lsof names".
 *
 * Mutants: mock-selfcheck.mutants.json (tri mutants, from this directory).
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const SCRIPT = join(HERE, 'mock-selfcheck.sh')

/** How long the pipe may stay open after the script exits. lefthook waits for EOF. */
const PIPE_GRACE_MS = 3_000
/** The script's own server deadline is 120 s; the whole run must fit with room to spare. */
const RUN_CAP_MS = 170_000

type Run = {
  code: number | null
  out: string
  /** ms from exit to EOF on stdout/stderr; null = still open after PIPE_GRACE_MS. */
  pipeClosedAfterExitMs: number | null
  group: number | null
}

const started: ChildProcess[] = []
const groups: number[] = []

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

/** A process of our own holding `port` with a UDP (stranger) or TCP (busy) socket. */
function holder(kind: 'udp' | 'tcp', port: number): Promise<ChildProcess> {
  const py =
    kind === 'udp'
      ? 's = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.bind(("127.0.0.1", p))'
      : 's = socket.socket(); s.bind(("127.0.0.1", p)); s.listen(8)'
  const child = spawn(
    'python3',
    [
      '-c',
      `import socket, sys, time\np = int(sys.argv[1])\n${py}\nprint("ready", flush=True)\ntime.sleep(600)`,
      String(port),
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  )
  started.push(child)
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

/** Run the script as lefthook does: stdout on a pipe, done only at EOF. */
function runScript(port: number): Promise<Run> {
  return new Promise(resolve => {
    const child = spawn('bash', [SCRIPT], {
      cwd: HERE,
      env: { ...process.env, MOCK_SELFCHECK_PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
      // Its own group, so cleanup can reach whatever it leaves behind.
      detached: true,
    })
    started.push(child)
    groups.push(child.pid!)
    let out = ''
    let group: number | null = null
    const take = (d: Buffer) => {
      out += String(d)
      const m = out.match(/server group (\d+)/)
      if (m && group === null) {
        group = Number(m[1])
        groups.push(group)
      }
    }
    child.stdout!.on('data', take)
    child.stderr!.on('data', take)
    let exitAt = 0
    let done = false
    const finish = (closed: boolean) => {
      if (done) return
      done = true
      clearTimeout(cap)
      resolve({
        code: child.exitCode,
        out,
        pipeClosedAfterExitMs: closed ? Date.now() - exitAt : null,
        group,
      })
    }
    const cap = setTimeout(() => finish(false), RUN_CAP_MS)
    child.once('exit', () => {
      exitAt = Date.now()
      setTimeout(() => finish(false), PIPE_GRACE_MS)
    })
    child.once('close', () => finish(true))
  })
}

afterEach(() => {
  // Only what this file started: the holders, the script's group, the server's group.
  for (const g of groups.splice(0)) {
    try {
      process.kill(-g, 'SIGKILL')
    } catch {
      /* already gone */
    }
  }
  for (const p of started.splice(0)) if (alive(p)) p.kill('SIGKILL')
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
})
