import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * A missing credential can be papered over two ways, and only one of them is
 * survivable.
 *
 *   process.env.KEY || ''            stays falsy -- `if (!key)` still catches it
 *   process.env.KEY || 'dummy-token' passes EVERY falsy check downstream
 *
 * The repo had two of the second kind. inngestClient.ts ended its key chain
 * with 'local-dev-key', so a missing key produced a client that looked
 * configured and sent events with a key the service rejects -- while its twin
 * in client.ts has always ended the same chain with undefined and throws
 * before sending. Two opposite decisions about one failure, one file apart.
 *
 * imageToPromptWizard was worse. It did not merely default a value, it WROTE
 * one:
 *
 *   process.env.HUGGINGFACE_TOKEN = process.env.HUGGINGFACE_TOKEN || 'dummy-token'
 *
 * at module load -- the only module-level process.env write in src. That is a
 * process-wide mutation: every other module, for the rest of the process, saw
 * a configured-looking token. It protected nothing (no HuggingFace client
 * library exists here, and the captioning call goes to a public space over
 * plain axios), and the scene is registered, so it ran on every boot.
 *
 * Two rules are pinned, using the census matchers themselves rather than
 * copies of them -- a test with its own copy of the pattern is a twin, and
 * drifting twins are what this sweep keeps turning up.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { matchCode } = require('../../../scripts/lib/blank-code.cjs')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  fallbackPattern,
  categorise,
} = require('../../../scripts/probe-env-fallbacks.cjs')

const ROOT = path.resolve(__dirname, '../../..')

/** Production sources: tests legitimately set up their own environment. */
const productionSources = (): string[] => {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), {
      withFileTypes: true,
    })) {
      const rel = `${dir}/${e.name}`
      if (e.isDirectory()) {
        if (
          e.name !== 'node_modules' &&
          e.name !== '__tests__' &&
          e.name !== 'test'
        )
          walk(rel)
      } else if (e.name.endsWith('.ts')) out.push(rel)
    }
  }
  walk('src')
  return out
}

const EMPTY_LITERALS = new Set(["''", '""', '``'])

/** A module-level assignment to process.env, at column zero. */
const ENV_WRITE = /^process\.env\.([A-Z0-9_]+)\s*=/gm

describe('fake credentials standing in for missing ones', () => {
  it('the census matchers still recognise both shapes', () => {
    // Control. Both rules below are absence checks, and an absence check with
    // a broken matcher reports a clean repo. These samples are the shapes the
    // rules exist to reject.
    const fallback = matchCode(
      "const k = process.env.SOME_API_KEY || 'dummy-token'",
      fallbackPattern()
    )
    expect(fallback.length).toBe(1)
    expect(categorise(fallback[0][1])).toBe('ключ/секрет')
    expect(EMPTY_LITERALS.has(fallback[0][3])).toBe(false)

    // ...and still spare the survivable form and the refusing one.
    const empty = matchCode(
      "const k = process.env.SOME_API_KEY || ''",
      fallbackPattern()
    )
    expect(EMPTY_LITERALS.has(empty[0][3])).toBe(true)
    expect(
      matchCode(
        'const k = process.env.SOME_API_KEY || undefined',
        fallbackPattern()
      ).length
    ).toBe(0)

    expect(matchCode("process.env.SOME_TOKEN = 'x'\n", ENV_WRITE).length).toBe(
      1
    )
  })

  it('no credential falls back to a non-empty literal', () => {
    const files = productionSources()
    expect(files.length, 'file walk must find sources').toBeGreaterThan(300)

    const offenders: string[] = []
    for (const f of files) {
      const raw = fs.readFileSync(path.join(ROOT, f), 'utf8')
      for (const m of matchCode(raw, fallbackPattern())) {
        if (categorise(m[1]) !== 'ключ/секрет') continue
        if (EMPTY_LITERALS.has(m[3])) continue
        offenders.push(`${f}: ${m[1]} = ${m[3]}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('no production module writes to process.env at load time', () => {
    // The stronger rule of the two: a default is local to its expression, a
    // write is global to the process and outlives the module that made it.
    const offenders: string[] = []
    for (const f of productionSources()) {
      const raw = fs.readFileSync(path.join(ROOT, f), 'utf8')
      for (const m of matchCode(raw, ENV_WRITE)) {
        offenders.push(`${f}: ${m[1]}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('the empty-string form is still present, so the rule is not vacuous', () => {
    // Twenty-four credentials still end their chain with ''. That is a
    // separate, milder question and is deliberately NOT changed here. Its
    // presence proves the rule above discriminates rather than matching
    // nothing at all.
    let empties = 0
    for (const f of productionSources()) {
      const raw = fs.readFileSync(path.join(ROOT, f), 'utf8')
      for (const m of matchCode(raw, fallbackPattern())) {
        if (categorise(m[1]) === 'ключ/секрет' && EMPTY_LITERALS.has(m[3]))
          empties++
      }
    }
    expect(empties).toBeGreaterThan(5)
  })
})
