import { describe, it, expect } from 'vitest'
import { appLinkFor } from './appLink'

describe('appLinkFor (player)', () => {
  it('builds the two-tap link that works for a bot without a Main Mini App', () => {
    expect(appLinkFor('t27ai_bot', 'profile')).toBe(
      'https://t.me/t27ai_bot?start=app_profile'
    )
    expect(appLinkFor('@example_farm_bot', 'hive')).toBe(
      'https://t.me/example_farm_bot?start=app_hive'
    )
  })

  it('never ?startapp= -- it drops the route for a bot without a Main Mini App', () => {
    expect(appLinkFor('t27ai_bot', 'profile')).not.toContain('startapp')
  })

  it('refuses something that is not a bot username', () => {
    expect(appLinkFor('', 'feed')).toBe('')
    expect(appLinkFor('evil.example/?x', 'feed')).toBe('')
  })
})

describe('screens no link may name', () => {
  it('builds no link to pair: the screen mints a sign-in code on mount', () => {
    expect(appLinkFor('example_farm_bot', 'pair')).toBe('')
  })
})
