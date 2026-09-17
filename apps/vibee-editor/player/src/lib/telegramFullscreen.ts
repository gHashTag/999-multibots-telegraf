/**
 * THE MINI APP TAKES THE WHOLE SCREEN -- AND KNOWS WHAT THAT COSTS AT THE TOP.
 *
 * The owner, 2026-09-17, with a photo of his phone: the app opened as a sheet
 * with rounded corners, the chat showing above it, and Telegram's own header
 * in white over a black interface. "Make the app open on the whole screen."
 *
 * `expand()` was already being called; a sheet at full height is as far as it
 * goes. The whole screen is a different call, `requestFullscreen()` (Bot API
 * 8.0), and it changes the geometry: Telegram's header disappears, the WebView
 * runs under the status bar, and the client floats its own Close and menu
 * buttons over the top of the page. Whatever the app draws at y = 0 is then
 * under the clock. Telegram reports how much room to leave as two numbers --
 * `safeAreaInset.top` for the device and `contentSafeAreaInset.top` for its
 * own buttons -- and the room needed is their SUM.
 *
 * This file only decides and measures. It touches no DOM, so the rules can be
 * checked without a browser: when fullscreen is asked for, how tall the app's
 * own box is, and how far down it starts.
 */

/**
 * Where "fullscreen" means the whole phone screen.
 *
 * Telegram Desktop and macOS implement the same call by making the WINDOW
 * fullscreen, which on a computer is an ambush rather than a courtesy. Web
 * clients answer `fullscreenFailed: UNSUPPORTED`.
 */
const FULLSCREEN_PLATFORMS: ReadonlySet<string> = new Set(['ios', 'android'])

/** Bot API version that introduced fullscreen and the safe-area insets. */
const FULLSCREEN_SINCE = '8.0'

/**
 * The header and background Telegram paints around the WebView: the app's own
 * black (`--bg-primary` in index.css). Without it the client uses its theme
 * colour, which on a light-themed phone is the white bar in the owner's photo.
 * It matters most exactly where fullscreen is NOT available.
 */
export const CHROME_COLOR = '#000000'

type FullscreenCapable = Pick<
  TelegramWebApp,
  'platform' | 'isVersionAtLeast' | 'requestFullscreen' | 'isFullscreen'
>

/**
 * Should this launch ask for the whole screen?
 *
 * Asked once per launch, and not at all when the client is already there:
 * Telegram restores fullscreen by itself for a bot configured that way in
 * BotFather, and a second request answers `ALREADY_FULLSCREEN`.
 */
export function shouldRequestFullscreen(wa: FullscreenCapable | null): boolean {
  if (!wa) return false
  if (!FULLSCREEN_PLATFORMS.has(wa.platform)) return false
  if (typeof wa.requestFullscreen !== 'function') return false
  if (wa.isFullscreen === true) return false
  try {
    return wa.isVersionAtLeast(FULLSCREEN_SINCE)
  } catch {
    return false
  }
}

function px(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : 0
}

export interface AppBox {
  /** Is the client in fullscreen right now -- its word, not our request. */
  fullscreen: boolean
  /** Pixels the app must leave free at the top. Zero outside fullscreen. */
  topInset: number
  /** Live height of the app's own box; absent when Telegram gave no height. */
  vh?: number
  /** Stable height of the app's own box; absent when Telegram gave none. */
  vhStable?: number
}

/**
 * The box the app may draw in.
 *
 * Outside fullscreen Telegram has already inset the WebView, so the box is the
 * viewport and the inset is zero -- adding the reported insets there would
 * leave an empty band under Telegram's header.
 *
 * In fullscreen the viewport is the entire screen, so the box starts below
 * both insets and is that much shorter. The heights are reduced HERE, once,
 * because every full-height layout in the app (chat, script, bottom sheets,
 * the feed) is built on `--app-vh` and `--app-vh-stable`; shortening the
 * source keeps a dozen `calc()`s right instead of patching each of them.
 *
 * A height that is missing stays missing: the CSS default (100dvh) must
 * survive, and `NaNpx` would silently invalidate every calc() built on it.
 */
export function appBox(
  wa: Pick<
    TelegramWebApp,
    | 'isFullscreen'
    | 'safeAreaInset'
    | 'contentSafeAreaInset'
    | 'viewportHeight'
    | 'viewportStableHeight'
  >
): AppBox {
  const fullscreen = wa.isFullscreen === true
  const topInset = fullscreen
    ? px(wa.safeAreaInset?.top) + px(wa.contentSafeAreaInset?.top)
    : 0
  const box: AppBox = { fullscreen, topInset }
  if (Number.isFinite(wa.viewportHeight)) {
    box.vh = Math.max(0, wa.viewportHeight - topInset)
  }
  if (Number.isFinite(wa.viewportStableHeight)) {
    box.vhStable = Math.max(0, wa.viewportStableHeight - topInset)
  }
  return box
}

/**
 * The CSS variables that describe the box, as `name -> value`.
 *
 * Only what is known is listed. A variable that is absent here is NOT written,
 * so the stylesheet's default (100dvh) stays in force: measured 2026-09-08, a
 * single `undefinedpx` collapsed the script page to 427px and grew its sheet
 * to 931px, taller than the screen. The hook writes exactly these pairs and
 * nothing else into --app-vh*, which is what lets this rule be checked on
 * values instead of on the spelling of the hook.
 */
export function viewportVars(
  wa: Parameters<typeof appBox>[0]
): Record<string, string> {
  const box = appBox(wa)
  const vars: Record<string, string> = {
    '--app-top-inset': `${box.topInset}px`,
  }
  if (box.vh !== undefined) vars['--app-vh'] = `${box.vh}px`
  if (box.vhStable !== undefined) vars['--app-vh-stable'] = `${box.vhStable}px`
  return vars
}
