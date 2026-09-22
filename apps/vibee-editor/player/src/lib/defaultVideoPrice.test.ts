import { describe, it, expect } from 'vitest'
import { defaultVideoPrice, ценаНажатия, type Баланс } from './balance' // cyrillic-ok: existing exports

/**
 * THE VIDEO BUTTON NAMES THE CLIP THE PERSON PICKED.
 *
 * The server prices a default-leg clip (no Kie model) by its length, 72
 * tokens for 5 s and 144 for 10 s at today's provider price, and sends that
 * table as `defaultVideoPrices`. The button used to read one number for
 * "video" -- right for one chip, half the bill for the other.
 *
 * The numbers are the server's (render billing-shared.ts), not invented here.
 */
const server = {
  balance: 100,
  prices: { video_generate: 72, image_generate: 2 },
  modelPrices: { 'kie/hailuo/02-text-to-video-pro': 114 },
  defaultVideoPrices: { '5': 72, '10': 144 },
} as Баланс // cyrillic-ok: existing type name

const pressPrice = ценаНажатия // cyrillic-ok: existing export

describe('the default video clip is priced by its length', () => {
  it('each chip names its own clip', () => {
    expect(pressPrice(server, 'video_generate', 'veo3-fast', '5s')).toBe(72)
    expect(pressPrice(server, 'video_generate', 'veo3-fast', '10s')).toBe(144)
  })

  it('a Kie model keeps its own price, whatever the chip says', () => {
    const kie = 'kie/hailuo/02-text-to-video-pro'
    expect(pressPrice(server, 'video_generate', kie, '10s')).toBe(114)
    expect(defaultVideoPrice(server, 'video_generate', kie, '10s')).toBeNull()
  })

  it('only video, and only with a chip, reads the table', () => {
    expect(defaultVideoPrice(server, 'image_generate', undefined, '10s')).toBe(
      null
    )
    expect(
      defaultVideoPrice(server, 'video_generate', 'veo3-fast', undefined)
    ).toBe(null)
    expect(pressPrice(server, 'image_generate', undefined, '10s')).toBe(2)
  })

  it('an older server without the table falls back to the one video price', () => {
    const old = { ...server, defaultVideoPrices: undefined }
    expect(pressPrice(old, 'video_generate', 'veo3-fast', '10s')).toBe(72)
  })
})
