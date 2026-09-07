import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  CAPABILITIES,
  check,
  unavailableWarning,
  type Capability,
} from '@/services/capabilityPreflight'

/**
 * The preflight may only claim what the code actually requires.
 *
 * A map of "capability -> the keys it needs" is worth exactly as much as its
 * agreement with the services it describes. A stale row would report a paid
 * service as available while the code throws on a key nobody set -- the very
 * failure the preflight exists to prevent, reproduced one level up.
 */

const REPO = path.resolve(__dirname, '..', '..', '..')
const read = (f: string) => fs.readFileSync(path.join(REPO, f), 'utf8')
const keysOf = (c: Capability) => [...(c.needs ?? []), ...(c.anyOf ?? [])]
const paidKeys = (list: Capability[]): string[] => [
  ...new Set(list.flatMap(keysOf)),
]

describe('the preflight describes the code it claims to describe', () => {
  it('has capabilities to describe at all', () => {
    // Every check below filters this list, and an empty list satisfies all of
    // them. A map that lost its rows would report a healthy bot with nothing
    // in it.
    expect(
      CAPABILITIES.length,
      'the capability map is empty -- the preflight would report nothing'
    ).toBeGreaterThan(5)
    expect(
      CAPABILITIES.filter(c => c.paid).length,
      'no PAID capability is described, and those are the ones that cost a sale'
    ).toBeGreaterThan(3)
  })

  it('points every row at a file that exists', () => {
    const gone = CAPABILITIES.flatMap(c =>
      [c.file, c.keysIn]
        .filter((f): f is string => Boolean(f))
        .filter(f => !fs.existsSync(path.join(REPO, f)))
        .map(f => `${c.name} -> ${f}`)
    )
    expect(
      gone,
      'a capability names a file that is not in the repository'
    ).toEqual([])
  })

  it('names only keys the file really reads', () => {
    // The direction that matters. An invented key would make the preflight
    // demand something nothing uses; a key that MOVED would leave a paid
    // service reported as ready.
    const stray: string[] = []
    for (const c of CAPABILITIES) {
      const src = read(c.keysIn ?? c.file)
      for (const k of keysOf(c))
        if (!src.includes(k)) stray.push(`${c.file}: ${k}`)
    }
    expect(
      stray,
      'the preflight names a variable this file never reads:\n' +
        stray.join('\n')
    ).toEqual([])
  })

  it('does not find a key that is not there', () => {
    // Negative control for the check above: a substring test that always
    // matched would pass the whole file and prove nothing.
    const c = CAPABILITIES[0]
    expect(read(c.keysIn ?? c.file).includes('DEFINITELY_NOT_A_REAL_KEY')).toBe(
      false
    )
  })

  it('reports a missing key, and stops reporting it once set', () => {
    // The verdict itself, both directions, on a row that needs exactly one
    // variable -- so the result cannot come from anywhere else.
    const one = CAPABILITIES.find(c => (c.needs ?? []).length === 1 && !c.anyOf)
    expect(one, 'no single-key capability to test with').toBeTruthy()
    const key = one!.needs![0]
    const before = process.env[key]
    try {
      delete process.env[key]
      const without = check(one!)
      expect(without.available, `${key} unset must read as unavailable`).toBe(
        false
      )
      expect(without.missing).toContain(key)

      process.env[key] = 'x' // secret-guard-ok: literal test placeholder
      const withKey = check(one!)
      expect(withKey.available, `${key} set must read as available`).toBe(true)
      expect(withKey.missing).toEqual([])
    } finally {
      if (before === undefined) delete process.env[key]
      else process.env[key] = before
    }
  })

  it('treats an any-of list as satisfied by one member', () => {
    // The chat fallback tries providers in order, so demanding all of them
    // would report it dead whenever one is absent -- a false alarm on the
    // busiest path in the bot.
    const any = CAPABILITIES.find(c => (c.anyOf ?? []).length > 1)
    expect(any, 'no any-of capability to test with').toBeTruthy()
    const all = any!.anyOf!
    const before = all.map(k => process.env[k])
    try {
      for (const k of all) delete process.env[k]
      expect(check(any!).available, 'none set must be unavailable').toBe(false)
      process.env[all[1]] = 'x' // secret-guard-ok: literal test placeholder
      expect(check(any!).available, 'one member set must be enough').toBe(true)
    } finally {
      all.forEach((k, i) => {
        if (before[i] === undefined) delete process.env[k]
        else process.env[k] = before[i] as string
      })
    }
  })

  it('warns the fallback model off services it cannot perform', () => {
    // The other half of "talks nonsense and makes no assets": with the agent
    // down, a tool-less model is told to help make photos and videos, agrees
    // to do so, and the person waits for a result that never comes.
    const paid = CAPABILITIES.find(
      c => c.paid && (c.needs ?? []).length === 1 && !c.anyOf
    )
    expect(paid, 'no single-key paid capability to test with').toBeTruthy()
    const key = paid!.needs![0]
    const before = process.env[key]
    try {
      delete process.env[key]
      const text = unavailableWarning()
      expect(text, 'a dead paid service must be named to the model').toContain(
        paid!.name
      )
      // Built from strings: the no-cyrillic guard allows Cyrillic only inside
      // string literals, and a regex literal is code.
      expect(text, 'the model must be told not to offer it').toMatch(
        new RegExp('Не предлагай')
      )
      expect(text, 'and not to ask for money for it').toMatch(
        new RegExp('не проси оплату')
      )
    } finally {
      if (before === undefined) delete process.env[key]
      else process.env[key] = before
    }
  })

  it('says nothing when every paid service is available', () => {
    // Negative control. A warning that is always present gets ignored within a
    // day, and would be a lie whenever everything works.
    const keys = paidKeys(CAPABILITIES.filter(c => c.paid))
    const before = keys.map(k => process.env[k])
    try {
      keys.forEach(k => {
        process.env[k] = 'x' // secret-guard-ok: literal test placeholder
      })
      expect(
        unavailableWarning(),
        'with everything set there is nothing to warn about'
      ).toBe('')
    } finally {
      keys.forEach((k, i) => {
        if (before[i] === undefined) delete process.env[k]
        else process.env[k] = before[i] as string
      })
    }
  })
})
