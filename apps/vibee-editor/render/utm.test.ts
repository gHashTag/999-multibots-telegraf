import { describe, expect, it } from 'vitest'
import { CHANNELS, isOwnUrl, tagValue, tagged } from './src/agent/utm'

/**
 * THE TAGGER (epic #2974). Each case is a way a tag could lie or do harm:
 * tagging somebody else's link, hiding the tag behind a hash route where no
 * analytics reads it, or overwriting a tag somebody chose by hand.
 */
describe('tagging our own links', () => {
  it('puts the query before the hash, so the route still opens and the tag is read', () => {
    const t = tagged('https://t27.ai/#/blog/s', 'x', {
      campaign: 'blog',
      content: 's',
    })
    expect(t).toBe(
      'https://t27.ai/?utm_source=x&utm_medium=social&utm_campaign=blog&utm_content=s#/blog/s'
    )
  })

  it("never tags somebody else's link", () => {
    for (const u of [
      'https://github.com/gHashTag/x',
      'https://evil.t27.ai.example.com/',
      'not a url',
    ])
      expect(tagged(u, 'x')).toBe(u)
    expect(isOwnUrl('https://app.t27.ai/agents')).toBe(true)
  })

  it('never overwrites a tag already there', () => {
    const t = new URL(tagged('https://app.t27.ai/?utm_source=manual', 'reddit'))
    expect(t.searchParams.get('utm_source')).toBe('manual')
    expect(t.searchParams.get('utm_medium')).toBe('social')
  })

  it('every channel has a medium, and the messenger is not "social"', () => {
    for (const [c, m] of Object.entries(CHANNELS))
      expect(m, c).toMatch(/^[a-z]+$/)
    expect(CHANNELS.telegram).toBe('messenger')
  })

  it('a tag value is lowercase and safe, and an empty one is left out', () => {
    expect(tagValue('Ternary Floats, Measured!')).toBe(
      'ternary-floats-measured'
    )
    const t = new URL(tagged('https://t27.ai/', 'x', { campaign: '' }))
    expect(t.searchParams.has('utm_campaign')).toBe(false)
  })
})
