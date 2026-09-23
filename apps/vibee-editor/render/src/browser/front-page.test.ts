import { describe, it, expect, beforeEach } from 'vitest'
import {
  pickFront,
  rememberFront,
  forgetFront,
  chosenFront,
  CHOICE_TTL_MS,
} from './front-page'

const page = (id: string, url = 'https://x.com') => ({ id, type: 'page', url })
const WHO = '900000001'

beforeEach(() => forgetFront(WHO))

describe('the agent acts in the tab it chose', () => {
  it('acts in the chosen tab, not the first of the list', () => {
    const tabs = [page('tiktok'), page('apple')]
    expect(pickFront(tabs, 'apple')?.id).toBe('apple')
    expect(pickFront(tabs, null)?.id).toBe('tiktok')
  })

  it('falls back when the chosen tab was closed', () => {
    expect(pickFront([page('tiktok')], 'apple')?.id).toBe('tiktok')
  })

  it('never picks an extension s own page', () => {
    const tabs = [
      { id: 'ext', type: 'page', url: 'chrome-extension://abc/help.html' },
      page('real'),
    ]
    expect(pickFront(tabs, null)?.id).toBe('real')
    expect(pickFront(tabs, 'ext')?.id).toBe('real')
  })

  it('has nothing to act in when no page is open', () => {
    expect(pickFront([], null)).toBeNull()
  })
})

describe('how long a choice lasts', () => {
  it('holds, and goes stale after half an hour', () => {
    const t = 1_000_000
    rememberFront(WHO, 'apple', t)
    expect(chosenFront(WHO, t + 60_000)).toBe('apple')
    expect(chosenFront(WHO, t + CHOICE_TTL_MS + 1)).toBeNull()
  })

  it('is forgotten when that very tab is closed, and kept otherwise', () => {
    rememberFront(WHO, 'apple', 1)
    forgetFront(WHO, 'other')
    expect(chosenFront(WHO, 2)).toBe('apple')
    forgetFront(WHO, 'apple')
    expect(chosenFront(WHO, 2)).toBeNull()
  })
})
