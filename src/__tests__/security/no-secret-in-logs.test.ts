/**
 * No production console/logger call may log the VALUE of a secret.
 *
 * A secret written to stdout persists wherever logs go (Railway). This ratchet
 * closes the class the emailWizard Robokassa Password1 leak (#1255) exposed: the
 * secret sat on a separate line of a multi-line log object, so a single-line grep
 * missed it. Here each console/logger call's FULL argument is extracted by
 * paren balance; string literals are stripped (a secret WORD inside a message —
 * 'API_KEY not set' — is fine) while ${...} interpolations are kept; then a
 * secret-name pattern that survives, and is not a safe form (!!x, hasX, .length,
 * a NAME field like .secretKey/.bot_name), is a leak.
 *
 * Log the key NAME / a presence flag / a length — never the value.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.join(__dirname, '..', '..')

const SECRET =
  /token|api_?key|apikey|secret|password|BOT_TOKEN|SERVICE_KEY|CLIENT_SECRET|private_?key/i
const SAFE =
  /!!|Boolean|has[A-Z]|\.length|\.substring|\.slice|redact|mask|scrub|\*\*\*|===|!==|not\s*found|not\s*set|is not set|missing|configured|Present|present|exists|Label|tokenKey|tokenExists|totalSecrets|secretsStats|numSecrets|secretsCount|getBotName|\.bot_name|\.secretKey\b|secretKey:|\.name\b/i
const OPEN =
  /(?:console\.(?:log|error|warn|info)|logger\.(?:info|error|warn|debug))\s*\(/g

// Strip string literals so a secret WORD in a message is not read as a VALUE;
// keep ${...} interpolations (those ARE value logs).
function stripStrings(s: string): string {
  let out = ''
  for (let i = 0; i < s.length; ) {
    const c = s[i]
    if (c === "'" || c === '"') {
      const q = c
      i++
      while (i < s.length && s[i] !== q) {
        if (s[i] === '\\') i++
        i++
      }
      i++
      out += ' '
    } else if (c === '`') {
      i++
      while (i < s.length && s[i] !== '`') {
        if (s[i] === '\\') {
          i += 2
          continue
        }
        if (s[i] === '$' && s[i + 1] === '{') {
          i += 2
          let depth = 1
          while (i < s.length && depth > 0) {
            if (s[i] === '{') depth++
            else if (s[i] === '}') depth--
            if (depth > 0) out += s[i]
            i++
          }
        } else i++
      }
      i++
      out += ' '
    } else {
      out += c
      i++
    }
  }
  return out
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === 'node_modules') continue
      walk(p, out)
    } else if (
      p.endsWith('.ts') &&
      !p.endsWith('.test.ts') &&
      !p.endsWith('.spec.ts')
    ) {
      out.push(p)
    }
  }
  return out
}

function leaks(): string[] {
  const found: string[] = []
  for (const file of walk(SRC)) {
    const src = fs.readFileSync(file, 'utf8')
    OPEN.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = OPEN.exec(src))) {
      let depth = 0
      let i = m.index + m[0].length - 1
      let end = -1
      for (; i < src.length && i - m.index < 4000; i++) {
        const c = src[i]
        if (c === '(') depth++
        else if (c === ')') {
          depth--
          if (depth === 0) {
            end = i
            break
          }
        }
      }
      if (end < 0) continue
      const arg = src.slice(m.index, end + 1)
      if (SECRET.test(stripStrings(arg)) && !SAFE.test(arg)) {
        const line = src.slice(0, m.index).split('\n').length
        found.push(`${path.relative(SRC, file)}:${line}`)
      }
    }
  }
  return found
}

describe('no production log leaks a secret value', () => {
  /**
   * WIDENING THE SAFE LIST IS THE DANGEROUS DIRECTION, so it is checked both
   * ways on a fixture rather than trusted.
   *
   * `scrub` was added because the rule flagged the MITIGATION: registerCommands
   * logs `scrubCallbackSecrets(callbackData)`, and that function replaces the
   * one-time confirmation secret with a placeholder before anything is printed
   * (src/utils/scrubCallbackSecrets.ts). Accusing the scrubber is a false
   * alarm; failing to accuse a bare value would be the real miss.
   */
  it('still catches a bare secret value, and no longer accuses the scrubber', () => {
    const leaks = "console.log('token', apiKeyValue)"
    const scrubbed = "console.log('data', scrubCallbackSecrets(callbackData))"
    const masked = "console.log('token', redact(apiKeyValue))"
    expect(
      SECRET.test(leaks) && !SAFE.test(leaks),
      'a bare value must still be flagged'
    ).toBe(true)
    expect(SAFE.test(scrubbed), 'a scrubbed value must not be flagged').toBe(
      true
    )
    expect(SAFE.test(masked), 'the neighbouring verbs must keep working').toBe(
      true
    )
  })

  it('every console/logger call logs the key NAME / a flag, never the value', () => {
    const offenders = leaks()
    expect(
      offenders,
      `these log calls appear to log a secret VALUE (log the key name / ` +
        `!!presence / .length instead):\n${offenders.join('\n')}`
    ).toEqual([])
  })
})
