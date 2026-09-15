import type { SessionStore } from './framedSession'

/**
 * THE WAY BACK TO THE GAME AFTER SIGNING IN.
 *
 * The game's sign-in chip on https://t27.ai links to
 * https://app.t27.ai/?return=<the Queen view> (gHashTag/trinity,
 * apps/website/src/lib/triIdentity.ts signInHref). The app used to drop the
 * parameter, so a person who signed in was left on /feed and had to find the
 * way back alone.
 *
 * Only the exact addresses the game produces are accepted, matched whole:
 *
 *     https://t27.ai/#/queen
 *     https://t27.ai/#/queen?tab=<one of QUEEN_VIEWS>
 *     https://t27.ai/#/queen?tab=tri&screen=<one of TRI_SCREEN_IDS>
 *
 * and the URL that is followed is rebuilt from the constants below, never
 * copied from the input. Anything else is ignored: the app's origin must not
 * become an open redirect.
 *
 * Read once, before React mounts (main.tsx), because LaunchRedirect replaces
 * `/?return=...` with `/feed` and drops the query. Only top level on the open
 * web: never in embed, inside Telegram or in any frame. The target is kept for
 * this tab in sessionStorage under a random key that only this document
 * knows, and stripped from the address bar.
 */

export const GAME_ORIGIN = 'https://t27.ai'

/**
 * Copied from gHashTag/trinity apps/website/src/components/queenHud.ts
 * HUD_VIEWS (f49e4fb32a): the names `?tab=` accepts there.
 */
export const QUEEN_VIEWS = [
  'comb',
  'specs',
  'kanban',
  'map',
  'factory',
  'research',
  'skills',
  'crons',
  'agents',
  'functions',
  'tools',
  'project',
  'tri',
] as const

/**
 * Copied from gHashTag/trinity apps/website/src/lib/triScreens.ts TRI_SCREENS
 * (f49e4fb32a): the names `&screen=` accepts on the TRI tab.
 */
export const TRI_SCREEN_IDS = [
  'feed',
  'chat',
  'script',
  'audio',
  'image',
  'avatar',
  'video',
  'editor',
  'profile',
  'crm',
] as const

const SHAPE =
  /^https:\/\/t27\.ai\/#\/queen(?:\?tab=([a-z]{1,16})(?:&screen=([a-z]{1,16}))?)?$/

const KEY_PREFIX = 'trinity.return.'

/** The Queen URL rebuilt from constants, or null for anything else. */
export function returnTargetOf(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 128) return null
  const match = SHAPE.exec(raw)
  if (!match) return null
  const [, tab, screen] = match
  const queen = `${GAME_ORIGIN}/#/queen`
  if (tab === undefined) return queen
  const view = QUEEN_VIEWS.find(known => known === tab)
  if (!view) return null
  if (screen === undefined) return `${queen}?tab=${view}`
  if (view !== 'tri') return null
  const id = TRI_SCREEN_IDS.find(known => known === screen)
  return id ? `${queen}?tab=${view}&screen=${id}` : null
}

export interface ReturnWindow {
  location: { search: string; pathname: string; hash: string }
  history: {
    state: unknown
    replaceState(state: unknown, title: string, url: string): void
  }
  crypto: { getRandomValues<T extends ArrayBufferView>(bytes: T): T }
}

// The key of this document's pending target; nobody else is told it.
let pendingKey: string | null = null

/**
 * Reads `?return=` once. `eligible` is false in embed, inside Telegram and in
 * any frame, and then neither the address nor storage is touched.
 */
export function captureReturnTarget(
  win: ReturnWindow,
  store: SessionStore,
  eligible: boolean
): void {
  const params = new URLSearchParams(win.location.search)
  if (!eligible || !params.has('return')) return
  const target = returnTargetOf(params.get('return'))
  params.delete('return')
  const rest = params.toString()
  win.history.replaceState(
    win.history.state,
    '',
    `${win.location.pathname}${rest ? `?${rest}` : ''}${win.location.hash}`
  )
  if (!target) return
  const bytes = win.crypto.getRandomValues(new Uint8Array(16))
  const key =
    KEY_PREFIX +
    Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  try {
    store.setItem(key, target)
    pendingKey = key
  } catch {
    pendingKey = null
  }
}

export function hasReturnTarget(): boolean {
  return pendingKey !== null
}

/** The pending target, checked again, and forgotten. Null when none. */
export function takeReturnTarget(store: SessionStore): string | null {
  const key = pendingKey
  pendingKey = null
  if (!key) return null
  let raw: string | null = null
  try {
    raw = store.getItem(key)
    store.removeItem(key)
  } catch {
    return null
  }
  return returnTargetOf(raw)
}

/**
 * On arrival: with a live session go back at once; with an expired one try
 * the silent refresh first. 'sign-in' means there is no session and the
 * target stays pending for the widget sign-in (TelegramLoginButton).
 */
export async function returnWhenSignedIn(deps: {
  store: SessionStore
  live: () => boolean
  refresh: () => Promise<unknown>
  assign: (url: string) => void
}): Promise<'returned' | 'sign-in' | 'none'> {
  if (!hasReturnTarget()) return 'none'
  if (!deps.live()) {
    try {
      await deps.refresh()
    } catch {
      return hasReturnTarget() ? 'sign-in' : 'none'
    }
  }
  const url = takeReturnTarget(deps.store)
  if (!url) return 'none'
  deps.assign(url)
  return 'returned'
}
