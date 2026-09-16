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
 *
 * 2026-09-16: THE SAFE LIST CONTAINED THE LEAK. `\.substring` and `\.slice`
 * were on it, which is to say the gate treated
 *
 *   console.log('[ElevenLabs] key:', apiKey.substring(0, 10))
 *
 * -- the exact form this repository actually ships -- as a mitigation. A prefix
 * is not a mask: ten characters of an sk-proj key go to Railway's retention
 * verbatim, and `sk-proj-` is only the first eight of them. With those two
 * verbs removed the gate found six live sites, all now on
 * `secretFingerprint()` (src/utils/secretFingerprint.ts), the digest PR #2363
 * had already adopted in ONE file and nowhere else.
 *
 * Two smaller repairs came with it, both of which had been hiding real state:
 *   - digest CALLS are now SAFE, because the gate was accusing its own remedy
 *     (src/index.ts:790 prints `secretFingerprint(value)`), so it had been RED
 *     -- and therefore enforcing nothing -- since PR #2363 landed. The first
 *     cut of that repair spelled them as the bare words
 *     `fingerprint|digest|sha256|createHash`, which widened the ratchet in
 *     exactly the way the note on `hash` below refuses: SAFE is read off the
 *     RAW call, so `logger.error('sha256 mismatch for key', { apiKey })` --
 *     prose in the message, the key itself in the argument -- would have been
 *     waved through. They are call shapes now (SAFE_DIGEST), read off the
 *     string-stripped call;
 *   - comments are stripped before scanning, because a commented-out log in
 *     bot.ts was being reported as a live leak.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.join(__dirname, '..', '..')

const SECRET =
  /token|api_?key|apikey|secret|password|BOT_TOKEN|SERVICE_KEY|CLIENT_SECRET|private_?key/i
// NOTE the two verbs that are NOT here: `.substring` and `.slice`. A prefix of
// a secret is still the secret. Use secretFingerprint() -- a one-way digest --
// when you need to tell two environments apart; it is covered by SAFE_DIGEST
// below. `hash` alone is deliberately absent: it would whitelist any call whose
// message happens to contain the substring (this repo has a `ghashtag/...`
// model id), and SAFE is matched against the raw text, strings included.
const SAFE =
  /!!|Boolean|has[A-Z]|\.length|redact|mask|scrub|\*\*\*|===|!==|not\s*found|not\s*set|is not set|missing|configured|Present|present|exists|Label|tokenKey|tokenExists|totalSecrets|secretsStats|numSecrets|secretsCount|getBotName|\.bot_name|\.secretKey\b|secretKey:|\.name\b/i
/**
 * The digest escape hatch, kept apart from SAFE because it obeys two rules SAFE
 * does not -- and both of them are the reason `hash` is banned from SAFE above.
 *
 * It is CALL-SHAPED. As the bare words `fingerprint|digest|sha256|createHash`
 * it exempted any call whose MESSAGE merely mentioned one of them, and a
 * message is prose somebody writes in a hurry:
 * `logger.error('sha256 mismatch for key', { apiKey })` passed, key and all.
 * A sentence rarely carries the paren; the second rule covers it when it does.
 *
 * It is read off the STRING-STRIPPED call, the way SECRET already is, so the
 * anchor has to be code: writing `secretFingerprint(` inside a message buys
 * nothing.
 *
 * `\.digest\s*\(` and `createHash\s*\(` cover the inline form
 * (`createHash('sha256').update(apiKey).digest('hex')`) that
 * src/utils/secretFingerprint.ts wraps; `.slice(0, 8)` on its output is a
 * prefix OF THE DIGEST, which is why cutting `.slice` from SAFE does not
 * accuse it.
 *
 * What this does NOT fix, because it is the standing limit of the mechanism
 * rather than anything the digest words introduced: an exemption acquits the
 * WHOLE call, so a call that digests one value and prints a raw key beside it
 * still passes. Narrowing that means matching each ARGUMENT, not each call.
 */
const SAFE_DIGEST = /secretFingerprint\s*\(|createHash\s*\(|\.digest\s*\(/
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

/**
 * The whole rule, in one place: a secret name survives the string-stripping,
 * and nothing in the call says it was reduced to a name, a flag, a length or a
 * digest first.
 *
 * leaks() and every fixture below ask THIS function, so a fixture cannot go on
 * asserting a rule the scan no longer applies -- which is how the SAFE list
 * grew four bare words while its own test kept passing.
 */
function isLeak(call: string): boolean {
  const code = stripStrings(call)
  return SECRET.test(code) && !SAFE.test(call) && !SAFE_DIGEST.test(code)
}

/**
 * Blank out comments, byte-for-byte, before anything else looks at the file.
 *
 * Dead code is not a leak. `bot.ts:130` is a commented-out log that the gate
 * reported for months, and a report you have to remember to ignore is a report
 * that stops being read.
 *
 * Every removal is replaced by the SAME number of characters (spaces, newlines
 * kept), so offsets, paren balance and line numbers downstream are untouched.
 * Strings and regex literals are walked through rather than over: `'https://x'`
 * must not lose its tail, and `/api_key/i` must not eat the rest of the file.
 */
export function stripComments(s: string): string {
  const out = s.split('')
  const blank = (from: number, to: number) => {
    for (let k = from; k < to && k < s.length; k++) {
      if (s[k] !== '\n') out[k] = ' '
    }
  }
  let prev = '' // last meaningful character, for the regex-vs-division call
  for (let i = 0; i < s.length; ) {
    const c = s[i]
    if (c === "'" || c === '"' || c === '`') {
      const q = c
      i++
      while (i < s.length && s[i] !== q) {
        if (s[i] === '\\') i++
        i++
      }
      i++
      prev = q
      continue
    }
    if (c === '/' && s[i + 1] === '/') {
      const nl = s.indexOf('\n', i)
      const end = nl === -1 ? s.length : nl
      blank(i, end)
      i = end
      continue
    }
    if (c === '/' && s[i + 1] === '*') {
      const close = s.indexOf('*/', i + 2)
      const end = close === -1 ? s.length : close + 2
      blank(i, end)
      i = end
      continue
    }
    if (c === '/' && (prev === '' || '(,=:[!&|?{};+-*%~^'.includes(prev))) {
      // A regex literal -- but only if it closes on the same line. If it does
      // not, this was division and the '/' is just an operator.
      let j = i + 1
      let inClass = false
      let closed = -1
      for (; j < s.length && s[j] !== '\n'; j++) {
        if (s[j] === '\\') {
          j++
          continue
        }
        if (s[j] === '[') inClass = true
        else if (s[j] === ']') inClass = false
        else if (s[j] === '/' && !inClass) {
          closed = j
          break
        }
      }
      if (closed !== -1) {
        i = closed + 1
        prev = '/'
        continue
      }
    }
    if (!/\s/.test(c)) prev = c
    i++
  }
  return out.join('')
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
    const src = stripComments(fs.readFileSync(file, 'utf8'))
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
      if (isLeak(arg)) {
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
    const bare = "console.log('token', apiKeyValue)"
    const scrubbed = "console.log('data', scrubCallbackSecrets(callbackData))"
    const masked = "console.log('token', redact(apiKeyValue))"
    expect(isLeak(bare), 'a bare value must still be flagged').toBe(true)
    expect(isLeak(scrubbed), 'a scrubbed value must not be flagged').toBe(false)
    expect(isLeak(masked), 'the neighbouring verbs must keep working').toBe(
      false
    )
  })

  it('a PREFIX of a secret is a leak, and a DIGEST of one is not', () => {
    /*
     * The pair that used to be decided the wrong way round. Both lines answer
     * the same operational question -- "which key is loaded here?" -- and only
     * one of them pays for the answer with key material.
     */
    const prefix = "console.log('[ElevenLabs] key:', apiKey.substring(0, 10))"
    const sliced = "console.log('[Replicate] token:', token.slice(0, 8))"
    const digest = "console.log('[ElevenLabs] key:', secretFingerprint(apiKey))"

    expect(
      isLeak(prefix),
      'ten characters of an sk-proj key is still an sk-proj key'
    ).toBe(true)
    expect(isLeak(sliced), '.slice is the same leak spelled differently').toBe(
      true
    )
    expect(
      isLeak(digest),
      'the remedy must not be accused -- that is how this gate went red and stayed red'
    ).toBe(false)
  })

  /**
   * THE ESCAPE HATCH HAS TO BE A CALL, NOT A WORD IN THE MESSAGE.
   *
   * The first cut of the digest repair put `fingerprint|digest|sha256|
   * createHash` on SAFE as bare words, and SAFE is read off the raw call --
   * string literals included. No site in the tree spelled it that way, so
   * nothing leaked; what widened was the RULE, and a rule widens silently.
   * These four lines are the difference between the wording that means a
   * secret was reduced to eight hex characters and the wording that merely
   * mentions one.
   */
  it('a digest NAMED IN THE MESSAGE does not exempt the argument', () => {
    const prose = "logger.error('sha256 mismatch for key', { apiKey })"
    const quotedAnchor =
      "logger.error('secretFingerprint(value) came back empty', { apiKey })"
    const real = 'console.log(`🔑 SHA-256 prefix: ${secretFingerprint(value)}`)'
    const inline =
      "console.log('key id:', createHash('sha256').update(apiKey).digest('hex'))"

    expect(
      isLeak(prose),
      'the message says sha256, the argument is the key itself'
    ).toBe(true)
    expect(
      isLeak(quotedAnchor),
      'even the call shape means nothing inside a string literal'
    ).toBe(true)
    expect(
      isLeak(real),
      'src/index.ts:790, the site the digest repair exists for'
    ).toBe(false)
    expect(
      isLeak(inline),
      'the unwrapped form of secretFingerprint() is the same one-way function'
    ).toBe(false)
  })

  it('a length is still safe, because a truncated key is a real diagnosis', () => {
    // Removing .substring/.slice must not take .length with it. "0 chars" and
    // "39 chars instead of 51" are the two most useful things a startup log
    // can say about a key, and neither is key material.
    const withLength = "console.log('key loaded:', apiKey.length, 'chars')"
    expect(isLeak(withLength)).toBe(false)
  })

  it('dead code is not a leak, but live code next to it still is', () => {
    const fixture = [
      "// console.log('token', apiKeyValue)",
      '/* console.log(`api_key ${apiKey}`) */',
      "console.log('url', 'https://api.example.com/v1') // not a comment above",
      "console.log('token', apiKeyValue)",
    ].join('\n')
    const stripped = stripComments(fixture)

    expect(stripped, 'the commented-out calls survived').not.toMatch(
      /\/\/ console\.log/
    )
    expect(
      stripped.length,
      'blanking must preserve offsets, or every line number shifts'
    ).toBe(fixture.length)
    expect(stripped, 'a // inside a string literal is not a comment').toContain(
      'https://api.example.com/v1'
    )
    expect(
      stripped,
      'the live leak on the last line must be untouched'
    ).toContain("console.log('token', apiKeyValue)")
  })

  it('a regex literal does not swallow the code after it', () => {
    // The walker has to tell `/token/i` from division. If it guesses wrong in
    // the unsafe direction it blanks real code, and the gate goes quiet.
    const fixture = [
      'const SECRET = /api_key|token/i',
      "console.log('token', apiKeyValue)",
    ].join('\n')
    expect(stripComments(fixture)).toBe(fixture)
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
