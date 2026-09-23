import { describe, expect, it } from 'vitest'
import {
  MARKETPLACE_AGENTS,
  MARKETPLACE_ECONOMY,
  liveMarketplaceAgentById,
} from '../agent-marketplace'

describe('agent labour market contract', () => {
  it('opens with one real specialist and does not sell trainees as live', () => {
    expect(liveMarketplaceAgentById('blogger')?.name.ru).toBe('Блогер')
    expect(liveMarketplaceAgentById('google')).toBeNull()
    expect(
      MARKETPLACE_AGENTS.filter(agent => agent.status === 'live')
    ).toHaveLength(1)
    expect(new Set(MARKETPLACE_AGENTS.map(agent => agent.id)).size).toBe(
      MARKETPLACE_AGENTS.length
    )
  })

  it('keeps the proposed payout split explicit and conservative until enabled', () => {
    expect(
      MARKETPLACE_ECONOMY.creatorBps +
        MARKETPLACE_ECONOMY.platformBps +
        MARKETPLACE_ECONOMY.qualityReserveBps
    ).toBe(10_000)
    expect(MARKETPLACE_ECONOMY.releaseRule).toBe('accepted_receipt')
    expect(MARKETPLACE_ECONOMY.active).toBe(false)
  })
})
