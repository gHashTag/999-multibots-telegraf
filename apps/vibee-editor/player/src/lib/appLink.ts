/**
 * EVERY LINK TO OUR APP OPENS INSIDE TELEGRAM -- the player's copy.
 *
 * Owner, 2026-09-22: outside Telegram the app does not open, so a link to it
 * must be a Telegram link. The original, with the full reasoning, is the
 * bot's src/navigation/helpers/appLinks.ts; the render has a mirror in
 * apps/vibee-editor/render/src/app-links.ts. The bot's appLinksParity test
 * reads all three from source, together with START_PARAM_ROUTES in
 * components/Telegram/TelegramProvider.tsx, and fails when they drift.
 *
 * The player cannot ask getMe (that needs the bot's token), so it always
 * builds the two-tap link: `t.me/<bot>?start=app_<route>` opens the bot's
 * chat and /start answers with one web_app button to that screen. It works
 * for every bot today and keeps working once a Main Mini App is set.
 * `t.me/<bot>?startapp=` does NOT: for a bot without a Main Mini App
 * (measured 2026-09-22: all of ours) it opens the chat and drops the route.
 */

/** Mirror of APP_ROUTES in src/navigation/helpers/appLinks.ts. */
export const APP_ROUTES = [
  'feed',
  'search',
  'learn',
  'editor',
  'create',
  'avatar',
  'video',
  'image',
  'audio',
  'profile',
  'hive',
  'chat',
  'browser',
  'club',
  'pair',
  'story',
] as const

export type AppRoute = (typeof APP_ROUTES)[number]

/**
 * Mirror of UNLINKABLE_APP_ROUTES in src/navigation/helpers/appLinks.ts:
 * screens no link may name. `pair` shows a sign-in code it mints on mount, so
 * a link to it hands a credential to whoever follows the link; the bot refuses
 * such a payload on /start, and no copy of this table may build one.
 */
export const UNLINKABLE_APP_ROUTES: readonly string[] = ['pair']

export const APP_START_PREFIX = 'app_'

export function appLinkFor(botUsername: string, route: AppRoute): string {
  const bot = String(botUsername ?? '')
    .trim()
    .replace(/^@/, '')
  if (!/^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(bot)) return ''
  if (UNLINKABLE_APP_ROUTES.includes(route)) return ''
  return `https://t.me/${bot}?start=${APP_START_PREFIX}${route}`
}
