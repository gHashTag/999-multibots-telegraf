import { describe, it, expect } from 'vitest'
import { isBrowserPath, keepMounted, KEEP_BROWSER_MS } from './keptBrowser'

describe('the browser tab stays open while the person looks elsewhere', () => {
  it('is mounted on the tab', () => {
    expect(keepMounted(true, null, 0)).toBe(true)
  })

  it('is not built before the person ever opens it', () => {
    expect(keepMounted(false, null, 0)).toBe(false)
  })

  it('STAYS for a look at the feed and back', () => {
    expect(keepMounted(false, 1000, 1000 + KEEP_BROWSER_MS - 1)).toBe(true)
  })

  it('LETS GO after a while, not to stream to nobody', () => {
    expect(keepMounted(false, 1000, 1000 + KEEP_BROWSER_MS)).toBe(false)
  })

  it('knows its own address, and only its own', () => {
    expect(isBrowserPath('/browser')).toBe(true)
    expect(isBrowserPath('/browser/anything')).toBe(true)
    expect(isBrowserPath('/browserx')).toBe(false)
    expect(isBrowserPath('/feed')).toBe(false)
  })
})
