/**
 * tri push: the push goes with ssh keepalive, success is the ref on the
 * remote and not an exit code, and force is refused. git and the online probe
 * are stubs on PATH; nothing here touches the network or the real remote.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const PUSH = path.join(ROOT, 'bin/helpers/push.sh')

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

const SHA = 'a'.repeat(40)

/**
 * A fake git. `landAfter` = the push number from which ls-remote answers
 * with the pushed sha (Infinity = never); `pushRc` = what push exits with.
 */
function run(
  args: string[],
  opts: { landAfter?: number; pushRc?: number; env?: Record<string, string> }
) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tri-push-'))
  dirs.push(d)
  const log = path.join(d, 'log')
  const count = path.join(d, 'count')
  fs.writeFileSync(count, '0')
  fs.writeFileSync(
    path.join(d, 'git'),
    `#!/bin/bash
case "$1" in
  symbolic-ref) echo feat/x ;;
  rev-parse) echo ${SHA} ;;
  config) exit 1 ;;
  push)
    n=$(( $(cat ${count}) + 1 )); echo $n > ${count}
    echo "push#$n ssh=$GIT_SSH_COMMAND args=$*" >> ${log}
    echo "To github.com:x/y.git"; exit ${opts.pushRc ?? 0} ;;
  ls-remote)
    if [ "$(cat ${count})" -ge ${opts.landAfter ?? 1} ]; then printf '${SHA}\\trefs/heads/feat/x\\n'; fi ;;
esac
`,
    { mode: 0o755 }
  )
  const r = spawnSync('bash', [PUSH, d, ...args], {
    cwd: d,
    encoding: 'utf8',
    env: {
      PATH: `${d}:/usr/bin:/bin`,
      TRI_PUSH_ONLINE: 'true',
      ...opts.env,
    },
  })
  const calls = fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : ''
  return { ...r, calls }
}

describe('tri push', () => {
  it('adds ssh keepalive to the ssh command already chosen', () => {
    const r = run([], { env: { GIT_SSH_COMMAND: 'ssh -i /k' } })
    expect(r.status).toBe(0)
    expect(r.calls).toContain('ssh=ssh -i /k -o ServerAliveInterval=20')
    expect(r.calls).toContain('ServerAliveCountMax=30')
    expect(r.stdout).toContain('OK  origin/feat/x')
  })

  it('a non-zero push rc is fine when the ref landed (141 after a green gate)', () => {
    const r = run([], { pushRc: 141 })
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('push rc 141')
  })

  it('a zero push rc is NOT success when the ref is missing', () => {
    const r = run([], {
      landAfter: 99,
      pushRc: 0,
      env: { TRI_PUSH_TRIES: '1' },
    })
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('did not land')
  })

  it('retries once when the first push did not land', () => {
    const r = run([], { landAfter: 2, pushRc: 141 })
    expect(r.status).toBe(0)
    expect(r.calls.match(/push#/g)).toHaveLength(2)
  })

  it('refuses force in every spelling, and refuses main', () => {
    for (const f of ['-f', '--force', '--force-with-lease']) {
      const r = run([f], {})
      expect(r.status).toBe(2)
      expect(r.calls).toBe('')
    }
    expect(run(['main'], {}).status).toBe(2)
  })

  it('does not push when GitHub is unreachable', () => {
    const r = run([], { env: { TRI_PUSH_ONLINE: 'false' } })
    expect(r.status).toBe(1)
    expect(r.calls).toBe('')
  })
})
