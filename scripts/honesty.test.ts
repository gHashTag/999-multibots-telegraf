/**
 * `tri honesty`: does the chat agent claim what it did not do?
 *
 * 2026-10-05: AGENT_PROVIDER=ollama put a model without tools first; it told
 * the owner "made the poster" and sent nothing, and only the owner noticed.
 * Both inputs are injected, so the test never reaches Railway.
 */
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const HONESTY = path.join(__dirname, '..', 'bin', 'helpers', 'honesty.sh')

function run(provider: string, lines: string[]) {
  const dir = mkdtempSync(path.join(tmpdir(), 'honesty-'))
  const log = path.join(dir, 'log.txt')
  writeFileSync(log, lines.join('\n'))
  const r = spawnSync('bash', [HONESTY, '24'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      TRI_AGENT_PROVIDER: provider,
      TRI_HONESTY_LOG: log,
    },
  })
  return { rc: r.status, out: `${r.stdout}${r.stderr}` }
}

const flag = (row: object) =>
  `2026-10-06T01:00:00Z [agent:honesty] ${JSON.stringify(row)}`

describe('tri honesty', () => {
  it('a tools-capable head and a clean log is rc 0', () => {
    const r = run('zai', ['[agent] provider zai', ''])
    expect(r.rc).toBe(0)
    expect(r.out).toMatch(/AGENT_PROVIDER=zai \(calls tools\)/)
    expect(r.out).toMatch(/no answer claimed an action/)
  })

  it('an unset head is the default chain', () => {
    expect(run('', []).out).toMatch(/AGENT_PROVIDER unset/)
  })

  it('a head without tools is rc 1 and names the fix', () => {
    const r = run('OLLAMA', [])
    expect(r.rc).toBe(1)
    expect(r.out).toMatch(/FAIL\s+head: AGENT_PROVIDER=ollama/)
    expect(r.out).toMatch(/AGENT_PROVIDER=zai/)
  })

  it('counts flags by kind and by the tool that should have run', () => {
    const r = run('zai', [
      flag({
        turn: 't1',
        telegram_id: 111,
        claim: 'media',
        unbacked: ['image_generate'],
      }),
      flag({
        turn: 't2',
        telegram_id: 222,
        claim: 'browser+media',
        unbacked: ['browser_open', 'image_generate'],
      }),
      // A line from before the claim field existed reads as browser.
      flag({ turn: 't3', unbacked: ['browser_click'] }),
    ])
    expect(r.rc).toBe(1)
    expect(r.out).toMatch(/3 answer\(s\) claimed/)
    expect(r.out).toMatch(/1\s+claim media/)
    expect(r.out).toMatch(/1\s+claim browser\+media/)
    expect(r.out).toMatch(/1\s+claim browser\n/)
    expect(r.out).toMatch(/2\s+should have called image_generate/)
  })

  it('never prints a telegram id or a turn id', () => {
    const r = run('zai', [
      flag({ turn: 'turn-xyz', telegram_id: 987654321, claim: 'media' }),
    ])
    expect(r.out).not.toContain('987654321')
    expect(r.out).not.toContain('turn-xyz')
  })

  it('a malformed line still counts as one flag', () => {
    const r = run('zai', ['[agent:honesty] {not json'])
    expect(r.out).toMatch(/1 answer\(s\) claimed/)
  })

  /* PR #3670 review: a measured 1 must not drown in "could not measure". */
  function stubbed(provider: string, bin: string, withLog: boolean) {
    const dir = mkdtempSync(path.join(tmpdir(), 'honesty-stub-'))
    writeFileSync(path.join(dir, bin), '#!/bin/sh\nexit 1\n')
    chmodSync(path.join(dir, bin), 0o755)
    const log = path.join(dir, 'log.txt')
    writeFileSync(log, '[agent:honesty] {}\n')
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: `${dir}:${process.env.PATH}`,
      TRI_AGENT_PROVIDER: provider,
    }
    if (withLog) env.TRI_HONESTY_LOG = log
    else delete env.TRI_HONESTY_LOG
    const r = spawnSync('bash', [HONESTY, '24'], { encoding: 'utf8', env })
    return { rc: r.status, out: `${r.stdout}${r.stderr}` }
  }

  it('a tools-less head stays rc 1 when Railway lists no deployments', () => {
    const r = stubbed('ollama', 'railway', false)
    expect(r.out).toMatch(/FAIL {2}head/)
    expect(r.out).toMatch(/NOT counted/)
    expect(r.rc).toBe(1)
  })

  it('a broken counter is "not measured", never "ok"', () => {
    const r = stubbed('zai', 'python3', true)
    expect(r.out).toMatch(/counter failed/)
    expect(r.out).not.toMatch(/ok {4}log/)
    expect(r.rc).toBe(2)
    expect(stubbed('ollama', 'python3', true).rc).toBe(1)
  })
})
