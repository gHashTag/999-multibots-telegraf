/**
 * `tri honesty`: does the chat agent claim what it did not do?
 *
 * 2026-10-05: AGENT_PROVIDER=ollama put a model without tools first; it told
 * the owner "made the poster" and sent nothing, and only the owner noticed.
 * The head is the render's own head_note from GET /api/agent/provider (#3722).
 * Both inputs are injected, so the test never reaches Railway or the render.
 *
 * Stub safety (memory stub-reached-real-token): every run drops the real
 * RENDER_API_KEY from the env and points RENDER_BASE_URL at a closed local
 * port, so even a stub that misses PATH cannot send a real key anywhere.
 */
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const HONESTY = path.join(__dirname, '..', 'bin', 'helpers', 'honesty.sh')

// The four head_note values of spec agent-provider-chain.t27 (NOTE_*).
const NOTE_DEMOTED = 'demoted: no tools'
const NOTE_BOT_PICK = 'owner pick: no tools'
const NOTE_NO_TOOLS = 'no provider in the chain calls tools'

function status(note: string | null, extra: object = {}) {
  return JSON.stringify({
    current: { id: 'zai', model: 'glm-4.7-flash', context: 128000 },
    answering: { id: 'zai', model: 'glm-4.7-flash' },
    breakers: [],
    chosen: null,
    env: null,
    head_note: note,
    chain: [{ id: 'zai', model: 'glm-4.7-flash', context: 128000 }],
    ...extra,
  })
}

function safeEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    RENDER_BASE_URL: 'http://127.0.0.1:9',
    RVARS_PAUSE: '0',
  }
  delete env.RENDER_API_KEY
  delete env.TRI_PROVIDER_JSON
  delete env.TRI_HONESTY_LOG
  return env
}

/* body: the endpoint's answer; null = no file, i.e. the endpoint is silent. */
function run(body: string | null, lines: string[]) {
  const dir = mkdtempSync(path.join(tmpdir(), 'honesty-'))
  const log = path.join(dir, 'log.txt')
  writeFileSync(log, lines.join('\n'))
  const json = path.join(dir, 'provider.json')
  if (body !== null) writeFileSync(json, body)
  const r = spawnSync('bash', [HONESTY, '24'], {
    encoding: 'utf8',
    env: { ...safeEnv(), TRI_PROVIDER_JSON: json, TRI_HONESTY_LOG: log },
  })
  return { rc: r.status, out: `${r.stdout}${r.stderr}` }
}

const flag = (row: object) =>
  `2026-10-06T01:00:00Z [agent:honesty] ${JSON.stringify(row)}`

describe('tri honesty', () => {
  it('head_note null: the head calls tools, rc 0', () => {
    const r = run(status(null), ['[agent] provider zai', ''])
    expect(r.rc).toBe(0)
    expect(r.out).toMatch(/ok {4}head: zai calls tools \(answering zai\)/)
    expect(r.out).toMatch(/no answer claimed an action/)
  })

  it('head_note "" (NOTE_NONE) is the same clean head', () => {
    const r = run(status(''), [])
    expect(r.rc).toBe(0)
    expect(r.out).toMatch(/ok {4}head: zai calls tools/)
  })

  it('demoted: the server note is printed, rc 1, fix names AGENT_PROVIDER', () => {
    const r = run(status(NOTE_DEMOTED, { env: 'ollama' }), [])
    expect(r.rc).toBe(1)
    expect(r.out).toMatch(/FAIL {2}head: demoted: no tools -- head zai/)
    expect(r.out).toMatch(/AGENT_PROVIDER=ollama cannot call tools/)
    expect(r.out).toMatch(/fix: set AGENT_PROVIDER=zai on vibee-render/)
  })

  it('owner pick: rc 1 and the fix is /model, not a variable', () => {
    const r = run(
      status(NOTE_BOT_PICK, {
        current: { id: 'ollama' },
        answering: { id: 'ollama' },
        chosen: 'ollama',
      }),
      []
    )
    expect(r.rc).toBe(1)
    expect(r.out).toMatch(/FAIL {2}head: owner pick: no tools -- head ollama/)
    expect(r.out).toMatch(/\/model pick ollama/)
    expect(r.out).toMatch(/\/model zai in the bot/)
  })

  it('no provider calls tools: rc 1', () => {
    const r = run(status(NOTE_NO_TOOLS, { current: { id: 'ollama' } }), [])
    expect(r.rc).toBe(1)
    expect(r.out).toMatch(/FAIL {2}head: no provider in the chain calls tools/)
  })

  it('an unknown note is still a flag, printed verbatim', () => {
    const r = run(status('something new'), [])
    expect(r.rc).toBe(1)
    expect(r.out).toMatch(/FAIL {2}head: something new/)
    expect(r.out).toMatch(/unknown head_note/)
  })

  it('a silent endpoint is rc 2 "not measured", never ok', () => {
    for (const body of [null, '', '<html>502</html>', '{"current":null}']) {
      const r = run(body, [])
      expect(r.out).toMatch(/head: .*not measured/)
      expect(r.out).not.toMatch(/ok {4}head/)
      expect(r.rc).toBe(2)
    }
  })

  it('counts flags by kind and by the tool that should have run', () => {
    const r = run(status(null), [
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
    const r = run(status(null), [
      flag({ turn: 'turn-xyz', telegram_id: 987654321, claim: 'media' }),
    ])
    expect(r.out).not.toContain('987654321')
    expect(r.out).not.toContain('turn-xyz')
  })

  it('a malformed line still counts as one flag', () => {
    const r = run(status(null), ['[agent:honesty] {not json'])
    expect(r.out).toMatch(/1 answer\(s\) claimed/)
  })

  /* PR #3670 review: a measured 1 must not drown in "could not measure". */
  function stubbed(body: string | null, bin: string, withLog: boolean) {
    const dir = mkdtempSync(path.join(tmpdir(), 'honesty-stub-'))
    // The python3 stub breaks only the flag counter; the head reader runs.
    const script =
      bin === 'python3'
        ? `#!/bin/sh\ncase "$*" in *collections*) exit 1 ;; esac\nexec ${realPython()} "$@"\n`
        : '#!/bin/sh\nexit 1\n'
    writeFileSync(path.join(dir, bin), script)
    chmodSync(path.join(dir, bin), 0o755)
    const log = path.join(dir, 'log.txt')
    writeFileSync(log, '[agent:honesty] {}\n')
    const json = path.join(dir, 'provider.json')
    if (body !== null) writeFileSync(json, body)
    const env: NodeJS.ProcessEnv = {
      ...safeEnv(),
      PATH: `${dir}:${process.env.PATH}`,
      TRI_PROVIDER_JSON: json,
    }
    if (withLog) env.TRI_HONESTY_LOG = log
    const r = spawnSync('bash', [HONESTY, '24'], { encoding: 'utf8', env })
    return { rc: r.status, out: `${r.stdout}${r.stderr}` }
  }

  it('a flagged head stays rc 1 when Railway lists no deployments', () => {
    const r = stubbed(status(NOTE_DEMOTED), 'railway', false)
    expect(r.out).toMatch(/FAIL {2}head/)
    expect(r.out).toMatch(/NOT counted/)
    expect(r.rc).toBe(1)
  })

  it('a broken counter is "not measured", never "ok"', () => {
    const r = stubbed(status(null), 'python3', true)
    expect(r.out).toMatch(/counter failed/)
    expect(r.out).not.toMatch(/ok {4}log/)
    expect(r.rc).toBe(2)
    expect(stubbed(status(NOTE_DEMOTED), 'python3', true).rc).toBe(1)
  })

  it('counted flags are rc 1 even when the head was not measured', () => {
    const r = stubbed(null, 'railway', true)
    expect(r.out).toMatch(/not measured/)
    expect(r.out).toMatch(/1 answer\(s\) claimed/)
    expect(r.rc).toBe(1)
  })

  /*
   * The live path, with railway and curl both stubbed: the key reaches curl
   * on stdin only, the owner id is named, and nothing prints the key.
   */
  it('the live path sends the key on stdin, never in argv or output', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'honesty-live-'))
    const FAKE = 'fake-key-for-honesty-test'
    const seen = path.join(dir, 'curl.txt')
    writeFileSync(
      path.join(dir, 'railway'),
      `#!/bin/sh\nprintf 'AGENT_PROVIDER=zai\\nRENDER_API_KEY=${FAKE}\\n'\n`
    )
    writeFileSync(
      path.join(dir, 'curl'),
      `#!/bin/sh\n{ echo "ARGV $*"; echo "STDIN $(cat)"; } > '${seen}'\nprintf '%s' '${status(NOTE_BOT_PICK)}'\n`
    )
    chmodSync(path.join(dir, 'railway'), 0o755)
    chmodSync(path.join(dir, 'curl'), 0o755)
    const log = path.join(dir, 'log.txt')
    writeFileSync(log, '')
    const r = spawnSync('bash', [HONESTY, '24'], {
      encoding: 'utf8',
      env: {
        ...safeEnv(),
        PATH: `${dir}:${process.env.PATH}`,
        TRI_HONESTY_LOG: log,
      },
    })
    const out = `${r.stdout}${r.stderr}`
    const calls = readFileSync(seen, 'utf8')
    expect(out).toMatch(/FAIL {2}head: owner pick: no tools/)
    expect(r.status).toBe(1)
    expect(out).not.toContain(FAKE)
    expect(calls).toMatch(
      /^ARGV .*\/api\/agent\/provider\?telegram_id=144022504/m
    )
    expect(calls).toMatch(/127\.0\.0\.1:9/)
    expect(calls.split('\n')[0]).not.toContain(FAKE)
    expect(calls).toContain(`STDIN X-Api-Key: ${FAKE}`)
  })
})

function realPython() {
  const r = spawnSync('sh', ['-c', 'command -v python3'], { encoding: 'utf8' })
  return r.stdout.trim()
}
