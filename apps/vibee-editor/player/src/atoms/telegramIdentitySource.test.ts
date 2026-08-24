// @vitest-environment node

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const loginSource = readFileSync(
  new URL('../components/Auth/TelegramLoginButton.tsx', import.meta.url),
  'utf8'
)
const profileSource = readFileSync(
  new URL('./profile.ts', import.meta.url),
  'utf8'
)

describe('client Telegram identity boundary', () => {
  it('does not promote or log Login Widget identity', () => {
    expect(loginSource).not.toMatch(
      /TELEGRAM_OWNER_ID|setUser\(|notify\/lead|User logged in|User stored in atom/
    )
    expect(loginSource).toContain('telegramAuthLoginUrl')
  })

  it('loads the active profile only from the server-owned route', () => {
    expect(profileSource).toContain('/api/users/me')
    expect(profileSource).not.toContain('/api/users/sync-from-telegram')
    expect(profileSource).not.toMatch(/user_id=|telegram_id:\s*user\.id/)
  })
})
