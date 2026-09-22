'use strict'
/**
 * WHICH BOTS THIS SERVER MAY SERVE -- ONE FILE ON THE VOLUME.
 *
 * `telegram-bot-api` serves any token it is sent: a request with an unknown
 * token starts a client for it (ClientManager::send). In `--local` mode such a
 * client may name ANY file on this disk as the document it sends
 * (`document=file:///var/lib/telegram-bot-api/tqueue.binlog`), so whoever can
 * reach the port with a bot of their own -- a throwaway one from BotFather is
 * enough -- can mail themselves the pending updates of every bot here. The
 * Railway private network does not stop that: the per-person browser pod sits
 * on it (docs/architecture/remote-browser-per-user.md, 4.3).
 *
 * So the port in front of the server (api-proxy.mjs) lets a bot through only
 * when its id is in this file, and the file is written by the one thing that
 * moves bots: bot-api-move.cjs, inside this container. `--apply` adds the bot,
 * `--back` and `--forget` remove it. There is no other way in: a new bot
 * cannot log itself in through the proxy, because the proxy refuses it until
 * it is listed.
 *
 * Why a file and not a variable. The allow-list has to change at the moment a
 * bot moves -- between the cloud logOut and the first request here -- and a
 * variable on this service changes only with a redeploy, which is a restart of
 * the server under every bot already on it. The file lives on the volume, so
 * it survives redeploys exactly as long as the bot sessions beside it do.
 *
 * AND A VARIABLE TOO, FOR A MOVE WITHOUT A SHELL (2026-09-22). Writing the
 * file takes a shell in this container, and `railway ssh` is not open to
 * every operator. So the proxy also lets through the ids in
 * BOT_API_ALLOWED_IDS on this service. The move then goes: point both
 * services at this server (the proxy refuses the bot, it is silent), log it
 * out of the cloud from anywhere (`bot-api-move.cjs --cloud-logout`), and only
 * then add it here -- the redeploy that brings the variable in is the moment
 * the bot may log in. The price is that redeploy: seconds in which every bot
 * already here is unreachable, which the bot service rides out by retrying.
 *
 * A malformed entry in the variable is SKIPPED and reported by its position,
 * never by its text -- the likeliest mistake is a pasted token. Not a refusal
 * to start: this service has a volume, so Railway stops the old container
 * before the new one runs, and a crash loop here would silence every bot
 * already moved (all of them logged out of the cloud). Dropping an entry can
 * only shrink the list, so skipping is the safe way to be wrong. The boot line
 * prints the ids that did get in, so a mistyped id is visible.
 *
 * Format: one bot per line, `username=id` or bare `id`; `#` starts a comment.
 * Ids only -- never a token. The variable: the same entries, comma-separated.
 */

const fs = require('node:fs')
const path = require('node:path')

const FILE_NAME = 'allowed-bots'

const LINE = /^(?:@?([A-Za-z][A-Za-z0-9_]{3,31})=)?(\d{5,20})$/

/** Text -> Map(id -> username|null). Lines that are not entries are ignored. */
function parseAllowedBots(text) {
  const out = new Map()
  for (const raw of String(text || '').split('\n')) {
    const line = raw.replace(/#.*/, '').trim()
    const m = LINE.exec(line)
    if (m) out.set(m[2], m[1] || out.get(m[2]) || null)
  }
  return out
}

const VARIABLE = 'BOT_API_ALLOWED_IDS'

const TOKEN_SHAPED = /\d{5,}:[A-Za-z0-9_-]{20,}/

/**
 * BOT_API_ALLOWED_IDS -> Map(id -> username|null), separated like
 * BOT_API_LOCAL_BOTS (comma, semicolon, space). An entry that is not
 * `username=id` or an id is skipped and passed to `onSkip` as one sentence
 * naming its position -- never its text.
 */
function parseAllowedVariable(value, onSkip = () => {}) {
  const out = new Map()
  const entries = String(value ?? '')
    .split(/[\s,;]+/)
    .filter(Boolean)
  entries.forEach((entry, i) => {
    const m = LINE.exec(entry)
    if (m) {
      out.set(m[2], m[1] || out.get(m[2]) || null)
      return
    }
    const place = `${VARIABLE} entry ${i + 1} of ${entries.length}`
    onSkip(
      TOKEN_SHAPED.test(entry)
        ? `${place} looks like a bot TOKEN and is skipped. Write the id (the digits ` +
            'before the colon) and rotate that token: it has been in a dashboard field.'
        : `${place} is not username=id or a bot id and is skipped (text not shown).`
    )
  })
  return out
}

function renderAllowedBots(map) {
  const lines = [
    '# Bots this Bot API server may serve through its API port (api-proxy.mjs).',
    '# Written by bot-api-move.cjs --apply / --back / --forget. Ids, never tokens.',
  ]
  for (const [id, username] of [...map.entries()].sort()) {
    lines.push(username ? `${username}=${id}` : id)
  }
  return lines.join('\n') + '\n'
}

function allowedBotsFile(workDir) {
  return path.join(workDir, FILE_NAME)
}

function readAllowedBots(workDir) {
  try {
    return parseAllowedBots(fs.readFileSync(allowedBotsFile(workDir), 'utf8'))
  } catch (e) {
    if (e && e.code === 'ENOENT') return new Map()
    throw e
  }
}

/** Written whole and renamed into place: a reader never sees half a file. */
function writeAllowedBots(workDir, map) {
  const file = allowedBotsFile(workDir)
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, renderAllowedBots(map), { mode: 0o644 })
  fs.renameSync(tmp, file)
}

/**
 * For the proxy: a function answering the current set of ids, re-reading the
 * file only when it changed. A missing or unreadable file is an empty list --
 * the proxy then refuses every bot the variable does not name, which is the
 * safe way to be wrong. `fromVariable` (parseAllowedVariable) is fixed for the
 * life of the process: the variable changes only with a redeploy.
 */
function allowListWatcher(workDir, fromVariable = new Map()) {
  const file = allowedBotsFile(workDir)
  const fixed = [...fromVariable.keys()]
  let seen = null
  let ids = new Set(fixed)
  return function currentIds() {
    let key = null
    try {
      const s = fs.statSync(file)
      key = `${s.ino}:${s.size}:${s.mtimeMs}`
    } catch {
      seen = null
      ids = new Set(fixed)
      return ids
    }
    if (key !== seen) {
      try {
        ids = new Set([
          ...parseAllowedBots(fs.readFileSync(file, 'utf8')).keys(),
          ...fixed,
        ])
        seen = key
      } catch {
        ids = new Set(fixed)
        seen = null
      }
    }
    return ids
  }
}

module.exports = {
  FILE_NAME,
  VARIABLE,
  parseAllowedBots,
  parseAllowedVariable,
  renderAllowedBots,
  allowedBotsFile,
  readAllowedBots,
  writeAllowedBots,
  allowListWatcher,
}
