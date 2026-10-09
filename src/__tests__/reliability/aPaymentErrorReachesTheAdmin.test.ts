import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * A PAYMENT ERROR REACHES THE ADMIN CHANNEL (2026-10-08).
 *
 * The Inngest payment and training handlers report failures with
 * `errorMessageAdmin(null, error)`. A null ctx used to mean `console.error`
 * and a return, and the address that did exist was a hard-coded stale chat --
 * so a failed payment was announced to no admin at all. Owner: "all errors and
 * informational messages for admins go to the working chat".
 *
 * Behavioural: the real helpers, with only the network and the environment
 * stubbed, so the assertion is about what would actually be sent and where.
 */

vi.mock('@/config', () => ({ isDev: false }))
vi.mock('@/utils/logger', () => {
  const l = { warn: vi.fn(), error: vi.fn(), info: vi.fn() }
  return { logger: l, default: l }
})

import { sendToAdminChat } from '@/helpers/error/sendToAdminChat'
import { errorMessageAdmin } from '@/helpers/error/errorMessageAdmin'

const ORIGINAL_ENV = process.env
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  process.env = {
    ...ORIGINAL_ENV,
    ADMIN_CHAT_ID: 't27_ai',
    BOT_TOKEN_1: '123:TEST',
  }
  fetchMock = vi
    .fn()
    .mockResolvedValue({ ok: true, status: 200, text: async () => '' })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  process.env = ORIGINAL_ENV
  vi.unstubAllGlobals()
})

const sentBody = () => JSON.parse(fetchMock.mock.calls[0][1].body)

describe('sendToAdminChat', () => {
  it('posts to the resolved admin channel and reports delivery', async () => {
    expect(await sendToAdminChat('hello')).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/sendMessage$/)
    // A bare username gains its '@' through the one resolver.
    expect(sentBody().chat_id).toBe('@t27_ai')
  })

  it('a refused send is not reported as delivered', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'Bad Request: chat not found',
    })
    expect(await sendToAdminChat('x')).toBe(false)
  })

  it('with no admin channel configured it sends nothing', async () => {
    delete process.env.ADMIN_CHAT_ID
    expect(await sendToAdminChat('x')).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('never throws when the network fails', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))
    await expect(sendToAdminChat('x')).resolves.toBe(false)
  })
})

describe('errorMessageAdmin', () => {
  it('a null ctx -- the Inngest payment path -- still reaches the admin channel', async () => {
    errorMessageAdmin(null, new Error('payment exploded'))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(sentBody().chat_id).toBe('@t27_ai')
    expect(sentBody().text).toContain('payment exploded')
  })

  it('with a ctx it uses that bot, addressed to the configured channel', () => {
    const sendMessage = vi.fn().mockResolvedValue({})
    errorMessageAdmin({ telegram: { sendMessage } } as any, new Error('boom'))
    expect(sendMessage).toHaveBeenCalledWith(
      '@t27_ai',
      expect.stringContaining('boom')
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
