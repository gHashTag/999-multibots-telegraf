/**
 * GET /api/agents/packages: the catalogue, public, and the same as the one
 * catalogue in vibee-atoms (the bot cannot import it, so this test does).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import express from 'express'
import agentPackagesRouter from '@/api_server/routes/agent-packages.routes'
import { requireInternalKey } from '@/api_server/middleware/requireInternalKey'
import { logger } from '@/utils/logger'
import {
  AGENT_SUBSCRIPTION,
  STARS_SUBSCRIPTION_MAX,
  agentPackageCatalogue,
} from '@/services/agentPackageCatalogue'
import { STAR_COST_USD } from '@/price/constants'
import * as atoms from '../../../apps/vibee-editor/packages/vibee-atoms/src/agent-packages'

describe('the bot mirror of the agent packages', () => {
  it('is the vibee-atoms catalogue: ids, titles, Stars, dollars, order links', () => {
    expect(
      agentPackageCatalogue().map(p => ({
        id: p.id,
        title: p.title,
        stars: p.stars,
        usd: p.usd,
        orderUrl: p.orderUrl,
        periodSeconds: p.periodSeconds,
        chargeKind: p.chargeKind,
      }))
    ).toEqual(
      atoms.AGENT_PACKAGES.map(p => ({
        id: p.id,
        title: { en: p.name.en, ru: p.name.ru },
        stars: atoms.agentPackageStars(p),
        usd: atoms.agentPackageUsd(p),
        orderUrl: atoms.agentPackageOrderUrl(p),
        periodSeconds: atoms.AGENT_SUBSCRIPTION.periodSeconds,
        chargeKind: atoms.agentPackageCharge(p),
      }))
    )
    expect(STARS_SUBSCRIPTION_MAX).toBe(atoms.STARS_SUBSCRIPTION_MAX)
    expect(AGENT_SUBSCRIPTION).toEqual(atoms.AGENT_SUBSCRIPTION)
    expect(STAR_COST_USD).toBe(atoms.STAR_PRICE_USD)
  })

  it('one price: 10000 Stars a month, $160 derived', () => {
    for (const p of agentPackageCatalogue()) {
      expect(p.stars).toBe(10_000)
      expect(p.usd).toBe(160)
      expect(p.chargeKind).toBe('month')
    }
    expect(agentPackageCatalogue().map(p => p.id)).toContain('tridev')
  })
})

describe('GET /api/agents/packages', () => {
  let server: Server | null = null
  afterEach(async () => {
    await new Promise<void>(r => (server ? server.close(() => r()) : r()))
    server = null
  })

  it('answers without any key, with CORS *, and carries no secret', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => logger)
    vi.spyOn(logger, 'warn').mockImplementation(() => logger)
    // The production order: the public router, then the keyed mounts that
    // answer every other /api/* without a key with an error.
    const app = express()
    app.use('/api', agentPackagesRouter)
    app.use('/api', requireInternalKey as any, express.Router())
    await new Promise<void>(r => {
      server = app.listen(0, '127.0.0.1', () => r())
    })
    const { port } = server!.address() as AddressInfo
    const res = await fetch(`http://127.0.0.1:${port}/api/agents/packages`)
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    const body = (await res.json()) as { packages: unknown[] }
    expect(body).toEqual({ packages: agentPackageCatalogue() })
    expect(JSON.stringify(body)).not.toMatch(/token|secret|key/i)
    const pre = await fetch(`http://127.0.0.1:${port}/api/agents/packages`, {
      method: 'OPTIONS',
    })
    expect(pre.status).toBe(204)
    expect(pre.headers.get('access-control-allow-origin')).toBe('*')
    // Control: the guard behind it is live, so the 200 above is the mount
    // order and not a missing guard.
    const keyed = await fetch(`http://127.0.0.1:${port}/api/billing`)
    expect(keyed.status).toBeGreaterThanOrEqual(400)
    vi.restoreAllMocks()
  })
})
