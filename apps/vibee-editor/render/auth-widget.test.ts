import crypto from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { verifyTelegramLoginWidget } from './auth'

const TOKEN = '777777:widget-secret-used-only-in-tests'
const NOW = 1_900_000_000

function signed(overrides: Record<string, unknown> = {}) {
  const payload: Record<string, unknown> = {
    id: 4242,
    first_name: 'Owner',
    username: 't27_dev',
    auth_date: NOW,
    ...overrides,
  }
  const check = Object.entries(payload)
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('\n')
  const secret = crypto.createHash('sha256').update(TOKEN).digest()
  payload.hash = crypto.createHmac('sha256', secret).update(check).digest('hex')
  return payload
}

describe('Telegram Login Widget server verification', () => {
  beforeEach(() => {
    process.env.BOT_TOKEN_12 = TOKEN
  })

  it('accepts a fresh payload signed by the production login bot', () => {
    expect(verifyTelegramLoginWidget(signed(), NOW)).toMatchObject({
      ok: true,
      telegramId: '4242',
      user: { id: 4242, username: 't27_dev' },
    })
  })

  it('rejects a changed identity even when the old hash is kept', () => {
    const payload = signed()
    payload.id = 9999
    expect(verifyTelegramLoginWidget(payload, NOW)).toMatchObject({
      ok: false,
      reason: 'widget signature mismatch',
    })
  })

  it('rejects stale and future authorizations', () => {
    expect(
      verifyTelegramLoginWidget(signed({ auth_date: NOW - 86_401 }), NOW)
    ).toMatchObject({ ok: false, reason: 'widget authorization is expired' })
    expect(
      verifyTelegramLoginWidget(signed({ auth_date: NOW + 301 }), NOW)
    ).toMatchObject({ ok: false, reason: 'widget authorization is expired' })
  })

  it('does not accept a signature from a different configured bot slot', () => {
    process.env.TELEGRAM_BOT_TOKEN = TOKEN
    process.env.BOT_TOKEN_12 = '888888:the-real-login-slot-is-different'
    expect(verifyTelegramLoginWidget(signed(), NOW)).toMatchObject({
      ok: false,
      reason: 'widget signature mismatch',
    })
  })
})
