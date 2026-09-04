import { describe, it, expect } from 'vitest'

/**
 * The secret guard runs on STAGED DIFFS. That is the right place to stop a new
 * leak and the wrong place to find an old one: a rule added today has no
 * opinion about a line committed last year, because that line is never staged
 * again.
 *
 * The gap was not hypothetical. A rule for passwords embedded in connection
 * strings was added after a live one was found, and the two OTHER files
 * carrying the same shape were found by a hand-typed grep -- not by the guard,
 * and not by any tool.
 *
 * probe-repo-secrets.cjs closes that by running the guard's OWN table over
 * every tracked file. What this file pins is the INSTRUMENT, not the corpus:
 * the sweep's result is a reading queue that changes with every commit, but a
 * sweep whose table failed to parse would report an empty queue and read as
 * good news.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  readGuardRules,
  classifyHit,
} = require('../../../scripts/probe-repo-secrets.cjs')

describe('the repo-wide secret sweep', () => {
  it("parses the guard's table instead of restating it", () => {
    const rules = readGuardRules()
    expect(rules, 'guard table must parse').toBeTruthy()
    expect(rules.patterns.length).toBeGreaterThanOrEqual(5)
    // Every pattern must be a usable regex. A pattern that only grep accepts
    // is fine -- this checks they survived unquoting, not that JS can run them.
    for (const p of rules.patterns) expect(typeof p).toBe('string')
    for (const p of rules.patterns) expect(p.length).toBeGreaterThan(3)
  })

  it('keeps the guard label and pattern arrays the same length', () => {
    // They are POSITIONAL: NAMES[i] describes PATTERNS[i]. Adding a rule to one
    // array and not the other makes the guard blame the wrong rule, and I
    // nearly did exactly that when adding the connection-string pattern.
    const { patterns, labels } = readGuardRules()
    expect(labels.length).toBe(patterns.length)
  })

  it('separates a value from a reference to a value', () => {
    // The triage that makes the queue readable. The guard's broad rule ends
    // with [A-Za-z0-9_/+=-]{16,}, which an ordinary identifier satisfies, so
    // without this every long variable name reads as a leaked secret.
    const at = (body: string) => classifyHit(`some/file.ts:1:${body}`)

    expect(at('const API_KEY = process.env.SOME_SERVICE_KEY')).toBe(
      'ссылка на переменную'
    )
    const identFixture = 'const API_KEY = telegramBotTokenValue' // secret-guard-ok: fixture
    expect(at(identFixture)).toBe('ссылка на переменную')
    // A quoted env-var NAME says where the secret lives, not what it is.
    expect(at("{ tokenEnvVar: 'BOT_TOKEN_9' }")).toBe('заглушка')
    expect(at("const API_KEY = 'your-key-here'")).toBe('заглушка')
  })

  it('still calls a quoted opaque value a literal', () => {
    // The other side. A triage that answered "reference" to everything would
    // empty the queue and look like a clean repository.
    const at = (body: string) => classifyHit(`some/file.ts:1:${body}`)
    const opaque = ['abcd1234', 'wxyz9876pqrs'].join('')
    expect(at(`const API_KEY = '${opaque}'`)).toBe('ЛИТЕРАЛ')
  })
})
