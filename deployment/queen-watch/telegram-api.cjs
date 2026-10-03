'use strict'
/**
 * WHERE EACH BOT'S BOT API LIVES -- THE PLAIN-NODE SCRIPTS' COPY.
 *
 * The reasoning lives in `src/services/telegramApi.ts` and is not repeated
 * here. In one line: a bot moved to our own Bot API server (listed in
 * BOT_API_LOCAL_BOTS) must never be called on the cloud again, because a cloud
 * request logs it back in there and splits its updates -- and an operator
 * script is exactly the kind of caller nobody remembers.
 *
 * A third copy because `.cjs` scripts run on bare node with no TypeScript
 * loader. It reads the SAME variables as the bot and the render, and
 * src/__tests__/telegram-api-parity.test.ts feeds all three one table and
 * demands identical answers.
 *
 * Used as a library (`require('./lib/telegram-api.cjs')`) and, for shell
 * scripts, as a tiny command that never takes a token on the command line:
 *
 *   BOT_API_TOKEN="$TOKEN" node scripts/lib/telegram-api.cjs api-root
 *
 * prints the origin to call for that token (argv is visible in `ps`; the
 * environment of one child process is not).
 */

const CLOUD_API_ROOT = 'https://api.telegram.org'
const CLOUD_DOWNLOAD_LIMIT = 20 * 1024 * 1024
const LOCAL_DOWNLOAD_LIMIT = 2000 * 1024 * 1024

const ROOT_VAR = 'TELEGRAM_API_ROOT'
const FILES_VAR = 'TELEGRAM_API_FILES_ROOT'
const BOTS_VAR = 'BOT_API_LOCAL_BOTS'

function shown(raw) {
  return JSON.stringify(
    raw.replace(/(\d{5,}:)[A-Za-z0-9_-]{20,}/g, '$1<redacted>').slice(0, 120)
  )
}

function originOf(name, raw) {
  let parsed
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

function parseBots(raw) {
  const out = new Map()
  const entries = raw.split(/[\s,;]+/).filter(Boolean)
  entries.forEach((entry, i) => {
    const place = `${BOTS_VAR} entry #${i + 1}`
    if (TOKEN_SHAPED.test(entry)) {
      throw new Error(
        `${place} looks like a bot TOKEN. Never put a token here -- write the ` +
          'bot id (the digits before the colon), and rotate that token: it ' +
          'has been in a dashboard field.'
      )
    }
    let id
    let username = null
    const labelled = LABELLED.exec(entry)
    if (ID.test(entry)) {
      id = entry
    } else if (labelled) {
      username = labelled[1].toLowerCase()
      id = labelled[2]
    } else if (USERNAME.test(entry)) {
      const name = USERNAME.exec(entry)[1]
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
    out.set(id, {
      id,
      username: username ?? (seen ? seen.username : null) ?? null,
    })
  })
  return out
}

let cacheKey = null
let cacheValue = null

function readBotApiConfig(env = process.env) {
  const rawRoot = String(env[ROOT_VAR] ?? '').trim()
  const rawFiles = String(env[FILES_VAR] ?? '').trim()
  const rawBots = String(env[BOTS_VAR] ?? '').trim()
  const key = `${rawRoot}|${rawFiles}|${rawBots}`
  if (key === cacheKey && cacheValue) return cacheValue

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

function assertBotApiConfig(env = process.env) {
  return readBotApiConfig(env)
}

/**
 * For scripts that hold real tokens and may run outside the service: fail
 * closed. The reasoning is in src/services/telegramApi.ts (same name): an
 * unset BOT_API_LOCAL_BOTS means "none moved" only where the service's own
 * variables are loaded; on a laptop it means "not known", and treating it as
 * "every bot on the cloud" sends a moved bot's call to the cloud.
 */
function assertBotApiListKnown(env = process.env) {
  const onRailway = Boolean(
    env.RAILWAY_SERVICE_NAME ||
      env.RAILWAY_ENVIRONMENT_NAME ||
      env.RAILWAY_ENVIRONMENT
  )
  if (env[BOTS_VAR] === undefined && !onRailway) {
    throw new Error(
      `${BOTS_VAR} is not set here, so this script cannot tell which bots live on ` +
        'our own Bot API server -- and a cloud request for one of those logs it back ' +
        'into the cloud. Run it with the service variables: ' +
        '`railway run -s 999-multibots-telegraf <command>`.'
    )
  }
  return readBotApiConfig(env)
}

function botIdOfToken(token) {
  const m = /^(\d{1,20}):/.exec(String(token ?? '').trim())
  return m ? m[1] : null
}

function botApiIsLocalFor(token, env = process.env) {
  const id = botIdOfToken(token)
  if (!id) return false
  return readBotApiConfig(env).local.has(id)
}

function telegramApiRootFor(token, env = process.env) {
  return botApiIsLocalFor(token, env)
    ? readBotApiConfig(env).localRoot
    : CLOUD_API_ROOT
}

function telegramApiFor(token, env = process.env) {
  return `${telegramApiRootFor(token, env)}/bot${token}`
}

function telegramFileUrlFor(token, filePath, env = process.env) {
  if (!filePath) throw new Error('telegramFileUrlFor: empty file_path')
  if (!botApiIsLocalFor(token, env)) {
    return `${CLOUD_API_ROOT}/file/bot${token}/${filePath}`
  }
  const config = readBotApiConfig(env)
  if (filePath.startsWith('/')) {
    const encoded = filePath
      .split('/')
      .map(s => encodeURIComponent(s).replace(/%3A/gi, ':'))
      .join('/')
    return `${config.filesRoot}${encoded}`
  }
  return `${config.localRoot}/file/bot${token}/${filePath}`
}

function telegramDownloadLimitFor(token, env = process.env) {
  return botApiIsLocalFor(token, env)
    ? LOCAL_DOWNLOAD_LIMIT
    : CLOUD_DOWNLOAD_LIMIT
}

module.exports = {
  CLOUD_API_ROOT,
  CLOUD_DOWNLOAD_LIMIT,
  LOCAL_DOWNLOAD_LIMIT,
  ROOT_VAR,
  FILES_VAR,
  BOTS_VAR,
  readBotApiConfig,
  assertBotApiConfig,
  assertBotApiListKnown,
  botIdOfToken,
  botApiIsLocalFor,
  telegramApiRootFor,
  telegramApiFor,
  telegramFileUrlFor,
  telegramDownloadLimitFor,
}

/**
 * `KEY=VALUE` lines (the shape `railway variables --kv` prints) -> the three
 * variables this file reads, and nothing else: a script on a laptop has to
 * decide with the SERVICE's configuration, not with its own empty one.
 *
 * Empty input is an error, not "no bot moved": it is what a `railway` call
 * that failed (not linked, not logged in) hands on, and reading it as "every
 * bot on the cloud" is the failure this file exists to prevent. Variables
 * that were read but do not include BOT_API_LOCAL_BOTS ARE the service's
 * answer: it decides from the same list.
 */
function envFromKv(text) {
  const env = {}
  let lines = 0
  for (const line of String(text).split('\n')) {
    const at = line.indexOf('=')
    if (at <= 0) continue
    lines += 1
    const key = line.slice(0, at).trim()
    if (key === ROOT_VAR || key === FILES_VAR || key === BOTS_VAR) {
      env[key] = line.slice(at + 1).trim()
    }
  }
  if (lines === 0) {
    throw new Error(
      "no KEY=VALUE lines on stdin: the service's variables could not be read " +
        '(is `railway` linked and logged in?). Refusing to guess.'
    )
  }
  if (env[BOTS_VAR] === undefined) env[BOTS_VAR] = ''
  return env
}

module.exports.envFromKv = envFromKv

if (require.main === module) {
  const command = process.argv[2]
  const fromStdin = process.argv.includes('--env-from-stdin')
  const token = process.env.BOT_API_TOKEN || ''
  if (command !== 'api-root' || !token) {
    process.stderr.write(
      'usage: BOT_API_TOKEN=<token> node scripts/lib/telegram-api.cjs api-root [--env-from-stdin]\n'
    )
    process.exit(2)
  }
  try {
    const env = fromStdin
      ? envFromKv(require('node:fs').readFileSync(0, 'utf8'))
      : process.env
    assertBotApiListKnown(env)
    process.stdout.write(telegramApiRootFor(token, env))
  } catch (e) {
    // Nothing on stdout: a caller comparing it with the cloud's address must
    // not read a failure as "on the cloud".
    process.stderr.write(`telegram-api: ${e && e.message ? e.message : e}\n`)
    process.exit(1)
  }
}
