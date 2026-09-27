import { describe, it, expect } from 'vitest'
import { PROFILES, profileOf, strategyKeyOf, allSites } from './profiles'
import { siteOf } from './strategies'

describe('every agent has a desk of its own', () => {
  it('each profile is named, explained, and has its own accounts', () => {
    expect(PROFILES.length).toBeGreaterThan(1)
    for (const p of PROFILES) {
      expect(p.name.trim()).not.toBe('')
      expect(p.about.trim()).not.toBe('')
      expect(p.sites.length).toBeGreaterThan(0)
      /* A desk holds only addresses the strategy rules would accept. */
      for (const s of p.sites) expect(siteOf(s)).toEqual(s)
    }
  })

  it('ids are unique, because a row of settings is keyed by one', () => {
    const ids = PROFILES.map(p => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('work and content do not share a single account', () => {
    /* A round for work must not drag the person through TikTok, and a round
       for content must not open their job invitations. */
    const work = new Set(
      (profileOf('work')?.sites ?? []).map(s => new URL(s.url).host)
    )
    const content = (profileOf('content')?.sites ?? []).map(
      s => new URL(s.url).host
    )
    for (const host of content) expect(work.has(host)).toBe(false)
  })

  it('a profile reads and writes its own row, and "all" keeps the old one', () => {
    expect(strategyKeyOf('work')).toBe('rounds:work')
    expect(strategyKeyOf('WORK')).toBe('rounds:work')
    expect(strategyKeyOf('all')).toBe('rounds')
    expect(strategyKeyOf('')).toBe('rounds')
  })

  it('an unknown profile is nobody s desk', () => {
    expect(profileOf('nope')).toBeNull()
    expect(profileOf(42)).toBeNull()
  })

  it('all the desks together are every account, each once', () => {
    const urls = allSites().map(s => s.url)
    expect(new Set(urls).size).toBe(urls.length)
    expect(urls).toContain('https://hh.ru/applicant/negotiations')
    /* Reddit is the reddit desk's now, and it walks the feed it can answer. */
    expect(urls).toContain('https://www.reddit.com/r/t27ai/new/')
  })
})
