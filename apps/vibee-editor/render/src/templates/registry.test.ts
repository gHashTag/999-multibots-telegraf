import { describe, expect, it } from 'vitest'
import { TEMPLATE_CARDS } from './registry'

describe('template media origin', () => {
  it('uses the stable self-hosted media proxy for every bundled example', () => {
    const urls = TEMPLATE_CARDS.flatMap(card => [
      card.poster,
      card.sample,
    ]).filter((value): value is string => Boolean(value))

    expect(urls.length).toBeGreaterThan(0)
    expect(urls.every(url => url.startsWith('/media/images/relaunch/'))).toBe(
      true
    )
    expect(urls.some(url => /supabase/i.test(url))).toBe(false)
  })
})
