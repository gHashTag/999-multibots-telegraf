/**
 * The one rule in the wiring that can be checked without a pod: WHICH TAB the
 * desk reads in. Everything else there is a browser.
 */
import { describe, it, expect } from 'vitest'
import { choosePage } from './reddit-wiring'

const page = (id: string, url: string) => ({ id, type: 'page', url })

describe('choosePage', () => {
  it('reads in a tab that is already on Reddit, because a fresh tab can be frozen', () => {
    const targets = [
      page('a', 'https://www.tiktok.com/foryou'),
      page('b', 'https://www.reddit.com/r/t27ai/'),
    ]
    expect(choosePage(targets, 'https://www.reddit.com')).toBe('b')
  })

  it('says so when there is none, so the caller opens one and closes it after', () => {
    expect(
      choosePage([page('a', 'https://x.com/home')], 'https://www.reddit.com')
    ).toBe(null)
  })

  it('never picks a worker or a service worker, which have no location to fetch from', () => {
    const targets = [
      { id: 'w', type: 'service_worker', url: 'https://www.reddit.com/sw.js' },
      page('p', 'https://www.reddit.com/'),
    ]
    expect(choosePage(targets, 'https://www.reddit.com')).toBe('p')
  })

  it('does not mistake another site for Reddit', () => {
    const targets = [page('a', 'https://www.reddit.com.evil.example/')]
    expect(choosePage(targets, 'https://www.reddit.com/')).toBe(null)
  })
})
