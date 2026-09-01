import { describe, expect, it } from 'vitest'

import { resolveIsOwnProfile } from './useIsOwnProfile'

describe('profile ownership', () => {
  it('trusts the server-owned profile proof before client atoms hydrate', () => {
    expect(
      resolveIsOwnProfile({
        profile: {
          telegram_id: '27',
          is_own_profile: true,
        },
        myProfileTelegramId: null,
        userTelegramId: null,
        hasDevOwnerKey: false,
      })
    ).toBe(true)
  })

  it('does not expose owner navigation without any matching proof', () => {
    expect(
      resolveIsOwnProfile({
        profile: {
          telegram_id: '27',
          is_own_profile: false,
        },
        myProfileTelegramId: null,
        userTelegramId: null,
        hasDevOwnerKey: false,
      })
    ).toBe(false)
  })
})
