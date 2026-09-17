/**
 * THE VALUE THE BOT SENDS HAS TO ARRIVE SOMEWHERE THE APP LOOKS.
 *
 * Every other link of this chain was already tested (pair-deep-link.test.tsx):
 * the bot sends 'pair', the map turns it into `/profile?tab=agent`, the
 * redirect keeps the query, the profile opens that tab. The first link was
 * not: whether the arriving value can be READ at all.
 *
 * It could not. `initDataUnsafe.start_param` is filled by Telegram only for a
 * direct-link or attachment-menu launch, while every door the bot opens is a
 * `web_app` button carrying `?tgWebAppStartParam=…` in its URL. So the field
 * the app read was undefined on exactly the path the bot advertises, the map
 * matched nothing, and the person landed on the feed -- the screen that looks
 * like everything worked.
 *
 * Production, 2026-09-18: 17 pairing codes ever minted, all 17 for one
 * telegram_id (the owner, who taps the tab by hand). Two people onboarded on
 * 16-17 September and sent to `/app` produced no row at all.
 *
 * Each test re-imports the modules, because the parameter is snapshotted at
 * module load -- the router drops the query string moments later, and that
 * snapshot is the whole point.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { STORAGE_KEYS } from '@vibee/atoms'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** Where TelegramProvider tried to send the person. */
const navigations: { to: string; opts?: unknown }[] = []

vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<Record<string, unknown>>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => (to: string, opts?: unknown) => {
      navigations.push({ to, opts })
    },
  }
})

// The viewport/safe-area wiring is a different subject and would need a
// complete WebApp fake to run.
vi.mock('@/hooks/useTelegramWebApp', () => ({
  useTelegramWebApp: () => undefined,
}))

/**
 * A launch the way the bot actually produces one.
 *
 * `platform` is what `isTelegram()` keys on; `initDataUnsafe` is EMPTY on
 * purpose -- Telegram signs nothing for a keyboard button, so this is the
 * shape the advertised path really has.
 */
function telegramLaunch(url: string, startParam?: string) {
  window.history.replaceState({}, '', url)
  ;(window as unknown as { Telegram?: unknown }).Telegram = {
    WebApp: {
      platform: 'ios',
      initData: '',
      initDataUnsafe: startParam ? { start_param: startParam } : {},
    },
  }
}

async function freshModules() {
  vi.resetModules()
  const telegram = await import('@/lib/telegram')
  const provider = await import('@/components/Telegram/TelegramProvider')
  const memory = await import('@/components/Navigation/RouteMemory')
  return { telegram, provider, memory }
}

describe('the start parameter of a bot launch', () => {
  let host: HTMLDivElement
  let root: Root | null = null

  beforeEach(() => {
    navigations.length = 0
    host = document.createElement('div')
    document.body.appendChild(host)
  })

  afterEach(() => {
    act(() => root?.unmount())
    root = null
    host.remove()
    delete (window as unknown as { Telegram?: unknown }).Telegram
    window.history.replaceState({}, '', '/')
  })

  it('is read from the query string the bot builds', async () => {
    telegramLaunch('/?tgWebAppStartParam=pair')
    const { telegram } = await freshModules()
    expect(telegram.launchStartParam()).toBe('pair')
  })

  it('is read from the launch fragment as well', async () => {
    // Telegram appends its launch data as a #fragment and the docs do not say
    // which half of the URL carries the parameter.
    telegramLaunch('/#tgWebAppData=x&tgWebAppStartParam=pair')
    const { telegram } = await freshModules()
    expect(telegram.launchStartParam()).toBe('pair')
  })

  it("survives the router's rewrite of the launch address", async () => {
    telegramLaunch('/?tgWebAppStartParam=pair')
    const { telegram } = await freshModules()

    // This is what <Navigate> does a tick after mount: the query is gone.
    window.history.replaceState({}, '', '/feed')
    expect(window.location.search).toBe('')

    expect(telegram.launchStartParam()).toBe('pair')
  })

  it("prefers Telegram's own field when Telegram filled it", async () => {
    // A direct link (`t.me/bot/app?startapp=feed`) fills start_param for real.
    telegramLaunch('/?tgWebAppStartParam=pair', 'feed')
    const { telegram } = await freshModules()
    expect(telegram.launchStartParam()).toBe('feed')
  })

  it('is absent on an ordinary visit, so nothing hijacks the address', async () => {
    window.history.replaceState({}, '', '/feed')
    const { telegram } = await freshModules()
    expect(telegram.launchStartParam()).toBeNull()
  })

  it('opens the screen that holds the sign-in code, end to end', async () => {
    /*
     * The journey `/app` advertises: bot button -> mini app -> the card with
     * the code. Driven through the real provider and the real route map, so
     * breaking any link of it fails here.
     *
     * The address below is a literal on purpose — this test owns the WIRING
     * (parameter read from the launch URL, matched, navigated to, replacing
     * history), not the choice of screen. Whether that screen actually shows a
     * code is followed through to the component in
     * components/Telegram/__tests__/startParamContract.test.ts; it moved from
     * /profile to /profile?tab=agent to /pair, and each move was a fix.
     */
    telegramLaunch('/?tgWebAppStartParam=pair')
    const { provider } = await freshModules()

    root = createRoot(host)
    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={['/']}>
          <provider.TelegramProvider />
        </MemoryRouter>
      )
    })

    expect(navigations.map(n => n.to)).toEqual(['/pair'])
    expect(navigations[0].opts).toEqual({ replace: true })
  })

  it('sends nobody anywhere on a parameter the map does not know', async () => {
    // An unknown value must stay a no-op: the map is the allowlist, which is
    // what makes reading the parameter from the URL harmless.
    telegramLaunch('/?tgWebAppStartParam=%2Fetc%2Fpasswd')
    const { provider } = await freshModules()

    root = createRoot(host)
    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={['/']}>
          <provider.TelegramProvider />
        </MemoryRouter>
      )
    })

    expect(navigations).toEqual([])
  })

  it('lets a named screen outrank the remembered one', async () => {
    /*
     * LaunchRedirect restores the screen the person was interrupted on. A
     * parameter naming a screen has to win, or the pairing code would lose to
     * whatever was open last time -- and reading the dead field meant the
     * parameter always lost.
     */
    window.localStorage.setItem(STORAGE_KEYS.lastRoute, '/chat')
    telegramLaunch('/?tgWebAppStartParam=pair')
    const { memory } = await freshModules()

    let landedOn = ''
    root = createRoot(host)
    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={['/']}>
          <memory.LaunchRedirect />
          <WhereAmI report={p => (landedOn = p)} />
        </MemoryRouter>
      )
    })

    // The feed, not /chat: TelegramProvider takes it from here to the profile.
    expect(landedOn).toBe('/feed')
    window.localStorage.removeItem(STORAGE_KEYS.lastRoute)
  })
})

/** Reports the address the router actually settled on. Renders nothing. */
function WhereAmI({ report }: { report: (path: string) => void }) {
  const l = useLocation()
  report(l.pathname + l.search)
  return null
}
