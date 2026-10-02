import { describe, expect, it } from 'vitest'
import * as SPEC from './social-api.gen'
import {
  liReconnectSoon,
  liUsable,
  verifierOk,
  xFits,
  xRefreshDue,
  xTitleRoom,
  xWeight,
} from '../agent/social-api'

/**
 * SOCIAL API IS WRITTEN IN t27 FIRST (skill t27-spec-first).
 *
 * gHashTag/t27 specs/automation/social-api.t27 is the spec of record. Each `test` of the
 * spec runs here against the HOST (src/agent/social-api.ts), with the spec's inputs.
 *
 * Refresh: node scripts/sync-t27-spec.mjs <t27 checkout> automation/social-api
 */
describe("the spec's tests hold against the host", () => {
  it('the generated module is the spec of record', () => {
    expect(SPEC.ID).toBe('social-api')
  })

  it('a link weighs 23 on X whatever its length', () => {
    expect(xWeight(0, 1)).toBe(23)
    expect(xWeight(100, 1)).toBe(123)
    expect(xWeight(10, 2)).toBe(56)
  })

  it('a post fits X within 280 weighted characters', () => {
    expect(xFits(257, 1)).toBe(true)
    expect(xFits(258, 1)).toBe(false)
    expect(xFits(280, 0)).toBe(true)
    expect(xFits(281, 0)).toBe(false)
  })

  it('a title, a blank line and a link leave 255 for the title', () => {
    expect(xTitleRoom()).toBe(255)
    expect(xFits(xTitleRoom() + SPEC.X_LINK_GAP, 1)).toBe(true)
    expect(xFits(xTitleRoom() + SPEC.X_LINK_GAP + 1, 1)).toBe(false)
  })

  it('an X token is refreshed in its last five minutes', () => {
    expect(xRefreshDue(0)).toBe(true)
    expect(xRefreshDue(299)).toBe(true)
    expect(xRefreshDue(300)).toBe(false)
    expect(xRefreshDue(SPEC.X_TOKEN_S)).toBe(false)
    expect(SPEC.X_REFRESH_ROTATES).toBe(true)
  })

  it('a LinkedIn token lasts sixty days and is never refreshed', () => {
    expect(liUsable(1)).toBe(true)
    expect(liUsable(0)).toBe(false)
    expect(SPEC.LI_TOKEN_DAYS).toBe(60)
    expect(SPEC.LI_REFRESHES).toBe(false)
  })

  it('the owner hears about LinkedIn a week before it ends', () => {
    expect(liReconnectSoon(7)).toBe(true)
    expect(liReconnectSoon(1)).toBe(true)
    expect(liReconnectSoon(8)).toBe(false)
    expect(liReconnectSoon(0)).toBe(false)
    expect(SPEC.LI_WARN_DAYS_LEFT).toBeLessThan(SPEC.LI_TOKEN_DAYS)
  })

  it('a PKCE verifier is 43 to 128 characters', () => {
    expect(verifierOk(43)).toBe(true)
    expect(verifierOk(128)).toBe(true)
    expect(verifierOk(42)).toBe(false)
    expect(verifierOk(129)).toBe(false)
  })

  it('LinkedIn holds far more than X', () => {
    expect(SPEC.X_TEXT_MAX).toBeLessThan(SPEC.LI_TEXT_MAX)
  })

  it('the token never leaves the server and nothing posts without a yes', () => {
    expect(SPEC.TOKEN_LEAVES_SERVER).toBe(false)
    expect(SPEC.ASK_NEEDS_YES).toBe(true)
  })

  it('nothing has been posted through it yet', () => {
    expect(SPEC.RUN_LIVE).toBe(false)
    expect(SPEC.VERSION).toBe(1)
  })
})
