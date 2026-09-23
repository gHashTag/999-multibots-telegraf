/**
 * EVERY LINK TO OUR APP OPENS INSIDE TELEGRAM -- the render's copy.
 *
 * Owner, 2026-09-22: links to the app must open inside Telegram; outside it
 * they do not open, so they do not work. The app knows who is looking only
 * from Telegram's signed launch data, and a plain https link opened in the
 * phone's browser has none.
 *
 * The bot's src/navigation/helpers/appLinks.ts is the original and explains
 * the two links (`?startapp=` for a bot with a Main Mini App, `?start=app_`
 * otherwise). The render cannot import it, so the table below is a MIRROR;
 * src/__tests__/navigation/appLinksParity.test.ts in the bot reads both from
 * source and fails when they drift.
 *
 * What only the render has: it knows a bot by its TOKEN (TELEGRAM_BOT_TOKEN,
 * a channel's token), not by a Telegraf context. So `botOfToken` asks getMe
 * -- through telegramApiFor, the host this bot lives on, never the cloud for
 * a bot on our own Bot API server -- and remembers the username and
 * `has_main_web_app` for a few minutes.
 *
 * Rule and recipe: .claude/skills/links-open-in-telegram/SKILL.md.
 */

import { telegramApiFor } from './telegram-api'

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
] as const

export type AppRoute = (typeof APP_ROUTES)[number]

/**
 * Mirror of UNLINKABLE_APP_ROUTES in src/navigation/helpers/appLinks.ts:
 * screens no link may name. `pair` mints a sign-in code when it mounts, so a
 * link to it is a credential anybody can hand out; the reasoning is written
 * out in the bot's copy.
 */
export const UNLINKABLE_APP_ROUTES: readonly string[] = ['pair']

export function isLinkableRoute(route: unknown): route is AppRoute {
  return isAppRoute(route) && !UNLINKABLE_APP_ROUTES.includes(route)
}

export const APP_HOME_ROUTE: AppRoute = 'feed'

export const APP_START_PREFIX = 'app_'

export const APP_HOSTS: readonly string[] = [
  'app.t27.ai',
  'vibee-editor-production.up.railway.app',
]

export function isAppRoute(value: unknown): value is AppRoute {
  return (
    typeof value === 'string' &&
    (APP_ROUTES as readonly string[]).includes(value)
  )
}

export function botHandle(name: string | null | undefined): string {
  const bare = String(name ?? '')
    .trim()
    .replace(/^@/, '')
    .replace(/^business_/i, '')
  return /^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(bare) ? bare : ''
}

/** The link to a screen, as the bot's appLinkFor builds it. */
export function appLinkFor(
  botUsername: string | null | undefined,
  route: AppRoute = APP_HOME_ROUTE,
  opts: { mainWebApp?: boolean } = {}
): string {
  const bot = botHandle(botUsername)
  if (!bot) return ''
  const r = isAppRoute(route) ? route : APP_HOME_ROUTE
  if (!isLinkableRoute(r)) return ''
  return opts.mainWebApp === true
    ? `https://t.me/${bot}?startapp=${r}`
    : `https://t.me/${bot}?start=${APP_START_PREFIX}${r}`
}

/** The chat with the bot: where a screen that cannot be linked is reached. */
export function botChatLink(botUsername: string | null | undefined): string {
  const bot = botHandle(botUsername)
  return bot ? `https://t.me/${bot}` : ''
}

export function routeOfAppUrl(url: string): AppRoute {
  let u: URL
  try {
    u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`)
  } catch {
    return APP_HOME_ROUTE
  }
  const named = u.searchParams.get('tgWebAppStartParam')
  if (isAppRoute(named)) return named
  const segs = u.pathname.split('/').filter(Boolean)
  if (segs[0] === 'generate' && isAppRoute(segs[1])) return segs[1]
  if (isAppRoute(segs[0])) return segs[0]
  if (segs[0] === 'queen') return 'hive'
  return APP_HOME_ROUTE
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const HOSTS_RE = APP_HOSTS.map(escapeRe).join('|')

/**
 * After the host: ASCII URL characters minus quotes, brackets, angle
 * brackets, `*` and the backtick, so «…», **…**, `…`, an em dash or a Cyrillic
 * word ends the URL instead of being swallowed into its route. Same as the
 * bot's src/navigation/helpers/appLinks.ts.
 */
const APP_URL_BODY = '[\\w\\-.~:/?#@!$&+,;=%]*'

/** Any raw app URL in the text becomes the in-Telegram link of this bot. */
export function rewriteAppUrls(
  text: string,
  botUsername: string | null | undefined,
  opts: { mainWebApp?: boolean } = {}
): string {
  if (!text || !botHandle(botUsername)) return text
  const re = new RegExp(
    `(?<![\\w.@/-])(?:https?:\\/\\/)?(?:${HOSTS_RE})(?![\\w.-])${APP_URL_BODY}`,
    'gi'
  )
  return text.replace(re, raw => {
    const trail = /[.,!?:;…]+$/.exec(raw)?.[0] ?? ''
    const url = trail ? raw.slice(0, -trail.length) : raw
    const route = routeOfAppUrl(url)
    // A screen no link may name becomes the chat with the bot: not the feed
    // (somewhere nobody asked for) and not '' (the words around it survive).
    const link = isLinkableRoute(route)
      ? appLinkFor(botUsername, route, opts)
      : botChatLink(botUsername)
    return link + trail
  })
}

export function hasRawAppUrl(text: string): boolean {
  return new RegExp(
    `(?<![\\w.@/-])(?:https?:\\/\\/)?(?:${HOSTS_RE})(?![\\w.-])`,
    'i'
  ).test(String(text ?? ''))
}

// ── which bot a token is, and whether it has a Main Mini App ─────────────

export interface BotOfToken {
  username: string
  mainWebApp: boolean
}

/** How long a getMe answer is trusted. A failed getMe is never remembered. */
export const BOT_OF_TOKEN_TTL_MS = 10 * 60_000

const known = new Map<string, { bot: BotOfToken; at: number }>()

/**
 * getMe for this token, on the Bot API host this bot lives on. Null when the
 * bot does not answer -- the caller then leaves its text as it was rather than
 * guess a bot.
 */
export async function botOfToken(
  token: string | null | undefined,
  fetchImpl: typeof fetch = fetch,
  now: number = Date.now()
): Promise<BotOfToken | null> {
  const t = String(token ?? '').trim()
  if (!t) return null
  const seen = known.get(t)
  if (seen && now - seen.at < BOT_OF_TOKEN_TTL_MS) return seen.bot
  try {
    const r = await fetchImpl(`${telegramApiFor(t)}/getMe`, {
      signal: AbortSignal.timeout(5_000),
    })
    const d = (await r.json()) as {
      ok?: boolean
      result?: { username?: unknown; has_main_web_app?: unknown }
    }
    const username = d?.ok ? botHandle(String(d.result?.username ?? '')) : ''
    if (!username) return seen?.bot ?? null
    const bot = {
      username,
      mainWebApp: d.result?.has_main_web_app === true,
    }
    known.set(t, { bot, at: now })
    return bot
  } catch {
    return seen?.bot ?? null
  }
}

export function forgetBotsOfTokensForTests(): void {
  known.clear()
}

/** The link to a screen for the bot behind this token; '' when unknown. */
export async function appLinkForToken(
  token: string | null | undefined,
  route: AppRoute,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const bot = await botOfToken(token, fetchImpl)
  return bot ? appLinkFor(bot.username, route, bot) : ''
}

/**
 * The safety net for text the render sends to a person through a bot's
 * token. Never throws, and never asks Telegram when there is nothing to fix.
 */
export async function rewriteAppUrlsForToken(
  text: string,
  token: string | null | undefined,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  if (!hasRawAppUrl(text)) return text
  const bot = await botOfToken(token, fetchImpl)
  return bot ? rewriteAppUrls(text, bot.username, bot) : text
}
