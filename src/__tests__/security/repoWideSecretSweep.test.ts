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

  it('has a sample for every rule the commit guard enforces', () => {
    // The vocabularies drifted, measured: the guard knew 15 shapes and the
    // repo-wide test knew 11 of them -- Slack, PEM, Fal.ai and the connection
    // string were enforced at commit time and invisible in the tree. One of
    // those four I added to the guard myself, two iterations earlier, without
    // adding it here.
    //
    // The corpus of samples in no-secrets-in-repo.test.ts is the meeting
    // point: every guard rule must match at least one of them. A rule with no
    // sample is a rule nothing exercises.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fsMod = require('node:fs')
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { spawnSync } = require('node:child_process')
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pathMod = require('node:path')

    const corpus = fsMod.readFileSync(
      pathMod.resolve(__dirname, 'no-secrets-in-repo.test.ts'),
      'utf8'
    )
    const { patterns, labels } = readGuardRules()
    const uncovered: string[] = []
    patterns.forEach((p: string, i: number) => {
      const r = spawnSync('grep', ['-qEi', '-e', p], { input: corpus })
      if (r.status !== 0) uncovered.push(labels[i] || `rule ${i}`)
    })
    expect(uncovered).toEqual([])
  })

  it('enforces every shape the repo-wide test knows', () => {
    // The other direction. Guard-covers-corpus alone would let a rule be
    // deleted from the guard while the tree-wide test kept finding the shape:
    // new leaks would land, old ones would be reported. Measured before
    // pinning -- exactly one shape was enforced tree-wide and not at commit
    // time, and it was a provider this repo reads in twenty places.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fsMod = require('node:fs')
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { spawnSync } = require('node:child_process')
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pathMod = require('node:path')

    const corpus = fsMod.readFileSync(
      pathMod.resolve(__dirname, 'no-secrets-in-repo.test.ts'),
      'utf8'
    )
    const block = corpus.match(/const SELF_CHECK[\s\S]*?\n\]/)
    expect(block, 'sample table must parse').toBeTruthy()
    const pairs = [
      ...(block as RegExpMatchArray)[0].matchAll(
        /\[\s*\n\s*'([^']+)',\s*\n\s*'([^']+)',/g
      ),
    ]
    expect(pairs.length, 'samples must parse').toBeGreaterThan(10)

    const { patterns } = readGuardRules()
    const unenforced = pairs
      .filter(
        m =>
          !patterns.some(
            (p: string) =>
              spawnSync('grep', ['-qEi', '-e', p], { input: m[2] }).status === 0
          )
      )
      .map(m => m[1])
    expect(unenforced).toEqual([])
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
