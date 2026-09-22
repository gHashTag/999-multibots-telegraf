/**
 * EVERY LINK TO OUR APP OPENS INSIDE TELEGRAM.
 *
 * Owner, 2026-09-22: "make it a rule that links open inside Telegram --
 * without Telegram they do not open, so they do not work".
 *
 * The app (app.t27.ai, the same bundle as vibee-editor-production on Railway)
 * knows who is looking only from Telegram's signed launch data (initData). A
 * plain https link opened in the phone's browser carries none, so the person
 * meets the "Telegram signature required" wall or an empty screen -- a link
 * that looks alive and leads nowhere.
 *
 * ── THE TWO LINKS, AND WHY THERE ARE TWO ─────────────────────────────────
 *
 *   https://t.me/<bot>?startapp=<route>   one tap, straight into the app.
 *     Works ONLY when the bot has a Main Mini App set in BotFather.
 *     getMe answers `has_main_web_app`; measured 2026-09-22 it is FALSE for
 *     t27ai_bot, neuro_blogger_bot and MetaMuse_Manifest_bot, and for such a
 *     bot this link merely opens the chat -- the route is lost.
 *
 *   https://t.me/<bot>?start=app_<route>  opens the bot chat; /start answers
 *     with ONE message carrying a web_app button to that screen
 *     (`sendAppDoor` below). Two taps, but it works for every bot today.
 *
 * `appLinkFor` picks the first when the bot is known to have a Main Mini App
 * and the second otherwise, so every link opens inside Telegram now and
 * becomes one tap the day BotFather is configured -- with no code change.
 *
 * ── WHERE A web_app BUTTON IS ALLOWED ────────────────────────────────────
 *
 * Only in a private chat with the bot. Groups, channel posts and Telegram
 * Business messages (the bot writing as the owner) reject it, so there the
 * door is a url button to the t.me link above (`appButton`).
 *
 * ── MIRRORS ──────────────────────────────────────────────────────────────
 *
 * The render cannot import this file: apps/vibee-editor/render/src/app-links.ts
 * holds the same table, and the player's apps/vibee-editor/player/src/lib/appLink.ts
 * the same link builder. appLinksParity.test.ts reads all three and the
 * player's START_PARAM_ROUTES from source and fails when they drift.
 *
 * Rule and recipe: .claude/skills/links-open-in-telegram/SKILL.md.
 */
import { Markup } from 'telegraf'
import type { InlineKeyboardButton } from 'telegraf/types'
import { buildMiniAppUrl, MINI_APP_URL } from '../config/miniApp.config'

/**
 * Every screen a link may name. EXACTLY the keys of START_PARAM_ROUTES in
 * apps/vibee-editor/player/src/components/Telegram/TelegramProvider.tsx -- a
 * value the player does not know silently opens the feed.
 */
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

/** The screen a link with no better idea opens: the player's TELEGRAM_HOME. */
export const APP_HOME_ROUTE: AppRoute = 'feed'

/** `/start app_<route>` -- the payload of the two-tap link. */
export const APP_START_PREFIX = 'app_'

/**
 * The hosts that serve the app. Anything the model or a template writes with
 * one of these hosts is a link that only works inside Telegram.
 */
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

/**
 * `@Neuro_Blogger_Bot` and the business-chat alias `business_neuro_blogger_bot`
 * name the same bot; a t.me link needs the bare username. Anything that is not
 * a Telegram username (5-32 of [A-Za-z0-9_]) is refused as empty.
 */
export function botHandle(name: string | null | undefined): string {
  const bare = String(name ?? '')
    .trim()
    .replace(/^@/, '')
    .replace(/^business_/i, '')
  return /^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(bare) ? bare : ''
}

// ── has_main_web_app, per bot ────────────────────────────────────────────

/** How long an answer from getMe is trusted before it is asked again. */
export const MAIN_WEB_APP_TTL_MS = 10 * 60_000

const mainWebApp = new Map<string, { value: boolean; at: number }>()

/** Record what getMe said about this bot. */
export function rememberMainWebApp(
  botUsername: string | null | undefined,
  value: boolean,
  now: number = Date.now()
): void {
  const key = botHandle(botUsername).toLowerCase()
  if (key) mainWebApp.set(key, { value: value === true, at: now })
}

/**
 * The last thing getMe said, or false when nothing is known. False is the
 * safe answer: the two-tap link works for every bot, the one-tap link only
 * for a bot with a Main Mini App.
 */
export function knownMainWebApp(
  botUsername: string | null | undefined
): boolean {
  return mainWebApp.get(botHandle(botUsername).toLowerCase())?.value === true
}

/**
 * Seed the cache from Telegraf's `ctx.botInfo` (itself a getMe made at launch
 * by this bot's own client, so on the bot's own Bot API host).
 */
export function rememberBotInfo(
  info: { username?: string; has_main_web_app?: boolean } | null | undefined
): void {
  if (!info?.username) return
  const key = botHandle(info.username).toLowerCase()
  const seen = mainWebApp.get(key)
  // A fresher answer from refreshMainWebApp outranks the launch-time one.
  if (seen) return
  rememberMainWebApp(info.username, info.has_main_web_app === true)
}

/**
 * Ask getMe again when the cached answer is stale.
 *
 * Takes the bot's OWN `telegram` client, never a token: that client already
 * talks to the Bot API host this bot lives on (src/services/telegramApi.ts).
 * A getMe sent to the cloud for a bot on our own server logs it back in there.
 * Never throws -- a link is not worth an error.
 */
export async function refreshMainWebApp(
  telegram: { getMe: () => Promise<unknown> },
  botUsername?: string | null,
  now: number = Date.now()
): Promise<boolean> {
  const known = mainWebApp.get(botHandle(botUsername).toLowerCase())
  if (known && now - known.at < MAIN_WEB_APP_TTL_MS) return known.value
  try {
    const me = (await telegram.getMe()) as {
      username?: string
      has_main_web_app?: boolean
    }
    if (!me?.username) return false
    rememberMainWebApp(me.username, me.has_main_web_app === true, now)
    return me.has_main_web_app === true
  } catch {
    return known?.value === true
  }
}

export function forgetMainWebAppForTests(): void {
  mainWebApp.clear()
}

// ── the link ─────────────────────────────────────────────────────────────

/**
 * THE link to a screen of our app, for a person to tap.
 *
 * `mainWebApp` overrides the cache (tests, or a caller that has just asked
 * getMe). An unusable bot name gives '' -- the caller must not invent a bot.
 */
export function appLinkFor(
  botUsername: string | null | undefined,
  route: AppRoute = APP_HOME_ROUTE,
  opts: { mainWebApp?: boolean } = {}
): string {
  const bot = botHandle(botUsername)
  if (!bot) return ''
  const r = isAppRoute(route) ? route : APP_HOME_ROUTE
  const oneTap = opts.mainWebApp ?? knownMainWebApp(bot)
  return oneTap
    ? `https://t.me/${bot}?startapp=${r}`
    : `https://t.me/${bot}?start=${APP_START_PREFIX}${r}`
}

/** `app_hive` -> 'hive'; anything else -> null. Attacker-typed: exact match. */
export function appRouteFromStartParam(
  param: string | null | undefined
): AppRoute | null {
  const p = String(param ?? '')
  if (!p.startsWith(APP_START_PREFIX)) return null
  const route = p.slice(APP_START_PREFIX.length)
  return isAppRoute(route) ? route : null
}

/** The host of MINI_APP_URL when an environment points it elsewhere. */
function configuredHost(): string | null {
  try {
    return new URL(MINI_APP_URL).host.toLowerCase()
  } catch {
    return null
  }
}

function appHosts(): string[] {
  const own = configuredHost()
  return own && !APP_HOSTS.includes(own) ? [...APP_HOSTS, own] : [...APP_HOSTS]
}

/**
 * Which screen an app URL points at. `tgWebAppStartParam` wins (that is how
 * every web_app button names its screen); then the first path segment
 * (`/generate/video` -> video); anything else is the home screen.
 */
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
  // The board of the Queen lives inside the hive tab of the app.
  if (segs[0] === 'queen') return 'hive'
  return APP_HOME_ROUTE
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * THE SAFETY NET. Any raw app URL in text that goes to a person becomes the
 * in-Telegram link of the bot this conversation is with.
 *
 * Model text is the one source of links no review catches: the agent may
 * write "open https://app.t27.ai/hive" from memory. Without a bot name the
 * text is returned unchanged -- a link to some other bot is worse.
 */
export function rewriteAppUrls(
  text: string,
  botUsername: string | null | undefined,
  opts: { mainWebApp?: boolean } = {}
): string {
  if (!text || !botHandle(botUsername)) return text
  const hosts = appHosts().map(escapeRe).join('|')
  // Stops at whitespace, quotes, brackets and angle brackets, so a URL inside
  // HTML href="…", Markdown (…) or <…> is replaced and the markup kept.
  const re = new RegExp(
    `(?<![\\w.@/-])(?:https?:\\/\\/)?(?:${hosts})(?![\\w.-])[^\\s"'<>()\\[\\]]*`,
    'gi'
  )
  return text.replace(re, raw => {
    // Sentence punctuation after a URL belongs to the sentence.
    const trail = /[.,!?:;…]+$/.exec(raw)?.[0] ?? ''
    const url = trail ? raw.slice(0, -trail.length) : raw
    return appLinkFor(botUsername, routeOfAppUrl(url), opts) + trail
  })
}

/** True when this text still carries a raw app URL. */
export function hasRawAppUrl(text: string): boolean {
  const hosts = appHosts().map(escapeRe).join('|')
  return new RegExp(
    `(?<![\\w.@/-])(?:https?:\\/\\/)?(?:${hosts})(?![\\w.-])`,
    'i'
  ).test(String(text ?? ''))
}

// ── the button ───────────────────────────────────────────────────────────

/**
 * A door to a screen, as the surface allows.
 *
 * Private chat with the bot: a web_app button, the launch that carries the
 * signature. Anywhere else (group, channel, business message): a url button
 * to the t.me link. No usable bot name outside a private chat: null -- a url
 * to the bare app host is exactly the dead link this module exists to stop.
 */
export function appButton(
  label: string,
  route: AppRoute,
  where: {
    chatType?: string
    botUsername?: string | null
    business?: boolean
    mainWebApp?: boolean
  }
): InlineKeyboardButton | null {
  if (where.chatType === 'private' && !where.business) {
    return Markup.button.webApp(label, buildMiniAppUrl(route))
  }
  const link = appLinkFor(where.botUsername, route, {
    mainWebApp: where.mainWebApp,
  })
  return link ? Markup.button.url(label, link) : null
}

// ── /start app_<route> ───────────────────────────────────────────────────

const ROUTE_LABELS: Partial<Record<AppRoute, { ru: string; en: string }>> = {
  hive: { ru: '🐝 Открыть улей', en: '🐝 Open the hive' },
  chat: { ru: '💬 Открыть агента', en: '💬 Open the agent' },
  browser: { ru: '🌍 Открыть браузер', en: '🌍 Open the browser' },
  profile: { ru: '👤 Открыть профиль', en: '👤 Open the profile' },
  club: { ru: '⭐ Открыть клуб', en: '⭐ Open the club' },
  pair: { ru: '📱 Показать код входа', en: '📱 Show the sign-in code' },
  feed: { ru: '🎬 Открыть ленту', en: '🎬 Open the feed' },
}

export function appDoorLabel(route: AppRoute, isRu: boolean): string {
  const l = ROUTE_LABELS[route]
  if (l) return isRu ? l.ru : l.en
  return isRu ? '📱 Открыть приложение' : '📱 Open the app'
}

export function appDoorText(isRu: boolean): string {
  return isRu
    ? 'Приложение открывается прямо в Telegram — нажмите кнопку.'
    : 'The app opens right here in Telegram — tap the button.'
}

/**
 * The answer to `/start app_<route>`: ONE message, ONE web_app button to that
 * screen. /start is always a private chat (t.me/<bot>?start opens one), so the
 * web_app button is legal here.
 *
 * The chat type is read from `ctx.chat` and, failing that, from
 * `ctx.message.chat`: CreateUserScene hands on a copy made with `{ ...ctx }`,
 * and a spread drops Telegraf's `chat` getter (it lives on the prototype). A
 * new person would then get a url button back to ?start=app_<route> -- a loop
 * to a second /start instead of the screen.
 */
export async function sendAppDoor(
  ctx: {
    reply: (text: string, extra?: any) => Promise<unknown>
    chat?: { type?: string }
    message?: { chat?: { type?: string } }
    botInfo?: { username?: string }
  },
  route: AppRoute,
  isRu: boolean
): Promise<void> {
  const button = appButton(appDoorLabel(route, isRu), route, {
    chatType: ctx.chat?.type ?? ctx.message?.chat?.type,
    botUsername: ctx.botInfo?.username,
  })
  await ctx.reply(
    appDoorText(isRu),
    button ? Markup.inlineKeyboard([[button]]) : undefined
  )
}
