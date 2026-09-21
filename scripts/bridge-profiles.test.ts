/**
 * THE BRIDGE SAYS WHAT A PROFILE LACKS FOR REAL WORK.
 *
 * `tri bridge` used to ask each side's agent a question and stop there. An
 * answering agent says nothing about whether that side can sell: a person who
 * never connected their Telegram is not a seller (the daily sweep skips them),
 * and an empty live wallet refuses every generation. These pin the rule that
 * turns a side's profile into the list of presses that make it ready.
 *
 * Ids are invented (9000000xx).
 */
import { describe, expect, it } from 'vitest'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { profileGaps } = require('./bridge.cjs')

const ME = { role: 'owner', профиль: { first_name: 'P' } } // cyrillic-ok: the tool's own field name
const WALLET = (n: unknown) => ({ баланс_токенов: n }) // cyrillic-ok: the tool's own field name
const SELLERS = new Set(['900000011'])

describe('a side that is ready for real work', () => {
  it('has no gaps', () => {
    const r = profileGaps({
      id: '900000011',
      me: ME,
      wallet: WALLET(5),
      sellers: SELLERS,
    })
    expect(r.gaps).toEqual([])
    expect(r.seller).toBe(true)
    expect(r.balance).toBe(5)
  })
})

describe('each gap is named with the press that closes it', () => {
  it('a person who never connected Telegram is not a seller', () => {
    const r = profileGaps({
      id: '900000012',
      me: ME,
      wallet: WALLET(5),
      sellers: SELLERS,
    })
    expect(r.seller).toBe(false)
    expect(r.gaps.join(' ')).toMatch(
      /not a seller.*Connect Telegram.*themselves/
    )
  })

  it('an empty live wallet is a gap, and crediting is the owner"s decision', () => {
    const r = profileGaps({
      id: '900000011',
      me: ME,
      wallet: WALLET(0),
      sellers: SELLERS,
    })
    expect(r.gaps.join(' ')).toMatch(/wallet empty.*owner decides/)
  })

  it('an unreadable wallet is a gap, not a zero', () => {
    for (const wallet of [null, WALLET(undefined), WALLET('7617')]) {
      const r = profileGaps({
        id: '900000011',
        me: ME,
        wallet,
        sellers: SELLERS,
      })
      expect(r.gaps).toContain('live wallet unreadable')
      expect(Number.isFinite(r.balance)).toBe(false)
    }
  })

  it('a person the render does not know is told to sign in once', () => {
    const r = profileGaps({
      id: '900000011',
      me: null,
      wallet: WALLET(5),
      sellers: SELLERS,
    })
    expect(r.gaps.join(' ')).toMatch(/unknown to the render/)
  })

  it('an unreadable seller list says "unknown", never "not a seller"', () => {
    const r = profileGaps({
      id: '900000012',
      me: ME,
      wallet: WALLET(5),
      sellers: null,
    })
    expect(r.seller).toBeNull()
    expect(r.gaps.join(' ')).not.toMatch(/not a seller/)
  })
})
