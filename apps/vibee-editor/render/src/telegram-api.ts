/**
 * WHERE EACH BOT'S BOT API LIVES -- THE RENDER SERVER'S COPY.
 *
 * The reasoning lives in `src/services/telegramApi.ts` on the bot side and is
 * not repeated here. The short version: a bot that has called `logOut` on the
 * cloud works ONLY through our own Bot API server, and a request that reaches
 * the cloud later logs it back in there and splits its updates. So the host is
 * chosen per BOT, from the token every call already holds (its numeric id),
 * and a bot not listed in BOT_API_LOCAL_BOTS stays on the cloud as before.
 *
 * WHY A SECOND COPY
 *
 * The render server is a separate deployable with its own build context and no
 * path into the bot's `src/`. Both copies (and scripts/lib/telegram-api.cjs)
 * read the SAME variables, and src/__tests__/telegram-api-parity.test.ts feeds
 * all three one table and demands identical answers -- the property that
 * matters is that they cannot disagree about a bot at runtime.
 *
 * Set BOT_API_LOCAL_BOTS on this service by REFERENCE to the bot service's
 * variable (deployment/telegram-bot-api/README.md), so there is one value.
 */

/** The public Bot API. What every call used before our server existed. */
export const CLOUD_API_ROOT = 'https://api.telegram.org'

/** The cloud refuses `getFile` above this. Telegram's number. */
export const CLOUD_DOWNLOAD_LIMIT = 20 * 1024 * 1024

/** What our own server (tdlib, `--local`) hands over. tdlib's number. */
export const LOCAL_DOWNLOAD_LIMIT = 2000 * 1024 * 1024

export const ROOT_VAR = 'TELEGRAM_API_ROOT'
export const FILES_VAR = 'TELEGRAM_API_FILES_ROOT'
export const BOTS_VAR = 'BOT_API_LOCAL_BOTS'

type Env = Record<string, string | undefined>

export interface LocalBot {
  id: string
  /** The label written beside the id, lower-case, without @. */
  username: string | null
}

export interface BotApiConfig {
  /** Our server's origin, or null when none is configured. */
  localRoot: string | null
  /** Our server's file endpoint origin, or null. */
  filesRoot: string | null
  /** Bot id -> entry, for every bot our server serves. */
  local: Map<string, LocalBot>
}

/**
 * Shown in an error message. A value somebody pasted by mistake may be a token,
 * so anything token-shaped is masked before it reaches a log.
 */
function shown(raw: string): string {
  return JSON.stringify(
    raw.replace(/(\d{5,}:)[A-Za-z0-9_-]{20,}/g, '$1<redacted>').slice(0, 120)
  )
}

function originOf(name: string, raw: string): string {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error(
      `${name}=${shown(raw)} is not a URL. It must be the address of our ` +
        'Bot API server, e.g. http://telegram-bot-api.railway.internal:8081.'
    )
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${name} must be http or https, not "${parsed.protocol}".`)
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${name} must not carry a user or a password.`)
  }
  // Every URL is built as `${root}/bot<token>/method`. A path in the root would
  // either double a slash or be silently dropped by URL resolution in Telegraf,
  // and both fail later as something that reads like a bad token.
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error(
      `${name}=${shown(raw)} must be a bare origin (scheme, host, port) with ` +
        'no path, e.g. http://telegram-bot-api.railway.internal:8081.'
    )
  }
  return parsed.origin
}

const ID = /^\d{5,20}$/
const USERNAME = /^@?([A-Za-z][A-Za-z0-9_]{3,31})$/
const LABELLED = /^@?([A-Za-z][A-Za-z0-9_]{3,31})=(\d{5,20})$/
const TOKEN_SHAPED = /\d{5,}:[A-Za-z0-9_-]{20,}/

function parseBots(raw: string): Map<string, LocalBot> {
  const out = new Map<string, LocalBot>()
  const entries = raw.split(/[\s,;]+/).filter(Boolean)
  entries.forEach((entry, i) => {
    const place = `${BOTS_VAR} entry #${i + 1}`
    if (TOKEN_SHAPED.test(entry)) {
      // Not echoed, not even masked: the whole entry is a secret.
      throw new Error(
        `${place} looks like a bot TOKEN. Never put a token here -- write the ` +
          'bot id (the digits before the colon), and rotate that token: it ' +
          'has been in a dashboard field.'
      )
    }
    let id: string
    let username: string | null = null
    const labelled = LABELLED.exec(entry)
    if (ID.test(entry)) {
      id = entry
    } else if (labelled) {
      username = labelled[1].toLowerCase()
      id = labelled[2]
    } else if (USERNAME.test(entry)) {
      const name = USERNAME.exec(entry)![1]
      throw new Error(
        `${place} "${name}" names a bot without its id. The id cannot be ` +
          'looked up safely: a getMe sent to the wrong server logs the bot ' +
          `in there and splits its updates. Write ${name}=<id>; ` +
          'scripts/bot-api-move.cjs prints the exact entry.'
      )
    } else {
      throw new Error(
        `${place} ${shown(entry)} is neither a bot id nor username=id.`
      )
    }
    const seen = out.get(id)
    if (seen && seen.username && username && seen.username !== username) {
      throw new Error(
        `${BOTS_VAR} gives id ${id} two names, ${seen.username} and ` +
          `${username}. One of them is a typo.`
      )
    }
    out.set(id, { id, username: username ?? seen?.username ?? null })
  })
  return out
}

let cacheKey: string | null = null
let cacheValue: BotApiConfig | null = null

/**
 * The configuration, read from the environment on every call.
 *
 * Read at call time rather than captured at import: the secrets arrive from
 * Infisical after the first imports have run, and a module-level snapshot
 * would freeze whatever the environment held at that moment. Parsed once per
 * distinct value.
 */
export function readBotApiConfig(env: Env = process.env): BotApiConfig {
  const rawRoot = (env[ROOT_VAR] ?? '').trim()
  const rawFiles = (env[FILES_VAR] ?? '').trim()
  const rawBots = (env[BOTS_VAR] ?? '').trim()
  const key = `${rawRoot}|${rawFiles}|${rawBots}`
  if (key === cacheKey && cacheValue) return cacheValue

  // An empty variable is how "unset" arrives from a dashboard field somebody
  // cleared. Treated as a root it would produce `https:///bot123/...`.
  const localRoot = rawRoot ? originOf(ROOT_VAR, rawRoot) : null
  const filesRoot = rawFiles ? originOf(FILES_VAR, rawFiles) : null
  const local = parseBots(rawBots)

  if (
    localRoot &&
    new URL(localRoot).hostname === new URL(CLOUD_API_ROOT).hostname
  ) {
    throw new Error(
      `${ROOT_VAR} points at the public Bot API. It names OUR server; unset it ` +
        'to keep every bot on the cloud.'
    )
  }
  if (local.size && !localRoot) {
    throw new Error(
      `${BOTS_VAR} lists ${local.size} bot(s) but ${ROOT_VAR} is not set: ` +
        'there is no server to send them to.'
    )
  }
  if (local.size && !filesRoot) {
    throw new Error(
      `${BOTS_VAR} lists ${local.size} bot(s) but ${FILES_VAR} is not set: ` +
        'in --local mode getFile answers a path on the server disk, and ' +
        'without the file endpoint no file sent to those bots can be read.'
    )
  }

  const value = { localRoot, filesRoot, local }
  cacheKey = key
  cacheValue = value
  return value
}

/** The startup check. Same parse; exists so the call site says what it is. */
export function assertBotApiConfig(env: Env = process.env): BotApiConfig {
  return readBotApiConfig(env)
}

/** `123456:ABC...` -> `123456`. Null for anything that is not token-shaped. */
export function botIdOfToken(token: string | null | undefined): string | null {
  const m = /^(\d{1,20}):/.exec(String(token ?? '').trim())
  return m ? m[1] : null
}

/** Is this token's bot served by our own server? */
export function botApiIsLocalFor(
  token: string | null | undefined,
  env: Env = process.env
): boolean {
  const id = botIdOfToken(token)
  if (!id) return false
  return readBotApiConfig(env).local.has(id)
}

/** The origin every Bot API URL for this token is built on. */
export function telegramApiRootFor(
  token: string | null | undefined,
  env: Env = process.env
): string {
  return botApiIsLocalFor(token, env)
    ? readBotApiConfig(env).localRoot!
    : CLOUD_API_ROOT
}

/** `${telegramApiFor(token)}/sendMessage` -- the prefix every method shares. */
export function telegramApiFor(token: string, env: Env = process.env): string {
  return `${telegramApiRootFor(token, env)}/bot${token}`
}

/**
 * Where the bytes of a file answered by `getFile` can be read.
 *
 * Cloud: `https://api.telegram.org/file/bot<token>/<file_path>`, as always.
 *
 * Our server in `--local` mode answers `file_path` as an ABSOLUTE path on its
 * own disk (`/var/lib/telegram-bot-api/<token>/videos/file_3.mp4`) and does not
 * serve it over HTTP at all. Its file endpoint (deployment/telegram-bot-api,
 * file-server.mjs) serves exactly that path, read-only, on the private network.
 * The path contains the token, so this URL must never be logged or handed to
 * anybody outside our services -- the same rule as the cloud URL.
 *
 * A RELATIVE path from our server means it runs without `--local`; it then
 * serves files itself, under the cloud's URL shape.
 */
export function telegramFileUrlFor(
  token: string,
  filePath: string,
  env: Env = process.env
): string {
  if (!filePath) throw new Error('telegramFileUrlFor: empty file_path')
  if (!botApiIsLocalFor(token, env)) {
    return `${CLOUD_API_ROOT}/file/bot${token}/${filePath}`
  }
  const config = readBotApiConfig(env)
  if (filePath.startsWith('/')) {
    // Encoded per segment, with the colon of the token directory kept: the
    // file server decodes segments, and redactBotToken recognises `/<id>:`.
    const encoded = filePath
      .split('/')
      .map(s => encodeURIComponent(s).replace(/%3A/gi, ':'))
      .join('/')
    return `${config.filesRoot}${encoded}`
  }
  return `${config.localRoot}/file/bot${token}/${filePath}`
}

/** The largest file `getFile` hands over for this token's bot. */
export function telegramDownloadLimitFor(
  token: string | null | undefined,
  env: Env = process.env
): number {
  return botApiIsLocalFor(token, env)
    ? LOCAL_DOWNLOAD_LIMIT
    : CLOUD_DOWNLOAD_LIMIT
}

/**
 * One line for the startup log: which bots are on our server. Ids only --
 * never a token, and nothing a token could be rebuilt from.
 */
export function describeBotApiConfig(
  tokens: string[],
  env: Env = process.env
): string {
  const config = readBotApiConfig(env)
  const ids = tokens.map(botIdOfToken).filter(Boolean) as string[]
  const here = ids.filter(id => config.local.has(id))
  const missing = [...config.local.keys()].filter(id => !ids.includes(id))
  const parts = [
    `Bot API: ${here.length} of ${ids.length} bot(s) on our server`,
  ]
  if (here.length) parts.push(`(${here.join(', ')}) at ${config.localRoot}`)
  if (missing.length) {
    // Not an error: the render and the bot hold different token sets. But a
    // listed id nobody here holds is worth one line when something is off.
    parts.push(`; listed but not held here: ${missing.join(', ')}`)
  }
  return parts.join(' ')
}
