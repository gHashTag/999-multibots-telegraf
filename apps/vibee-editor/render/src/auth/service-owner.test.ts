import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { serviceOwnerFromKey } from './service-owner'

/*
 * THE PROPERTY IS NOW RUN INSTEAD OF READ.
 *
 * This lived inside render-server.ts, where nothing can call it -- importing
 * that file starts the server. So the only guard was a test matching the
 * words createHash('sha256') in the source: red when somebody renames a
 * variable, silent if the digest were dropped for the raw key.
 */
describe('an internal caller gets a namespace, never its own key', () => {
  // DELIBERATELY UNLIKE A KEY. The first version used a string shaped like a
  // real one and the secrets gate stopped the commit -- correctly: it cannot
  // and should not tell an invented key in a test from a live one in a diff.
  const KEY = 'внутренний-вызывающий-для-этой-проверки'

  it('the raw key never appears in the owner', () => {
    const owner = serviceOwnerFromKey(KEY)!
    expect(owner).not.toContain(KEY)
    expect(owner.startsWith('service:')).toBe(true)
  })

  it('it is the sha-256 of the key, so two callers cannot collide', () => {
    // The digest is recomputed here ON PURPOSE: this is the one place where
    // restating the algorithm is the point, because the claim IS the
    // algorithm. Everything else about it is checked behaviourally.
    const expected = createHash('sha256').update(KEY).digest('hex')
    expect(serviceOwnerFromKey(KEY)).toBe(`service:${expected}`)
    expect(serviceOwnerFromKey('other')).not.toBe(serviceOwnerFromKey(KEY))
  })

  it('no key means no owner, not an empty namespace', () => {
    // An empty owner would put every anonymous caller in ONE namespace, which
    // is the opposite of what this exists for.
    expect(serviceOwnerFromKey(undefined)).toBeNull()
    expect(serviceOwnerFromKey('')).toBeNull()
    expect(serviceOwnerFromKey('   ')).toBeNull()
  })

  it('a repeated header takes the first value, as node presents it', () => {
    expect(serviceOwnerFromKey([KEY, 'second'])).toBe(serviceOwnerFromKey(KEY))
    expect(serviceOwnerFromKey([])).toBeNull()
  })
})
