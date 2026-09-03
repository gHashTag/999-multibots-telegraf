import crypto from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadOrCreateOwnProfile } from './verifiedProfile'

const TOKEN = '111111:t27-test-token'
const original = {
  TELEGRAM_AUTH_ENV: process.env.TELEGRAM_AUTH_ENV,
  BOT_TOKEN_12: process.env.BOT_TOKEN_12,
}

const signedRequest = (id: number, url = '/api/users/me?telegram_id=999') => {
  const params = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({
      id,
      first_name: 'Ada',
      last_name: 'Owner',
      username: 'ada',
    }),
  }
  const check = Object.entries(params)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
  const secret = crypto
    .createHmac('sha256', 'WebAppData')
    .update(TOKEN)
    .digest()
  const hash = crypto.createHmac('sha256', secret).update(check).digest('hex')
  const initData = new URLSearchParams({ ...params, hash }).toString()
  return {
    url,
    method: 'POST',
    headers: { 'x-telegram-init-data': initData },
  } as unknown as import('node:http').IncomingMessage
}

beforeEach(() => {
  process.env.TELEGRAM_AUTH_ENV = 'production'
  process.env.BOT_TOKEN_12 = TOKEN
})

afterAll(() => {
  if (original.TELEGRAM_AUTH_ENV === undefined)
    delete process.env.TELEGRAM_AUTH_ENV
  else process.env.TELEGRAM_AUTH_ENV = original.TELEGRAM_AUTH_ENV
  if (original.BOT_TOKEN_12 === undefined) delete process.env.BOT_TOKEN_12
  else process.env.BOT_TOKEN_12 = original.BOT_TOKEN_12
})

describe('verified profile session', () => {
  it('upserts the profile for the signed owner and ignores spoofed ids', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: '7',
            telegram_id: '123',
            username: 'ada',
            display_name: 'Ada Owner',
            social_links: [],
            is_public: true,
          },
        ],
      })

    const result = await loadOrCreateOwnProfile(signedRequest(123), { query })

    expect(query).toHaveBeenNthCalledWith(2, expect.any(String), [
      '123',
      'ada',
      'Ada Owner',
    ])
    expect(query).toHaveBeenNthCalledWith(3, expect.any(String), [
      '123',
      'ada',
      'Ada Owner',
    ])
    expect(query).toHaveBeenNthCalledWith(4, expect.any(String), [
      '123',
      'ada',
      'Ada Owner',
      null,
    ])
    expect(result).toMatchObject({
      ok: true,
      status: 200,
      profile: { telegram_id: '123', is_own_profile: true },
    })
  })

  it('does not insert a duplicate users row after a successful owner update', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'existing-user' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: '7',
            telegram_id: '123',
            username: 'ada',
            display_name: 'Ada Owner',
          },
        ],
      })

    await loadOrCreateOwnProfile(signedRequest(123), { query })

    expect(query).toHaveBeenCalledTimes(3)
    expect(query.mock.calls[1]?.[0]).toContain('UPDATE users')
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO users')
      )
    ).toBe(false)
  })

  it('does not touch the database without valid signed initData', async () => {
    const query = vi.fn()
    const request = {
      url: '/api/users/me?telegram_id=123',
      method: 'POST',
      headers: {},
    } as unknown as import('node:http').IncomingMessage

    expect(await loadOrCreateOwnProfile(request, { query })).toEqual({
      ok: false,
      status: 401,
    })
    expect(query).not.toHaveBeenCalled()
  })
})
