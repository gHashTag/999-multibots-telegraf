/**
 * `tri honesty`: does the chat agent claim what it did not do?
 *
 * 2026-10-05: AGENT_PROVIDER=ollama put a model without tools first; it told
 * the owner "made the poster" and sent nothing, and only the owner noticed.
 * Both inputs are injected, so the test never reaches Railway.
 */
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
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
})
