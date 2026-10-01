import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  AGENT_PACKAGES,
  STAR_PRICE_USD,
  agentPackageById,
  agentPackageOrderUrl,
  agentPackagePayload,
  agentPackageStars,
  parseAgentPackagePayload,
  starsForUsd,
  tryableAgentOf,
} from '../agent-packages'
import { MARKETPLACE_ECONOMY, marketplaceAgentById } from '../agent-marketplace'

describe('agent packages', () => {
  it('sells the three agents at the owner prices', () => {
    expect(
      AGENT_PACKAGES.map(pkg => [pkg.id, pkg.setupUsd, pkg.monthlyUsd])
    ).toEqual([
      ['manager', 100, 15],
      ['blogger', 150, 35],
      ['twin', 200, 50],
    ])
  })

  it('names every package in one pattern: <Role> Agent / Агент-<роль>', () => {
    for (const pkg of AGENT_PACKAGES) {
      expect(pkg.name.en).toMatch(/^[A-Z][a-z]+ Agent$/)
      expect(pkg.name.ru).toMatch(/^Агент-[а-яё]+$/) // cyrillic-ok
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
    // The Twin lives in a bot of the buyer's own.
    expect(agentPackageById('twin')?.bot).toBeUndefined()
    for (const pkg of AGENT_PACKAGES)
      if (pkg.bot) expect(pkg.bot).toMatch(/^[A-Za-z][A-Za-z0-9_]{3,30}bot$/i)
  })

  it('charges Stars computed from the dollar prices at one rate', () => {
    expect(AGENT_PACKAGES.map(pkg => [pkg.id, agentPackageStars(pkg)])).toEqual(
      [
        ['manager', { setup: 6250, month: 938 }],
        ['blogger', { setup: 9375, month: 2188 }],
        ['twin', { setup: 12500, month: 3125 }],
      ]
    )
    // Rounded up, never below the dollar price; float noise is not a Star.
    expect(starsForUsd(100)).toBe(6250)
    expect(starsForUsd(0.01)).toBe(1)
  })

  it('fits Telegram limits: a month under the subscription ceiling, a launch under the one-off one', () => {
    // render/src/agent/token-packs.ts: 10 000 per subscription period,
    // 100 000 per one-off invoice (measured against the Bot API).
    for (const pkg of AGENT_PACKAGES) {
      const { setup, month } = agentPackageStars(pkg)
      expect(month, pkg.id).toBeLessThanOrEqual(10_000)
      expect(setup, pkg.id).toBeLessThanOrEqual(100_000)
      expect(month, pkg.id).toBeGreaterThan(0)
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
