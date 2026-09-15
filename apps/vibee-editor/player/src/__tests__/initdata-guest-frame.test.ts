import { afterEach, describe, expect, it } from 'vitest'
import { getInitData, initDataTrustedIn } from '@/lib/telegram'
import { authHeaders } from '@/lib/apiFetch'

/**
 * A FRAME BY ANOTHER t27.ai PAGE IS A GUEST FOR TELEGRAM LAUNCH DATA TOO.
 *
 * lib/framedSession.ts keeps the Bearer session out of such frames. But
 * telegram-web-app.js restores `__telegram__initParams` from the tab's
 * sessionStorage, and a same-site nested frame (app.t27.ai > t27.ai >
 * app.t27.ai) shares it. authHeaders sends that initData first, so without a
 * guard the guest frame is the Mini App user again.
 *
 * The rule: initData is used only where the session would be trusted (top
 * level, or every ancestor is the app itself or *.telegram.org). Without
 * location.ancestorOrigins (Firefox) only when tgWebAppData is in this
 * document's own launch hash, never when it was restored from storage.
 */

const APP = 'https://app.t27.ai'

function framed(ancestors: string[] | null) {
  return {
    self: 'this frame',
    top: 'the page framing it',
    location: {
      origin: APP,
      ...(ancestors ? { ancestorOrigins: ancestors } : {}),
    },
  }
}

describe('initDataTrustedIn', () => {
  it('top level is trusted, with or without a launch hash', () => {
    const top = {}
    expect(
      initDataTrustedIn({ self: top, top, location: { origin: APP } }, '')
    ).toBe(true)
  })

  it.each([
    [['https://t27.ai'], false],
    [['https://app.t27.ai', 'https://t27.ai'], false],
    [['https://t27.ai', 'https://app.t27.ai'], false],
    [['https://evil.example'], false],
    [['https://telegram.org.evil.example'], false],
    [['https://web.telegram.org'], true],
    [[APP], true],
    [[APP, 'https://web.telegram.org'], true],
  ])('framed by %j: %s', (ancestors, trusted) => {
    // A launch hash does not rescue a frame whose ancestors are known.
    expect(initDataTrustedIn(framed(ancestors), '#tgWebAppData=fake')).toBe(
      trusted
    )
  })

  it.each([
    ['#tgWebAppData=fake-init&tgWebAppVersion=8.0', true],
    ['#tgWebAppVersion=8.0&tgWebAppData=fake-init', true],
    ['', false],
    ['#tgWebAppVersion=8.0', false],
    ['#xtgWebAppData=fake', false],
    // telegram-web-app.js takes everything before the first '?' as a path, so
    // the key below is not in the hash for it, and it restores the stored
    // signed value. None of these may count as launch data in the hash.
    ['#tgWebAppData=?x', false],
    ['#tgWebAppData=?', false],
    ['#a&tgWebAppData=?b', false],
    ['#tgWebAppData=fake?x', false],
    ['#tgWebAppData', false],
    ['#tgWebAppData=', false],
    // Parameters after the '?' are read by the script.
    ['#/feed?tgWebAppData=fake-init&tgWebAppVersion=8.0', true],
  ])('no ancestorOrigins (Firefox), launch hash %j: %s', (hash, trusted) => {
    expect(initDataTrustedIn(framed(null), hash)).toBe(trusted)
  })
})

describe('getInitData and authHeaders in this document', () => {
  const realTop = Object.getOwnPropertyDescriptor(window, 'top')

  afterEach(() => {
    delete (window as { Telegram?: unknown }).Telegram
    if (realTop) Object.defineProperty(window, 'top', realTop)
    delete (window.location as { ancestorOrigins?: unknown }).ancestorOrigins
  })

  function launchData(initData: string) {
    ;(window as { Telegram?: unknown }).Telegram = { WebApp: { initData } }
  }

  function frameBy(ancestors: string[]) {
    Object.defineProperty(window, 'top', {
      configurable: true,
      get: () => ({ not: 'this window' }),
    })
    Object.defineProperty(window.location, 'ancestorOrigins', {
      configurable: true,
      value: ancestors,
    })
  }

  it('control: top level, the launch data is sent', () => {
    launchData('fake-init-1')
    expect(getInitData()).toBe('fake-init-1')
    expect(authHeaders().get('X-Telegram-Init-Data')).toBe('fake-init-1')
  })

  it('framed by https://t27.ai, restored launch data is not sent', () => {
    launchData('fake-init-1')
    frameBy(['https://t27.ai'])
    expect(window.self === window.top).toBe(false)
    expect(getInitData()).toBe('')
    expect(authHeaders().get('X-Telegram-Init-Data')).toBeNull()
  })

  it('control: framed by Telegram Web, the launch data is sent', () => {
    launchData('fake-init-1')
    frameBy(['https://web.telegram.org'])
    expect(getInitData()).toBe('fake-init-1')
    expect(authHeaders().get('X-Telegram-Init-Data')).toBe('fake-init-1')
  })
})
