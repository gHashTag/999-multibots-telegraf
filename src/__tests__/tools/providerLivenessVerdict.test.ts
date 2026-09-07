import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

/**
 * A KEY BEING SET IS NOT A KEY THAT WORKS.
 *
 * `capabilityPreflight` answers "is the variable set" — and that check was
 * wrong every time it mattered. Measured against production 2026-09-08:
 *
 *   replicate   set, HTTP 200, fine
 *   openai      set, HTTP 401 "Incorrect API key provided"
 *   elevenlabs  set, HTTP 400 "API key ID used as API key"
 *
 * Two of the three services the bot advertises would refuse at the moment
 * somebody asked. So the probe asks the providers instead of the environment —
 * and the part that decides an accusation is the verdict rule, which is what
 * these checks are about.
 */
const SCRIPT = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'scripts',
  'provider-liveness.cjs'
)
const ROOT = path.join(__dirname, '..', '..', '..')
const source = fs.readFileSync(SCRIPT, 'utf8')

const run = (file: string) => {
  const bare = { ...process.env }
  delete bare.REPLICATE_API_TOKEN
  delete bare.OPENAI_API_KEY
  delete bare.ELEVENLABS_API_KEY
  try {
    return {
      code: 0,
      out: execFileSync('node', [file], {
        cwd: ROOT,
        encoding: 'utf8',
        env: bare,
      }),
    }
  } catch (e: any) {
    return {
      code: e.status ?? -1,
      out: String(e.stdout || '') + String(e.stderr || ''),
    }
  }
}

describe('the verdict rule is checked before it accuses anybody', () => {
  it('runs its own self-check and says so', () => {
    const { code, out } = run(SCRIPT)
    expect(code, `output:\n${out}`).toBe(0)
    expect(out).toContain('self-check ok')
  })

  /**
   * Each breakage makes the rule wrong in one direction, and the script must
   * refuse rather than report. A self-check that cannot fail is decoration.
   */
  const breakages: Array<[string, string, string]> = [
    [
      'blind to a 401',
      'const REJECTED = new Set([401, 403])',
      'const REJECTED = new Set([])',
    ],
    [
      'blind to an auth refusal in the body',
      "if (AUTH_REFUSAL.test(body)) return 'REJECTED'",
      "if (false && AUTH_REFUSAL.test(body)) return 'REJECTED'",
    ],
    [
      'calling a network failure a verdict',
      "if (code === 0) return 'UNREACHABLE'",
      "if (code === 0) return 'REJECTED'",
    ],
  ]

  for (const [name, from, to] of breakages) {
    it(`exits 2 when the rule goes ${name}`, () => {
      expect(source.includes(from), `anchor for "${name}" not found`).toBe(true)
      const broken = source.replace(from, to)
      expect(broken).not.toBe(source)
      const tmp = path.join(
        os.tmpdir(),
        `liveness-${name.replace(/\W/g, '')}.cjs`
      )
      fs.writeFileSync(tmp, broken)
      const { code, out } = run(tmp)
      fs.unlinkSync(tmp)
      expect(code, `output:\n${out}`).toBe(2)
      expect(out).toContain('SELF-CHECK FAILED')
    })
  }

  /**
   * The 405 case is not pedantry: the first run of this probe used the wrong
   * method against fal and got one. Reading that as a dead key would have been
   * a false accusation of a working provider.
   */
  it('does not read my own wrong method as a dead key', () => {
    expect(source).toMatch(/verdict\(405\) === 'REJECTED'/)
    expect(source).toContain('my wrong method')
  })

  /**
   * The property is that the key VALUE never reaches the output — not that the
   * word is absent. The first version of this check matched the word inside
   * quoted prose ("No key is printed here") and accused its own file.
   */
  it('never prints a key, only its length and the provider answer', () => {
    expect(source).not.toMatch(/\$\{key\}/)
    const printing = source
      .split('\n')
      .filter(line => /console\.(log|error)/.test(line))
      // Strings are prose; only identifiers can leak a value.
      .map(line => line.replace(/'[^']*'|"[^"]*"|`[^`]*`/g, "''"))
      .filter(line => /\bkey\b(?!\.length)/.test(line))
    expect(printing, 'a key value must never reach the output').toEqual([])
    expect(source).toContain('key.length')
    expect(source).toContain('No key is printed here')
  })
})
