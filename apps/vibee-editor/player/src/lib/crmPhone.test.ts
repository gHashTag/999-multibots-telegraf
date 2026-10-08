import { describe, expect, it } from 'vitest'
import { CRM_PHONE_QUERY, autoLine, lineStops } from './crmPhone'

/**
 * WHEN THE AUTO SWITCH IS ONE LINE (P31, v2 P33). The whole table, because
 * each row is a promise: a phone makes a read switch one line, off or on,
 * and only the switch that is on carries a button there -- the stop.
 */
describe('the AUTO line (crm-first-screen v2)', () => {
  it('is one line on a phone once read, off or on', () => {
    expect(autoLine(true, true)).toBe(true)
    // Unread: it says so at full size.
    expect(autoLine(true, false)).toBe(false)
    // A wide screen has the room.
    expect(autoLine(false, true)).toBe(false)
  })

  it('carries the stop when on, and nothing when off', () => {
    expect(lineStops(true)).toBe(true)
    expect(lineStops(false)).toBe(false)
  })

  it('a phone is the page width Crm.css lays its rows out for', () => {
    expect(CRM_PHONE_QUERY).toBe('(max-width: 480px)')
  })
})
