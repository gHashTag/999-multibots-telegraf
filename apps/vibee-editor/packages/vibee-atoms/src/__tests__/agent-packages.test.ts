import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  AGENT_PACKAGES,
  STAR_PRICE_USD,
  STARS_SUBSCRIPTION_MAX,
  agentPackageById,
  agentPackageCharge,
  agentPackageOrderUrl,
  agentPackagePayload,
  agentPackageStars,
  parseAgentPackagePayload,
  starsForUsd,
  tryableAgentOf,
} from '../agent-packages'
import { MARKETPLACE_ECONOMY, marketplaceAgentById } from '../agent-marketplace'

describe('agent packages', () => {
  it('sells the three agents at the owner monthly prices', () => {
    expect(AGENT_PACKAGES.map(pkg => [pkg.id, pkg.monthlyUsd])).toEqual([
      ['manager', 100],
      ['blogger', 160],
      ['twin', 200],
    ])
    for (const pkg of AGENT_PACKAGES) {
      expect(pkg.allowanceUsd, pkg.id).toBeGreaterThan(0)
      expect(pkg.allowanceUsd, pkg.id).toBeLessThan(pkg.monthlyUsd)
    }
  })

  it('names every package in one pattern: <Role> Agent / <Роль> агент', () => {
    expect(AGENT_PACKAGES.map(pkg => pkg.name.en)).toEqual([
      'Manager Agent',
      'Blogger Agent',
      'Developer Agent',
    ])
    for (const pkg of AGENT_PACKAGES) {
      expect(pkg.name.en).toMatch(/^[A-Z][a-z]+ Agent$/)
      expect(pkg.name.ru).toMatch(/^[А-ЯЁ][а-яё]+ агент$/) // cyrillic-ok
    }
  })

  it('has unique ids and exactly one highlighted package', () => {
    const ids = AGENT_PACKAGES.map(pkg => pkg.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(AGENT_PACKAGES.filter(pkg => pkg.popular)).toHaveLength(1)
  })

  it('points only at agents that exist on the market', () => {
    for (const pkg of AGENT_PACKAGES) {
      if (pkg.agentId) expect(marketplaceAgentById(pkg.agentId)).not.toBeNull()
    }
  })

  it('offers a try only of a live agent', () => {
    for (const pkg of AGENT_PACKAGES) {
      const tryable = tryableAgentOf(pkg)
      if (tryable) {
        expect(marketplaceAgentById(tryable)?.status).toBe('live')
      }
    }
  })

  it('quotes the creator share from the economy, not a copy', () => {
    const twin = agentPackageById('twin')!
    const share = `${MARKETPLACE_ECONOMY.creatorBps / 100}%`
    expect(twin.includes.some(item => item.en.includes(share))).toBe(true)
  })

  it('finds a package by id and refuses anything else', () => {
    expect(agentPackageById(' Blogger ')?.id).toBe('blogger')
    expect(agentPackageById('creator')).toBeNull()
    expect(agentPackageById(undefined)).toBeNull()
  })

  it('orders through the bot with only the id in the payload', () => {
    for (const pkg of AGENT_PACKAGES) {
      const url = new URL(agentPackageOrderUrl(pkg))
      expect(url.host).toBe('t.me')
      const start = url.searchParams.get('start') ?? ''
      // Telegram accepts at most 64 chars of [A-Za-z0-9_-] in a start payload.
      expect(start).toMatch(/^[A-Za-z0-9_-]{1,64}$/)
      expect(start).toBe(`agentpkg_${pkg.id}`)
    }
  })
  it('the Manager Agent is text only; the media packages make reels', () => {
    expect(AGENT_PACKAGES.map(pkg => [pkg.id, pkg.media])).toEqual([
      ['manager', false],
      ['blogger', true],
      ['twin', true],
    ])
  })

  it('binds each farm package to a real bot username', () => {
    expect(agentPackageById('manager')?.bot).toBe('t27ai_bot')
    expect(agentPackageById('blogger')?.bot).toBe('neuro_blogger_bot')
    // The Developer Agent lives in a bot of the buyer's own.
    expect(agentPackageById('twin')?.bot).toBeUndefined()
    for (const pkg of AGENT_PACKAGES)
      if (pkg.bot) expect(pkg.bot).toMatch(/^[A-Za-z][A-Za-z0-9_]{3,30}bot$/i)
  })

  it('charges Stars computed from the dollar prices at one rate', () => {
    expect(AGENT_PACKAGES.map(pkg => [pkg.id, agentPackageStars(pkg)])).toEqual(
      [
        ['manager', 6250],
        ['blogger', 10000],
        ['twin', 12500],
      ]
    )
    // Rounded up, never below the dollar price; float noise is not a Star.
    expect(starsForUsd(100)).toBe(6250)
    expect(starsForUsd(0.01)).toBe(1)
  })

  it('renews by subscription under the Telegram cap, by a monthly one-off invoice above it', () => {
    // render/src/agent/token-packs.ts: 10 000 per subscription period,
    // 100 000 per one-off invoice (measured against the Bot API).
    expect(STARS_SUBSCRIPTION_MAX).toBe(10_000)
    expect(
      AGENT_PACKAGES.map(pkg => [pkg.id, agentPackageCharge(pkg)])
    ).toEqual([
      ['manager', 'month'],
      ['blogger', 'month'],
      ['twin', 'once'],
    ])
    for (const pkg of AGENT_PACKAGES) {
      const stars = agentPackageStars(pkg)
      if (agentPackageCharge(pkg) === 'month')
        expect(stars, pkg.id).toBeLessThanOrEqual(STARS_SUBSCRIPTION_MAX)
      expect(stars, pkg.id).toBeLessThanOrEqual(100_000)
    }
  })

  it('uses the same Star rate the bot prices with', () => {
    const constants = readFileSync(
      join(__dirname, '../../../../../../src/price/constants/index.ts'),
      'utf8'
    )
    const m = /export const STAR_COST_USD = ([\d.]+)/.exec(constants)
    expect(m, 'STAR_COST_USD not found').not.toBeNull()
    expect(Number(m![1])).toBe(STAR_PRICE_USD)
  })

  it('round-trips the invoice payload and refuses anything else', () => {
    expect(
      parseAgentPackagePayload('agentpkg:twin:once:144022504')?.charge
    ).toBe('once')
    const payload = agentPackagePayload('blogger', 'month', '144022504')
    expect(payload).toBe('agentpkg:blogger:month:144022504')
    const parsed = parseAgentPackagePayload(payload)
    expect(parsed?.pkg.id).toBe('blogger')
    expect(parsed?.charge).toBe('month')
    expect(parsed?.telegramId).toBe('144022504')
    for (const bad of [
      'agentpkg:nobody:setup:144022504',
      'agentpkg:twin:year:144022504',
      'agentpkg:twin:setup:12',
      'agentpkg_twin',
      'club:10000:144022504',
      null,
    ])
      expect(parseAgentPackagePayload(bad), String(bad)).toBeNull()
  })
})
