import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

const range = vi.fn()
vi.mock('@/core/supabase/client', () => {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order']) chain[m] = vi.fn(() => chain)
  chain.range = (...a: unknown[]) => range(...a)
  return { supabase: { from: vi.fn(() => chain) } }
})

import { getSpendingBreakdown } from '@/core/supabase/getSpendingBreakdown'
import { UserService } from '@/utils/serviceMapping'

/**
 * THE BREAKDOWN READS THE WHOLE LEDGER AND THE APP'S OWN LABELS.
 *
 * Two defects this pins, both measured on the live ledger 2026-09-09:
 *  - PostgREST returns at most 1000 rows per request; the old fallback read one
 *    page and summed a truncated ledger (the owner has 3163 expense rows).
 *  - service_type is rewritten by a database trigger ('other' for AI
 *    Photoshop); the description "Payment for service: <mode>" is the field
 *    that survives, and the grouping must follow it.
 */
const page = (
  n: number,
  service_type: string,
  description: string,
  stars: number
) => Array.from({ length: n }, () => ({ service_type, description, stars }))

beforeEach(() => range.mockReset())

describe('getSpendingBreakdown', () => {
  it('asks for the next page after a full one and groups by the resolved service', async () => {
    range
      .mockResolvedValueOnce({
        data: page(1000, 'other', 'Payment for service: ai_photoshop_scene', 1),
        error: null,
      })
      .mockResolvedValueOnce({
        data: page(3, 'text_to_image', 'Payment operation', 2),
        error: null,
      })

    const result = await getSpendingBreakdown('144022504')

    expect(range).toHaveBeenCalledTimes(2)
    expect(range).toHaveBeenNthCalledWith(1, 0, 999)
    expect(range).toHaveBeenNthCalledWith(2, 1000, 1999)
    expect(result).toEqual([
      [UserService.AiPhotoshop, { count: 1000, stars: 1000 }],
      [UserService.TextToImage, { count: 3, stars: 6 }],
    ])
  })

  it('stops after a short page', async () => {
    range.mockResolvedValueOnce({
      data: page(2, 'neuro_photo', 'Payment for generating 1 image', 7.5),
      error: null,
    })
    const result = await getSpendingBreakdown('1')
    expect(range).toHaveBeenCalledTimes(1)
    expect(result).toEqual([[UserService.NeuroPhoto, { count: 2, stars: 15 }]])
  })

  it('returns null, not an empty breakdown, when the ledger cannot be read', async () => {
    range.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    expect(await getSpendingBreakdown('1')).toBeNull()
  })
})
