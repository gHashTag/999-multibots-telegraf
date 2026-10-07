import { describe, expect, it } from 'vitest'
import { CRM_PHONE_QUERY, autoFolds } from './crmPhone'

/**
 * WHEN THE AUTO SWITCH IS ONE LINE (P31). The whole table, because each row
 * is a promise: a phone folds only a switch that is read and off.
 */
describe('autoFolds', () => {
  it('folds only on a phone, only a switch read as off', () => {
    expect(autoFolds(true, true, false)).toBe(true)
    // On: it writes to people by itself, its stop stays in sight.
    expect(autoFolds(true, true, true)).toBe(false)
    // Unread: it says so at full size.
    expect(autoFolds(true, false, false)).toBe(false)
    // A wide screen has the room.
    expect(autoFolds(false, true, false)).toBe(false)
  })

  it('a phone is the page width Crm.css lays its rows out for', () => {
    expect(CRM_PHONE_QUERY).toBe('(max-width: 480px)')
  })
})
