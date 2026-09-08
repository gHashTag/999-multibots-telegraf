import { describe, it, expect, vi, afterEach } from 'vitest'
import { LIFETIME_MS } from './src/agent/tg-proposals'

/**
 * A CARD MUST OUTLIVE THE MOMENT IT WAS MADE.
 *
 * The proposal queue held an unconfirmed draft for TEN MINUTES. That is a
 * deadline on a person looking at their phone, and it is not buying any
 * security: authorisation is the 128-bit secret minted per proposal, which no
 * window makes harder to guess.
 *
 * Meanwhile the sweep that produces the cards runs every thirty minutes by
 * default (CRM_PROACTIVE_MINUTES, src/index.ts:1012). So the card was usually
 * gone before the next one existed, and an owner who looked after lunch
 * pressed Send and was told the draft "was already confirmed or expired" --
 * a wording kept deliberately ambiguous for a prober's benefit, so it did not
 * even say which.
 *
 * Measured in production 2026-09-09: five invoices ever minted, none paid, and
 * not one card ever sent to anybody.
 */
describe('the proposal lifetime', () => {
  const HOUR = 60 * 60 * 1000

  it('outlives the sweep that produces the cards, with margin', () => {
    // The sweep's own default is 30 minutes. A card that dies inside one
    // sweep interval can never be waiting when the owner next looks.
    const SWEEP_MS = 30 * 60 * 1000
    expect(LIFETIME_MS).toBeGreaterThan(SWEEP_MS * 2)
    expect(LIFETIME_MS).toBeGreaterThanOrEqual(HOUR)
  })

  it('is not so long that a sales draft goes out stale', () => {
    // A draft names a person and a price. Two days later it is not a draft,
    // it is an artefact.
    expect(LIFETIME_MS).toBeLessThanOrEqual(48 * HOUR)
  })
})

/**
 * The env override, and the reason it is checked with Number.isFinite rather
 * than truthiness: a typo would make the lifetime NaN, every comparison
 * against it false, and NOTHING WOULD EVER EXPIRE -- the queue would fill to
 * its ceiling and start refusing new drafts, which reads as "the seller
 * stopped working" and not as "somebody mistyped a variable".
 */
describe('the env override', () => {
  const saved = process.env.PROPOSAL_LIFETIME_MINUTES
  afterEach(() => {
    if (saved === undefined) delete process.env.PROPOSAL_LIFETIME_MINUTES
    else process.env.PROPOSAL_LIFETIME_MINUTES = saved
    vi.resetModules()
  })

  const freshLifetime = async () => {
    vi.resetModules()
    return (await import('./src/agent/tg-proposals')).LIFETIME_MS
  }

  it('a number is honoured', async () => {
    process.env.PROPOSAL_LIFETIME_MINUTES = '90'
    expect(await freshLifetime()).toBe(90 * 60 * 1000)
  })

  it('a typo falls back to the default instead of becoming NaN', async () => {
    process.env.PROPOSAL_LIFETIME_MINUTES = 'полчаса'
    const ms = await freshLifetime()
    expect(Number.isFinite(ms)).toBe(true)
    expect(ms).toBeGreaterThanOrEqual(60 * 60 * 1000)
  })

  it('zero and negatives fall back too — a card that expires on arrival is not a setting', async () => {
    process.env.PROPOSAL_LIFETIME_MINUTES = '0'
    expect(await freshLifetime()).toBeGreaterThanOrEqual(60 * 60 * 1000)
    process.env.PROPOSAL_LIFETIME_MINUTES = '-5'
    expect(await freshLifetime()).toBeGreaterThanOrEqual(60 * 60 * 1000)
  })
})
