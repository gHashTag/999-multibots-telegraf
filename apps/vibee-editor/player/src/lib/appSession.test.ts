import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearAppSession,
  exchangeTelegramWidget,
  getAppAccessToken,
  refreshAppSession,
  logoutAppSession,
  logoutAllAppSessions,
} from './appSession'
import { API_BASE } from '../config'
import { authHeaders } from './apiFetch'
import { generationAuthHeaders } from './generateApi'

describe('browser application session', () => {
  afterEach(() => {
    clearAppSession()
    vi.unstubAllGlobals()
  })

  it('stores only server-issued session tokens and authenticates API calls with Bearer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'server-access',
          refresh_token: 'server-refresh',
          expires_in: 600,
          telegram_user: {
            id: 42,
            first_name: 'Owner',
            auth_date: 1,
          },
        }),
      })
    )

    await exchangeTelegramWidget({ id: 42, hash: 'widget-hash' })

    expect(getAppAccessToken()).toBe('server-access')
    expect(authHeaders().get('Authorization')).toBe('Bearer server-access')
    expect(generationAuthHeaders().get('Authorization')).toBe(
      'Bearer server-access'
    )
    expect(authHeaders().get('X-Telegram-Init-Data')).toBeNull()
  })

  it('keeps storage empty when the server rejects the widget payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ detail: 'signature mismatch' }),
      })
    )

    await expect(
      exchangeTelegramWidget({ id: 999, hash: 'forged' })
    ).rejects.toThrow('signature mismatch')
    expect(getAppAccessToken()).toBe('')
  })

  it('rotates the refresh token and replaces the short-lived access token', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'first-access',
          refresh_token: 'first-refresh',
          expires_in: 600,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'second-access',
          refresh_token: 'second-refresh',
          expires_in: 600,
        }),
      })
    vi.stubGlobal('fetch', fetchMock)

    await exchangeTelegramWidget({ id: 42, hash: 'widget-hash' })
    await refreshAppSession()

    expect(getAppAccessToken()).toBe('second-access')
    expect(fetchMock.mock.calls[1]?.[1]?.body).toContain('first-refresh')
  })

  it('clears browser storage before waiting for server revocation', async () => {
    let resolveLogout: (() => void) | undefined
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'server-access',
          refresh_token: 'server-refresh',
          expires_in: 600,
        }),
      })
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveLogout = () => resolve({ ok: true, json: async () => ({}) })
          })
      )
    vi.stubGlobal('fetch', fetchMock)

    await exchangeTelegramWidget({ id: 42, hash: 'widget-hash' })
    const logout = logoutAppSession()

    expect(fetchMock.mock.calls[1]?.[1]?.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer server-access',
    })
    expect(fetchMock.mock.calls[1]?.[1]?.body).toContain('server-refresh')
    expect(getAppAccessToken()).toBe('')
    resolveLogout?.()
    await logout
  })

  it('sign out on all devices clears this tab first, then sends only the Bearer to logout-all', async () => {
    let resolveAll: ((value: unknown) => void) | undefined
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'server-access',
          refresh_token: 'server-refresh',
          expires_in: 600,
        }),
      })
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveAll = resolve
          })
      )
    vi.stubGlobal('fetch', fetchMock)

    await exchangeTelegramWidget({ id: 42, hash: 'widget-hash' })
    const all = logoutAllAppSessions()

    expect(getAppAccessToken()).toBe('')
    expect(sessionStorage.getItem('trinity.app.session.refresh')).toBeNull()
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/auth/logout-all`)
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ Authorization: 'Bearer server-access' })
    expect(JSON.stringify(init)).not.toContain('server-refresh')
    resolveAll?.({ ok: true, status: 200, json: async () => ({}) })
    await expect(all).resolves.toBe(true)
  })

  it('sign out on all devices refused or offline: this tab is still signed out, and the result says false', async () => {
    for (const outcome of [
      () => Promise.resolve({ ok: false, status: 401, json: async () => ({}) }),
      () => Promise.reject(new TypeError('Failed to fetch')),
    ]) {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'server-access',
            refresh_token: 'server-refresh',
            expires_in: 600,
          }),
        })
        .mockImplementationOnce(outcome)
      vi.stubGlobal('fetch', fetchMock)
      await exchangeTelegramWidget({ id: 42, hash: 'widget-hash' })
      await expect(logoutAllAppSessions()).resolves.toBe(false)
      expect(getAppAccessToken()).toBe('')
    }
  })

  it('sign out on all devices without a session calls nothing', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(logoutAllAppSessions()).resolves.toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not let an in-flight refresh restore credentials after logout', async () => {
    let resolveRefresh:
      | ((value: { ok: boolean; json: () => Promise<unknown> }) => void)
      | undefined
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'first-access',
          refresh_token: 'first-refresh',
          expires_in: 600,
        }),
      })
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveRefresh = resolve
          })
      )
      .mockRejectedValueOnce(new Error('logout network unavailable'))
    vi.stubGlobal('fetch', fetchMock)

    await exchangeTelegramWidget({ id: 42, hash: 'widget-hash' })
    const refresh = refreshAppSession()
    await logoutAppSession()
    resolveRefresh?.({
      ok: true,
      json: async () => ({
        access_token: 'synthetic-access', // secret-guard-ok: inert unit-test fixture
        refresh_token: 'synthetic-refresh', // secret-guard-ok: inert unit-test fixture
        expires_in: 600,
      }),
    })

    await expect(refresh).rejects.toThrow(/session changed/)
    expect(getAppAccessToken()).toBe('')
  })
})
