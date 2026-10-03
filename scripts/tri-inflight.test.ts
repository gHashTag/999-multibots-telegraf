/**
 * tri inflight (bin/helpers/inflight.sh): "could not ask" never prints like
 * "nothing there". Until this test a failed railway call printed a blank
 * deployment line, which a loop cycle reads as "nothing deployed".
 *
 * gh and railway are stubs on PATH, so the test needs no network and no login.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const INFLIGHT = path.join(ROOT, 'bin/helpers/inflight.sh')
const dirs: string[] = []

/** A PATH whose gh and railway print `out` and exit `code`. */
function stubs(
  gh: { out: string; code: number },
  rw: { out: string; code: number }
) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tri-inflight-'))
  dirs.push(dir)
  for (const [name, s] of [
    ['gh', gh],
    ['railway', rw],
  ] as const) {
    const f = path.join(dir, name)
    fs.writeFileSync(f, `#!/bin/sh\nprintf '%s' '${s.out}'\nexit ${s.code}\n`)
    fs.chmodSync(f, 0o755)
  }
  return `${dir}:/usr/bin:/bin`
}

function inflight(PATH: string) {
  return spawnSync('bash', [INFLIGHT, ROOT], {
    encoding: 'utf8',
    timeout: 20000,
    env: { ...process.env, PATH },
  })
}

afterAll(() =>
  dirs.forEach(d => fs.rmSync(d, { recursive: true, force: true }))
)

describe('tri inflight', () => {
  it('a failed railway call says unknown, not a blank', () => {
    const r = inflight(stubs({ out: '', code: 0 }, { out: 'boom', code: 1 }))
    const lines = r.stdout
      .split('\n')
      .filter(l => /^ {2}(999-multibots-telegraf|vibee-render) /.test(l))
    expect(lines).toHaveLength(2)
    for (const l of lines)
      expect(l).toMatch(/railway did not answer -- unknown/)
  })
  it('railway answering with no rows says so, apart from failure', () => {
    const r = inflight(
      stubs({ out: '', code: 0 }, { out: 'header only', code: 0 })
    )
    expect(r.stdout).toMatch(/vibee-render +\(no deployment listed\)/)
    expect(r.stdout).not.toMatch(/did not answer/)
  })
  it('a deployment row is printed as is', () => {
    const r = inflight(
      stubs(
        { out: '', code: 0 },
        { out: 'HEAD\n  abc | SUCCESS | 2026-10-03', code: 0 }
      )
    )
    expect(r.stdout).toMatch(/vibee-render +abc \| SUCCESS \| 2026-10-03/)
  })
  it('a failed gh says open PRs are unknown; an empty answer says none open', () => {
    const failed = inflight(
      stubs({ out: 'HTTP 401', code: 1 }, { out: '', code: 0 })
    )
    expect(failed.stdout).toMatch(/gh did not answer -- open PRs unknown/)
    expect(failed.stdout).not.toMatch(/HTTP 401/)
    const empty = inflight(stubs({ out: '', code: 0 }, { out: '', code: 0 }))
    expect(empty.stdout).toMatch(/\(none open\)/)
  })
})
