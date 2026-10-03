/**
 * tri runner deploy --wait: "deployed" means a NEW deployment is SUCCESS and
 * /health answers ok -- not the previous deploy's SUCCESS, not an upload that
 * returned. git, railway, curl and sleep are stubs on PATH.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const RUNNER = path.join(ROOT, 'bin/helpers/runner.sh')

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

const OLD = '  old-id | SUCCESS | 2026-10-03 04:02:23 +07:00'

/** The FIRST list is read before the upload (the old newest); then what `railway deployment list` prints on call 1, 2, 3...; the last repeats. */
function run(
  lists: string[],
  health: string,
  extra: Record<string, string> = {}
) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tri-runner-'))
  dirs.push(d)
  lists.forEach((l, i) => fs.writeFileSync(path.join(d, `list${i}`), l + '\n'))
  fs.writeFileSync(path.join(d, 'n'), '0')
  const bin = (name: string, body: string) =>
    fs.writeFileSync(path.join(d, name), `#!/bin/bash\n${body}\n`, {
      mode: 0o755,
    })
  bin('git', 'exit 0')
  bin('sleep', 'exit 0')
  bin('curl', `echo '${health}'`)
  bin(
    'railway',
    `case "$1 $2" in
  "up deployment/check-runner") echo uploaded; exit 0 ;;
  "deployment list")
    n=$(cat ${d}/n); echo $((n+1)) > ${d}/n
    f=${d}/list$n; [ -f "$f" ] || f=${d}/list${lists.length - 1}
    echo "Recent Deployments"; cat "$f" ;;
esac`
  )
  return spawnSync('bash', [RUNNER, d, 'deploy', '--wait'], {
    cwd: d,
    encoding: 'utf8',
    env: {
      PATH: `${d}:/usr/bin:/bin`,
      HOME: d,
      TRI_RUNNER_WAIT: '5',
      ...extra,
    },
  })
}

describe('tri runner deploy --wait', () => {
  it('is healthy only for a NEW deployment that is SUCCESS with /health ok', () => {
    const r = run(
      [
        OLD,
        `  new-id | BUILDING | now\n${OLD}`,
        `  new-id | SUCCESS | now\n${OLD}`,
      ],
      '{"ok":true}'
    )
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('deployed and healthy: new-id')
  })

  it("does not take the previous deploy's SUCCESS for this one", () => {
    const r = run([OLD], '{"ok":true}', { TRI_RUNNER_WAIT: '0' })
    expect(r.status).toBe(1)
    expect(r.stdout).toContain('still not healthy')
  })

  it('a FAILED new deployment is reported with its id', () => {
    const r = run([OLD, `  bad-id | FAILED | now\n${OLD}`], '{"ok":true}')
    expect(r.status).toBe(1)
    expect(r.stdout).toContain('bad-id ended badly')
  })

  it('SUCCESS with a dead /health is not healthy', () => {
    const r = run([OLD, `  new-id | SUCCESS | now\n${OLD}`], '', {
      TRI_RUNNER_WAIT: '0',
    })
    expect(r.status).toBe(1)
    expect(r.stdout).toContain('SUCCESS but /health says')
  })
})
