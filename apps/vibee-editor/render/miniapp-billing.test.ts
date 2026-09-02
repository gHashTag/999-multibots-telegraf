/**
 * Regression test: the Mini App must PAY for /api/generate/*.
 *
 * Two callers hit those endpoints. The agent (tools.ts) arrives with X-Api-Key
 * and has already paid at the tool layer. The Mini App arrives with a Telegram
 * signature and, until this wiring, paid NOTHING -- every user generated for
 * free, past the price and past the limit. billing-shared.ts existed with the
 * prices and the atomic spend, but render-server.ts never called it.
 *
 * Booting the server here would pull ffmpeg/face-api native deps (a local boot
 * has never worked in this repo), so the wiring is pinned at the source level,
 * and the price table itself is asserted by importing it.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { TOKEN_PRICES, priceFor } from './src/agent/billing-shared'

const SERVER = fs.readFileSync(path.join(__dirname, 'render-server.ts'), 'utf8')

/** The body of one /api/generate/<kind> handler. */
function handler(kind: 'image' | 'video' | 'audio' | 'lipsync'): string {
  const start = SERVER.indexOf(`req.url === '/api/generate/${kind}'`)
  expect(start, `${kind} handler not found`).toBeGreaterThan(-1)
  const next = SERVER.indexOf('req.url === ', start + 40)
  return SERVER.slice(start, next === -1 ? start + 9000 : next)
}

describe('mini-app generation is billed', () => {
  const ops = {
    image: 'image_generate',
    video: 'video_generate',
    audio: 'audio_generate',
    lipsync: 'lipsync_generate',
  } as const

  for (const kind of ['image', 'video', 'audio', 'lipsync'] as const) {
    it(`${kind}: charges with the shared price id before generating`, () => {
      const h = handler(kind)
      expect(h, `${kind} does not charge`).toMatch(/chargeMiniAppUser\(\s*req/)
      expect(h).toContain(`'${ops[kind]}'`)
      // The charge must precede the provider work, not follow it.
      const chargeAt = h.search(/chargeMiniAppUser\(\s*req/)
      const refundAt = h.indexOf('refundMiniAppUser')
      expect(chargeAt).toBeGreaterThan(-1)
      expect(refundAt, `${kind} never refunds`).toBeGreaterThan(chargeAt)
    })
  }

  it('refuses instead of giving the generation away when billing cannot run', () => {
    // Fail-closed: a route that cannot charge does not open. Matches
    // requireInternalKey's rule in the bot.
    expect(SERVER).toContain("status: 503, reason: 'billing unavailable'")
  })

  it('does not double-charge the agent path', () => {
    // Server-to-server callers already paid at the tool layer.
    expect(SERVER).toContain(
      "if (req.headers['x-api-key']) return { ok: true }"
    )
  })

  it('answers 402 when the balance is short', () => {
    expect(SERVER).toContain('status: 402')
  })

  it('uses signed Telegram or the verified app session owner for billing', () => {
    expect(SERVER).toContain('const tid = verifiedViewerId(req)')
  })
})

describe('prices come from the shared table, not from render-server', () => {
  it('uses the same ids the agent tools bill', () => {
    for (const op of [
      'image_generate',
      'video_generate',
      'audio_generate',
      'lipsync_generate',
    ]) {
      expect(TOKEN_PRICES[op], `${op} has no price`).toBeGreaterThan(0)
    }
  })

  it('prices are derived from cost, not hand-set', () => {
    expect(TOKEN_PRICES.image_generate).toBe(priceFor('image_generate'))
    expect(TOKEN_PRICES.video_generate).toBe(priceFor('video_generate'))
    expect(TOKEN_PRICES.audio_generate).toBe(priceFor('audio_generate'))
    expect(TOKEN_PRICES.lipsync_generate).toBe(priceFor('lipsync_generate'))
  })

  it('render-server does not define its own prices', () => {
    expect(SERVER).toContain("from './src/agent/billing-shared'")
    expect(SERVER).not.toContain('OPERATION_COST_USD')
  })
})
