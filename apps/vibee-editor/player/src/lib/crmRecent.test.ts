import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RECENT_MAX, recentContactIds, rememberContact } from './crmRecent'

/**
 * The recently opened contacts: newest first, each once, at most six, and a
 * broken store is an empty row rather than a crashed contacts screen.
 */

beforeEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('rememberContact', () => {
  it('puts the latest first and keeps each person once', () => {
    rememberContact('1')
    rememberContact('2')
    rememberContact('1')
    expect(recentContactIds()).toEqual(['1', '2'])
  })

  it(`keeps at most ${RECENT_MAX}`, () => {
    for (let i = 1; i <= RECENT_MAX + 3; i++) rememberContact(String(i))
    const ids = recentContactIds()
    expect(ids).toHaveLength(RECENT_MAX)
    expect(ids[0]).toBe(String(RECENT_MAX + 3))
  })

  it('an empty id is not a contact', () => {
    rememberContact('')
    expect(recentContactIds()).toEqual([])
  })

  it('a store that refuses to write does not throw', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => rememberContact('1')).not.toThrow()
  })
})

describe('recentContactIds', () => {
  it.each(['not json', '{"a":1}', '42'])('reads %j as nothing', raw => {
    window.localStorage.setItem('vibee.crm.recent', raw)
    expect(recentContactIds()).toEqual([])
  })

  it('drops anything that is not an id string', () => {
    window.localStorage.setItem('vibee.crm.recent', '["1", 2, null, "3"]')
    expect(recentContactIds()).toEqual(['1', '3'])
  })
})
