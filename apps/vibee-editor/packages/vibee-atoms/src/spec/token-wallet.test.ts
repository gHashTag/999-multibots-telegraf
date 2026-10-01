import { describe, expect, it } from 'vitest'
import * as spec from './token-wallet.gen'
import {
  daysLeft,
  MARKUP,
  monthTokens,
  portraitsIn,
  priceTokens,
  reelsIn,
  TOKEN_USD,
} from '../token-wallet'
import { AGENT_PACKAGES } from '../agent-packages'
import * as reel from '../../../../render/src/spec/crm-story-reel.gen'
import * as gift from '../../../../render/src/spec/crm-lead-magnet.gen'

// The vectors of specs/automation/token-wallet.t27, run against the host.
describe('token-wallet.t27 against the host', () => {
  it('every dollar of a package month becomes tokens at the one rate', () => {
    expect(monthTokens(15)).toBe(3000)
    expect(monthTokens(35)).toBe(7000)
    expect(monthTokens(50)).toBe(10000)
    expect(spec.SETUP_INCLUDES_MONTH).toBe(true)
  })

  it('an operation is sold at twice its cost, rounded up', () => {
    expect(spec.MARKUP_PCT).toBe(200)
    expect(priceTokens(30000)).toBe(12)
    expect(priceTokens(20000)).toBe(8)
    expect(priceTokens(1)).toBe(1)
  })

  it('a month burns on day thirty and nothing held before it burns', () => {
    expect(daysLeft(0, 0, spec.MONTH_DAYS)).toBe(30)
    expect(daysLeft(0, 23, spec.MONTH_DAYS)).toBe(7)
    expect(daysLeft(0, 30, spec.MONTH_DAYS)).toBe(0)
    expect(spec.TOPUP_DAYS).toBe(spec.MONTH_DAYS)
    expect(spec.SPEND_ORDER).toBe('soonest-burn-first')
    expect(spec.BURNS_BACKDATED).toBe(false)
  })

  it('the warnings come at seven, three and one day left', () => {
    expect(spec.WARN_DAYS_FIRST).toBeGreaterThan(spec.WARN_DAYS_SECOND)
    expect(spec.WARN_DAYS_SECOND).toBeGreaterThan(spec.WARN_DAYS_LAST)
    expect(spec.WARN_DAYS_FIRST).toBeLessThan(spec.MONTH_DAYS)
  })

  it('the start gift buys one portrait and no reel', () => {
    expect(portraitsIn(spec.START_TOKENS)).toBe(1)
    expect(reelsIn(spec.START_TOKENS)).toBe(0)
  })

  it('a Blogger month is twenty-five reels', () => {
    expect(reelsIn(monthTokens(35))).toBe(25)
    expect(reelsIn(monthTokens(15))).toBe(11)
    expect(reelsIn(monthTokens(50))).toBe(37)
    expect(portraitsIn(monthTokens(35))).toBe(583)
  })
})

describe('the wallet agrees with the specs it prices', () => {
  it('a reel and a portrait cost what their own specs say', () => {
    expect(spec.REEL_TOKENS).toBe(reel.PRICE_ESTIMATE_TOKENS)
    expect(spec.PORTRAIT_TOKENS).toBe(gift.OP_TOKENS)
  })

  it('the lead magnet prices at the same rate and markup', () => {
    expect(spec.TOKEN_MICRO_USD).toBe(gift.TOKEN_MICRO_USD)
    expect(spec.MARKUP_PCT).toBe(gift.MARKUP_PCT)
  })

  it('reads as half a cent a token and a markup of two', () => {
    expect(TOKEN_USD).toBe(0.005)
    expect(MARKUP).toBe(2)
  })

  it('every media package month is whole reels, never zero', () => {
    for (const pkg of AGENT_PACKAGES.filter(p => p.media))
      expect(reelsIn(monthTokens(pkg.monthlyUsd))).toBeGreaterThan(0)
  })
})
