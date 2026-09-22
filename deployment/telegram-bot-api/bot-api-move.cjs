#!/usr/bin/env node
'use strict'
/**
 * MOVE ONE BOT BETWEEN THE CLOUD BOT API AND OUR OWN SERVER -- AND BACK.
 *
 *   node bot-api-move.cjs <bot>                   dry run: says what it would do
 *   node bot-api-move.cjs <bot> --apply           cloud logOut, then log in here
 *   node bot-api-move.cjs <username=id> --back    close here, take it off the allow-list
 *   node bot-api-move.cjs <username=id> --forget  take it off the allow-list, call nothing
 *   node bot-api-move.cjs <username=id> --cloud-logout   the move WITHOUT a shell:
 *                                                  cloud logOut only, from anywhere
 *
 * <bot> is a username, an id, or `username=id` -- the BOT_API_LOCAL_BOTS entry.
 * --back and --forget need the id: they must be able to refuse a wrong token
 * before anything is sent anywhere.
 *
 * WHERE IT RUNS. Inside the Bot API container (`railway ssh --service
 * telegram-bot-api`), and only there: it talks to the server on loopback
 * (http://127.0.0.1:8083, behind the proxy, because the proxy refuses a bot
 * until it is listed) and it edits the allow-list on the server's volume
 * (allowed-bots.cjs). The dry run works anywhere and touches nothing.
 *
 * THE TOKEN is read from BOT_API_MOVE_TOKEN or typed at a hidden prompt. It is
 * never printed, never put in an error, never logged -- nor is any URL built
 * from it.
 *
 * WHY THE ORDER IS WHAT IT IS. Telegram's rule: after `logOut` a bot works only
 * through a local server, and any request that reaches the cloud later logs it
 * back in there -- two servers holding one bot, updates split between them.
 * And the other half: a `getMe` sent to a server logs the bot in THERE. So
 *
 *   --apply  runs AFTER both services already point the bot here (its entry is
 *            in BOT_API_LOCAL_BOTS and both redeployed; the proxy refuses the
 *            bot until this script lists it, so nothing reaches either server
 *            for it in between). It checks our server answers, checks the
 *            token is the bot you named, logs out of the cloud, lists the bot,
 *            and logs it in here. No process is left pointing at the cloud,
 *            so there is no deadline to race.
 *   --back   refuses before any call unless the id you give is the token's id,
 *            the bot is on the allow-list and this server holds its session:
 *            a getMe here for a bot this server does not hold would log it in
 *            here. Then getMe, close, and off the allow-list -- after which the
 *            proxy refuses the bot, so the services cannot launch it here
 *            again, and the cloud takes it back 10 minutes after its logOut.
 *   --forget is for a server that was down during a rollback. A restarted
 *            server runs no polling bot until one is requested (only webhook
 *            bots are restored: ClientManager.cpp), which is what close would
 *            have achieved; --back would first launch it here again.
 *
 *
 * WITHOUT A SHELL (--cloud-logout, 2026-09-22). `railway ssh` into this
 * container is not open to every operator, and the three modes above need it.
 * The move then splits in three, each step by a different hand:
 *
 *   1. BOT_API_LOCAL_BOTS names the bot and both services are redeployed: they
 *      send it only here, the proxy refuses it, it is silent.
 *   2. --cloud-logout --pointed, run from a checkout under
 *      `railway run --service vibee-render` -- the one service whose variables
 *      hold the farm's tokens AND both bots that never move. Refuses before
 *      any call unless: both of those tokens are present (fail closed),
 *      BOT_API_LOCAL_BOTS parses exactly as the services parse it and names
 *      the bot, the bot is neither of the two, and --pointed says the operator
 *      saw both services' boot lines name it (a variable is configuration; only
 *      the live deployment is proof). Takes the token from the variables by
 *      the bot's id (nothing typed, nothing printed); getMe on the cloud; logOut.
 *      Any cloud failure except "logged out" says STOP, not "go on".
 *   3. The id goes into BOT_API_ALLOWED_IDS on telegram-bot-api
 *      (allowed-bots.cjs). The redeploy that brings it in is the moment the
 *      proxy lets the bot through, and the bot service's retry logs it in.
 *
 * Same property as --apply: no process points the bot at the cloud when it
 * logs out, and our server never holds it while the cloud does.
 *
 * This file is the implementation; scripts/bot-api-move.cjs runs the same one
 * from a checkout. It lives here so it ships inside the image.
 */

const fs = require('node:fs')
const path = require('node:path')
const allowed = require('./allowed-bots.cjs')

// telegram-api-root-ok: logOut must reach the cloud itself, whatever any configuration says.
const CLOUD_API_ROOT = 'https://api.telegram.org'
const DEFAULT_WORK_DIR = '/var/lib/telegram-bot-api'

function defaultLocalRoot(env) {
  return `http://127.0.0.1:${Number(env.UPSTREAM_PORT || 8083)}`
}

function usage() {
  return [
    'usage: bot-api-move.cjs <bot> [--apply | --back | --forget] [--local-root <url>]',
    '  <bot>     username, id, or username=id (--back and --forget need the id)',
    '  no flag   dry run: prints the plan, calls nothing',
    '  --apply   cloud logOut, then log the bot in on our server',
    '  --back    close the bot on our server and take it off the allow-list',
    '  --forget  take the bot off the allow-list only (our server was down)',
    '  --cloud-logout --pointed  cloud logOut only, for a move without a shell',
    '            (username=id); run under railway run --service vibee-render',
    'the token comes from BOT_API_MOVE_TOKEN or is typed at a hidden prompt;',
    '--cloud-logout also finds it among the variables by the bot id',
  ].join('\n')
}

const MODES = {
  '--apply': 'apply',
  '--back': 'back',
  '--forget': 'forget',
  '--cloud-logout': 'cloud-logout',
}

function parseArgs(argv) {
  const out = { bot: null, mode: 'plan', localRoot: null, pointed: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (MODES[a]) {
      if (out.mode !== 'plan') {
        throw new Error(`${a} with --${out.mode} makes no sense; one at a time`)
      }
      out.mode = MODES[a]
    } else if (a === '--local-root') out.localRoot = argv[++i] || ''
    else if (a === '--pointed') out.pointed = true
    else if (a.startsWith('--'))
      throw new Error(`unknown flag ${a}\n${usage()}`)
    else if (!out.bot) out.bot = a
    else throw new Error(`one bot at a time\n${usage()}`)
  }
  if (!out.bot) throw new Error(usage())
  return out
}

/**
 * `@Kaya_easy_art_bot` -> { username: 'kaya_easy_art_bot', id: null };
 * `Kaya_easy_art_bot=61234` -> both; `61234` -> { username: null, id }.
 */
function parseBot(raw) {
  const text = String(raw || '')
    .trim()
    .replace(/^@/, '')
  let m = /^([A-Za-z][A-Za-z0-9_]{3,31})=(\d{5,20})$/.exec(text)
  if (m) return { username: m[1].toLowerCase(), id: m[2], label: m[1] }
  if (/^\d{5,20}$/.test(text)) return { username: null, id: text, label: text }
  m = /^([A-Za-z][A-Za-z0-9_]{3,31})$/.exec(text)
  if (m) return { username: m[1].toLowerCase(), id: null, label: m[1] }
  // Not echoed: the likeliest wrong argument is a pasted token.
  throw new Error(
    'the bot argument is not a username, an id or username=id (not shown: ' +
      'it may be a token -- if it is, rotate it)'
  )
}

function botIdOfToken(token) {
  const m = /^(\d{1,20}):/.exec(String(token || '').trim())
  return m ? m[1] : null
}

function localRootOf(args, env) {
  const raw = (args.localRoot || defaultLocalRoot(env)).trim()
  let url
  try {
    url = new URL(raw)
  } catch {
    throw new Error(
      'the local root is not a URL; pass --local-root http://host:port'
    )
  }
  if (url.hostname === new URL(CLOUD_API_ROOT).hostname) {
    throw new Error(
      'the local root points at the cloud; it must name OUR server'
    )
  }
  return url.origin
}

function workDirOf(env) {
  return env.TELEGRAM_WORK_DIR || DEFAULT_WORK_DIR
}

/** --apply, --back and --forget edit the volume: only inside the container. */
function requireWorkDir(workDir) {
  let ok = false
  try {
    ok = fs.statSync(workDir).isDirectory()
  } catch {
    ok = false
  }
  if (!ok) {
    throw new Error(
      `no ${workDir} here. Run this inside the Bot API container ` +
        '(railway ssh --service telegram-bot-api): it edits the allow-list on ' +
        "the server's volume. Nothing was called."
    )
  }
}

/** The server names a bot's directory by its token, `:` or `~`. */
function holdsSession(workDir, token) {
  const t = String(token).trim()
  return [t, t.replace(/:/g, '~')].some(name => {
    try {
      return fs.statSync(path.join(workDir, name)).isDirectory()
    } catch {
      return false
    }
  })
}

/** What the run will do, as lines. No network, no disk. */
function planLines({ bot, mode, localRoot, token }) {
  const id = botIdOfToken(token)
  const who = bot.username ? `@${bot.username}` : `id ${bot.id}`
  const tokenLine = token
    ? `token: found, for bot id ${id || '? (not token-shaped)'} (not shown)`
    : 'token: will be asked at a hidden prompt (or set BOT_API_MOVE_TOKEN)'
  if (mode === 'forget') {
    return [
      `PLAN (--forget) for ${who}`,
      "  1. take the id off this server's allow-list. No call to any server.",
      '  for a rollback while our server was down: a restarted server runs no polling',
      '  bot until one is requested, so there is nothing to close.',
    ]
  }
  if (mode === 'cloud-logout') {
    return [
      `PLAN (--cloud-logout) for ${who} -- the move without a shell (README 4b)`,
      tokenLine,
      '  BEFORE this: the entry is in BOT_API_LOCAL_BOTS on 999-multibots-telegraf, both',
      '  it and vibee-render are redeployed, and BOTH boot lines name the bot; --pointed',
      '  says you saw them. The bot is silent from then on, so do this straight away.',
      '  0. no call unless: username=id; --pointed; BOT_API_LOCAL_BOTS here parses as the',
      '     services parse it and names the id; the admin bot and the default cashier are',
      '     both known here and this is neither; the token is that id',
      '  1. getMe on the CLOUD: confirm the token is this bot -- otherwise STOP',
      '  2. logOut on the CLOUD. Updates still queued there for the bot are dropped.',
      '  3. then, by hand: add the entry to BOT_API_ALLOWED_IDS on telegram-bot-api.',
      '     Its redeploy lets the bot through, and the bot service logs it in.',
      '  Run this ONCE per move: a cloud getMe more than 10 minutes after the logOut logs',
      '  the bot back in there.',
    ]
  }
  if (mode === 'back') {
    return [
      `PLAN (--back) for ${who}, our server ${localRoot}`,
      tokenLine,
      "  0. no call unless: the id you gave is the token's id, the bot is on the",
      '     allow-list, and this server holds its session',
      '  1. getMe on OUR server: confirm the token is this bot',
      '  2. close on OUR server (refused for 10 minutes after the server launched it)',
      '  3. take it off the allow-list: from now on the proxy refuses it, so no service',
      '     can launch it here again. The bot is silent until step 4 takes effect.',
      '  4. then remove its entry from BOT_API_LOCAL_BOTS and redeploy both services --',
      '     not earlier than 10 minutes after the logOut that moved it: the cloud',
      '     refuses the bot until then.',
    ]
  }
  return [
    `PLAN (--apply) for ${who}, our server ${localRoot}`,
    tokenLine,
    '  BEFORE this: the entry is in BOT_API_LOCAL_BOTS on 999-multibots-telegraf, both',
    '  services are redeployed, and their boot lines name the bot. From then on they',
    '  send nothing for it to the cloud, and the proxy refuses it here: it is silent,',
    '  so do this straight away, in a quiet hour, with its agent chats idle.',
    '  1. our server answers at all -- otherwise stop, nothing changed',
    '  2. getMe on the CLOUD: confirm the token is this bot -- otherwise stop',
    '  3. logOut on the CLOUD. Updates still queued there for the bot are dropped.',
    "  4. put the bot on this server's allow-list",
    '  5. getMe on OUR server: the bot logs in here. The bot service retries a listed',
    '     bot that does not answer, so it picks the bot up by itself within a minute;',
    "     the render's cashier list within five.",
  ]
}

async function call(fetchImpl, root, token, method) {
  let res
  try {
    res = await fetchImpl(`${root}/bot${token}/${method}`, { method: 'POST' })
  } catch (e) {
    // The message of a network error may carry the URL, and the URL carries
    // the token: only the error's class travels.
    return {
      ok: false,
      network: true,
      description: e && e.name ? e.name : 'network error',
    }
  }
  let body = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  return {
    ok: Boolean(body && body.ok),
    status: res.status,
    result: body ? body.result : null,
    description:
      body && body.description
        ? String(body.description)
        : `HTTP ${res.status}`,
  }
}

function sameBot(bot, me) {
  if (!me) return false
  if (bot.id && String(me.id) !== bot.id) return false
  if (
    bot.username &&
    String(me.username || '').toLowerCase() !== bot.username
  ) {
    return false
  }
  return true
}

function entryFor(me) {
  return `${me.username}=${me.id}`
}

async function reachable(fetchImpl, root) {
  try {
    await fetchImpl(`${root}/`, { method: 'GET' })
    return true
  } catch {
    return false
  }
}

async function apply({ bot, token, localRoot, workDir, fetchImpl, print }) {
  requireWorkDir(workDir)
  if (bot.id && bot.id !== botIdOfToken(token)) {
    throw new Error(
      `the token is for bot id ${botIdOfToken(token)}, not ${bot.id}; nothing was called`
    )
  }
  if (!(await reachable(fetchImpl, localRoot))) {
    throw new Error(
      `our server does not answer at ${localRoot}; nothing was changed`
    )
  }
  const cloudMe = await call(fetchImpl, CLOUD_API_ROOT, token, 'getMe')
  if (!cloudMe.ok) {
    throw new Error(
      `the cloud does not know this token (${cloudMe.description}); nothing was changed. ` +
        'If the bot is already on our server, this is not the command you want.'
    )
  }
  if (!sameBot(bot, cloudMe.result)) {
    throw new Error(
      `the token belongs to @${cloudMe.result.username} (id ${cloudMe.result.id}), ` +
        `not to ${bot.label}; nothing was changed`
    )
  }
  print(
    `1-2. our server answers; the token is @${cloudMe.result.username} (id ${cloudMe.result.id})`
  )

  const out = await call(fetchImpl, CLOUD_API_ROOT, token, 'logOut')
  if (!out.ok) {
    throw new Error(
      `logOut on the cloud failed: ${out.description}; the bot is still on the cloud`
    )
  }
  print(`3. logged out of the cloud at ${new Date().toISOString()}`)

  const list = allowed.readAllowedBots(workDir)
  list.set(String(cloudMe.result.id), cloudMe.result.username || null)
  allowed.writeAllowedBots(workDir, list)
  print("4. on this server's allow-list")

  const localMe = await call(fetchImpl, localRoot, token, 'getMe')
  if (!localMe.ok || !sameBot(bot, localMe.result)) {
    throw new Error(
      `getMe on our server failed (${localMe.description}). The bot is OFF the cloud and ` +
        'on the allow-list, but not yet logged in here. Do NOT run --apply again: a ' +
        'cloud request more than ten minutes after logOut logs the bot back in there. ' +
        'Fix our server; the bot service retries the bot and its first getMe that ' +
        `gets through logs it in here. Its entry: ${entryFor(cloudMe.result)}`
    )
  }
  print(`5. @${localMe.result.username} is on our server`)
  print('')
  print(
    'The bot service picks it up by itself within a minute. Check its log for'
  )
  print(`  Bot API: listed bot ${localMe.result.id} answers; launching it`)
  print(
    `Its entry, as it should already be in BOT_API_LOCAL_BOTS: ${entryFor(localMe.result)}`
  )
  return entryFor(localMe.result)
}

const LOCAL_ID = /^\d{5,20}$/
const LOCAL_LABELLED = /^@?([A-Za-z][A-Za-z0-9_]{3,31})=(\d{5,20})$/
const TOKEN_SHAPED = /\d{5,}:[A-Za-z0-9_-]{20,}/

/**
 * BOT_API_LOCAL_BOTS -> ids, parsed exactly as the services parse it
 * (src/services/telegramApi.ts, parseBots): an entry they would refuse at boot
 * is a refusal here too. A value the services refuse leaves the OLD processes
 * polling the cloud, and a logOut then is the split this script exists to
 * prevent. Throws a sentence naming the entry's position, never its text.
 */
function localBotIds(value) {
  const ids = new Set()
  const names = new Map()
  const entries = String(value || '')
    .split(/[\s,;]+/)
    .filter(Boolean)
  entries.forEach((entry, i) => {
    const place = `BOT_API_LOCAL_BOTS entry #${i + 1}`
    if (TOKEN_SHAPED.test(entry)) {
      throw new Error(
        `${place} looks like a bot TOKEN; the services refuse to boot with it`
      )
    }
    const labelled = LOCAL_LABELLED.exec(entry)
    if (LOCAL_ID.test(entry)) {
      ids.add(entry)
      return
    }
    if (!labelled) {
      throw new Error(
        `${place} is neither a bot id nor username=id; the services refuse to boot with it`
      )
    }
    const [, name, id] = labelled
    const seen = names.get(id)
    if (seen && seen !== name.toLowerCase()) {
      throw new Error(`BOT_API_LOCAL_BOTS gives id ${id} two names`)
    }
    names.set(id, name.toLowerCase())
    ids.add(id)
  })
  return ids
}

/** Lenient read of BOT_API_ALLOWED_IDS, the way the proxy reads it. */
function variableIds(env) {
  return new Set(allowed.parseAllowedVariable(env[allowed.VARIABLE]).keys())
}

const TOKEN_SHAPE = /^\d{5,20}:[A-Za-z0-9_-]{30,}$/

/**
 * The bot's token from the service's own variables, found by its id: under
 * `railway run --service vibee-render` the farm's tokens are there. Two
 * different values for one id (an old token beside a new one) is a refusal,
 * not a guess. The value is returned, never printed.
 */
function tokenFromVariables(env, id) {
  const found = new Set()
  for (const value of Object.values(env || {})) {
    const v = String(value || '').trim()
    if (TOKEN_SHAPE.test(v) && botIdOfToken(v) === id) found.add(v)
  }
  if (found.size > 1) {
    throw new Error(
      `the variables hold ${found.size} different tokens for bot ${id}; set ` +
        'BOT_API_MOVE_TOKEN to the live one. Nothing was called.'
    )
  }
  return found.size ? [...found][0] : ''
}

/**
 * The two bots that never move (README, "Two bots never move"). FAIL CLOSED:
 * both tokens must be in this environment, or the check proves nothing --
 * the bot service does not carry TOKENS_PAYMENT_BOT_TOKEN, vibee-render does.
 */
const NEVER_MOVE = {
  BOT_TOKEN_1: 'the admin alerts',
  TOKENS_PAYMENT_BOT_TOKEN: 'the default cashier',
}

/** Everything refusable before a token is used. Throws; returns nothing. */
function refuseCloudLogout({ bot, env, pointed }) {
  if (!bot.id || !bot.username) {
    throw new Error(
      `--cloud-logout needs username=id, the BOT_API_LOCAL_BOTS entry (got ${bot.label}). ` +
        'Nothing was called.'
    )
  }
  for (const [name, what] of Object.entries(NEVER_MOVE)) {
    const id = botIdOfToken(env[name])
    if (!id) {
      throw new Error(
        `${name} (${what}) is not in this environment, so this script cannot tell ` +
          'whether you named a bot that must never move. Run it under ' +
          'railway run --service vibee-render, which holds both. Nothing was called.'
      )
    }
    if (id === bot.id) {
      throw new Error(
        `bot ${bot.id} is the bot of ${name}, which carries ${what} and never moves. ` +
          'Nothing was called.'
      )
    }
  }
  let listed
  try {
    listed = localBotIds(env.BOT_API_LOCAL_BOTS)
  } catch (e) {
    throw new Error(
      `${e.message}. The old processes then keep sending the bot to the cloud, and a ` +
        'logOut now would split it. Fix the variable and redeploy first. Nothing was called.'
    )
  }
  if (!listed.has(bot.id)) {
    throw new Error(
      `BOT_API_LOCAL_BOTS here does not name bot ${bot.id}. Point first: add ` +
        `${bot.label}=${bot.id} to it on 999-multibots-telegraf, redeploy that service and ` +
        'vibee-render, and run this under railway run --service vibee-render. ' +
        'Logging out while a service still sends the bot to the cloud logs it back in ' +
        'there. Nothing was called.'
    )
  }
  if (!pointed) {
    throw new Error(
      'the variable is set, but only the running services can say they use it. Look ' +
        `for "Bot API: ... on our server (${bot.id})" in the 999-multibots-telegraf log and ` +
        'for the bot among "Bot API: ... on our server" in the vibee-render log, both from ' +
        'the deployment that is live now; then add --pointed. Nothing was called.'
    )
  }
}

/** What a failed cloud getMe means for the operator's next step. */
function cloudGetMeFailure(res) {
  if (!res.network && /logged out/i.test(String(res.description))) {
    return (
      `the cloud says the bot is already logged out (${res.description}). Do NOT run ` +
      '--cloud-logout again: a cloud getMe more than 10 minutes after the logOut logs ' +
      'the bot back in there. Go on with step 3.'
    )
  }
  const why = res.network
    ? `the cloud could not be reached (${res.description})`
    : res.status === 401
      ? `the cloud refuses this token (${res.description}): revoked or wrong`
      : `the cloud answered ${res.description}`
  return (
    `${why}. STOP: the bot may still be on the cloud -- do NOT add it to ` +
    'BOT_API_ALLOWED_IDS. Nothing was changed. Retry from a network that reaches ' +
    `${new URL(CLOUD_API_ROOT).host}, or roll back step 1.`
  )
}

async function cloudLogout({ bot, token, fetchImpl, print }) {
  if (botIdOfToken(token) !== bot.id) {
    throw new Error(
      `the token is for bot id ${botIdOfToken(token)}, not ${bot.id}; nothing was called`
    )
  }
  const cloudMe = await call(fetchImpl, CLOUD_API_ROOT, token, 'getMe')
  if (!cloudMe.ok) throw new Error(cloudGetMeFailure(cloudMe))
  if (!sameBot(bot, cloudMe.result)) {
    throw new Error(
      `the token belongs to @${cloudMe.result.username} (id ${cloudMe.result.id}), ` +
        `not to ${bot.label}; nothing was changed`
    )
  }
  print(
    `1. the token is @${cloudMe.result.username} (id ${cloudMe.result.id}) on the cloud`
  )
  const out = await call(fetchImpl, CLOUD_API_ROOT, token, 'logOut')
  if (!out.ok) {
    throw new Error(
      `logOut on the cloud failed: ${out.description}; the bot is still on the cloud. ` +
        'Do NOT add it to BOT_API_ALLOWED_IDS.'
    )
  }
  const at = new Date().toISOString()
  const entry = entryFor(cloudMe.result)
  print(`2. logged out of the cloud at ${at} -- note it for a rollback`)
  print('')
  print(
    '3. now add the entry on telegram-bot-api. Read the current value first:'
  )
  print(
    `     railway variables --service telegram-bot-api --kv | grep '^${allowed.VARIABLE}='`
  )
  print('   and set it with this entry appended (comma-separated):')
  print(`     ${allowed.VARIABLE}=${entry}`)
  print(
    '   Its redeploy lets the bot through; the boot line lists the ids it took, and'
  )
  print('   within a minute the bot log says')
  print(`     Bot API: listed bot ${cloudMe.result.id} answers; launching it`)
  print('')
  print(
    'Do NOT run --cloud-logout again for this bot: a cloud getMe more than 10'
  )
  print('minutes after the logOut logs it back in there.')
  print(
    'Rollback before step 3: take the entry out of BOT_API_LOCAL_BOTS and redeploy'
  )
  print(`both services not earlier than 10 minutes after ${at}.`)
  return entry
}

/**
 * The release path inside the container. A bot that BOT_API_ALLOWED_IDS lets
 * through cannot be released by the file alone: close would be undone within
 * seconds (the services still point here and the proxy still admits it), and
 * the next step -- BOT_API_LOCAL_BOTS -- would then point them at the cloud
 * while this server still runs a client for the bot. So --back refuses such a
 * bot outright, and --forget clears the file and names what comes next.
 */
function variableRelease(bot, inFile) {
  return (
    `bot ${bot.id} is let through by ${allowed.VARIABLE} on telegram-bot-api. In this ` +
    'order: ' +
    (inFile ? `(1) --forget ${bot.label}=${bot.id} here; ` : '') +
    `(${inFile ? 2 : 1}) take it out of ${allowed.VARIABLE} -- the redeploy restarts this ` +
    'server, which then runs no polling bot until one is requested, what close would do, ' +
    'and the proxy refuses it; ' +
    `(${inFile ? 3 : 2}) then remove it from BOT_API_LOCAL_BOTS and redeploy both ` +
    'services, not earlier than 10 minutes after the logOut that moved it.'
  )
}

function refuseUnlessHeld({ bot, token, workDir, env = {}, mode }) {
  if (!bot.id) {
    throw new Error(
      `--back and --forget need the bot's id: write ${bot.label}=<id>, the ` +
        'entry from BOT_API_LOCAL_BOTS. Nothing was called.'
    )
  }
  requireWorkDir(workDir)
  if (token !== undefined && botIdOfToken(token) !== bot.id) {
    throw new Error(
      `the token is for bot id ${botIdOfToken(token)}, not ${bot.id}. Nothing was ` +
        'called: a getMe here with the wrong token would log THAT bot in here.'
    )
  }
  const inFile = allowed.readAllowedBots(workDir).has(bot.id)
  if (variableIds(env).has(bot.id) && (mode === 'back' || !inFile)) {
    throw new Error(`${variableRelease(bot, inFile)} Nothing was called.`)
  }
  if (!inFile) {
    throw new Error(
      `bot ${bot.id} is not on this server's allow-list: it was never moved here, ` +
        'or --back / --forget already ran. Nothing was called.'
    )
  }
}

async function back({
  bot,
  token,
  localRoot,
  workDir,
  fetchImpl,
  print,
  env = {},
}) {
  refuseUnlessHeld({ bot, token, workDir, env, mode: 'back' })
  if (!holdsSession(workDir, token)) {
    throw new Error(
      `this server holds no session for that token (no ${path.join(workDir, '<token>')}). ` +
        'Nothing was called: a getMe here would log the bot in here. If the bot is ' +
        'listed but was never logged in, --forget takes it off the list.'
    )
  }
  const me = await call(fetchImpl, localRoot, token, 'getMe')
  if (!me.ok) {
    throw new Error(
      `getMe on our server failed: ${me.description}. Nothing was changed: the bot stays ` +
        'on the allow-list.'
    )
  }
  if (!sameBot(bot, me.result)) {
    throw new Error(
      `our server says the token is @${me.result.username} (id ${me.result.id}), not ` +
        `${bot.label}. Nothing was changed.`
    )
  }
  const closed = await call(fetchImpl, localRoot, token, 'close')
  if (!closed.ok) {
    const early = closed.status === 429
    throw new Error(
      `close on our server failed: ${closed.description}. Nothing was changed: the bot ` +
        'stays on the allow-list and keeps working here' +
        (early
          ? '. The server launched it less than 10 minutes ago; run --back again after that.'
          : '.')
    )
  }
  print(`1-2. closed @${me.result.username} on our server`)
  const list = allowed.readAllowedBots(workDir)
  list.delete(bot.id)
  try {
    allowed.writeAllowedBots(workDir, list)
  } catch (e) {
    throw new Error(
      `closed here, but the allow-list could not be written (${e.code || e.message}). ` +
        `Run --forget ${bot.label}=${bot.id} before anything calls our server for it.`
    )
  }
  // refuseUnlessHeld refused a bot the variable names, so the file was all.
  print("3. off this server's allow-list: the proxy refuses it from now on")
  print('')
  print(
    `4. remove ${entryFor(me.result)} from BOT_API_LOCAL_BOTS on 999-multibots-telegraf,`
  )
  print(
    '   and redeploy it and vibee-render -- not earlier than 10 minutes after the'
  )
  print(
    '   logOut that moved the bot: the cloud refuses it until then. Until that'
  )
  print('   redeploy the bot is silent.')
  return true
}

function forget({ bot, workDir, print, env = {} }) {
  refuseUnlessHeld({ bot, token: undefined, workDir, env, mode: 'forget' })
  const list = allowed.readAllowedBots(workDir)
  list.delete(bot.id)
  allowed.writeAllowedBots(workDir, list)
  if (variableIds(env).has(bot.id)) {
    print(
      `${bot.label}: off the file, but the proxy STILL lets it through. No server was called.`
    )
    print(variableRelease(bot, false))
  } else {
    print(`${bot.label}: off this server's allow-list. No server was called.`)
  }
  return true
}

function askHidden(question) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(
        new Error('no token: set BOT_API_MOVE_TOKEN or run this in a terminal')
      )
      return
    }
    const readline = require('node:readline')
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    })
    rl._writeToOutput = () => {}
    process.stdout.write(question)
    rl.question('', answer => {
      rl.close()
      process.stdout.write('\n')
      resolve(String(answer).trim())
    })
  })
}

async function main(
  argv,
  {
    env = process.env,
    fetchImpl = fetch,
    print = console.log,
    ask = askHidden,
  } = {}
) {
  const args = parseArgs(argv)
  const bot = parseBot(args.bot)
  const localRoot = localRootOf(args, env)
  const workDir = workDirOf(env)
  const given = String(env.BOT_API_MOVE_TOKEN || '').trim()

  if (args.mode === 'plan') {
    let found = ''
    try {
      found = given || (bot.id ? tokenFromVariables(env, bot.id) : '')
    } catch {
      found = ''
    }
    for (const mode of ['apply', 'cloud-logout', 'back', 'forget']) {
      planLines({ bot, mode, localRoot, token: found }).forEach(l => print(l))
      if (mode === 'cloud-logout') {
        try {
          refuseCloudLogout({ bot, env, pointed: true })
          print(
            '  here and now: the checks of step 0 pass (--pointed still needed)'
          )
        } catch (e) {
          print(`  here and now it would be REFUSED: ${e.message}`)
        }
      }
      print('')
    }
    print(
      'dry run: nothing was called. Add --apply, --cloud-logout, --back or --forget to act.'
    )
    return 'plan'
  }

  if (args.mode === 'forget') {
    planLines({ bot, mode: 'forget', localRoot }).forEach(l => print(l))
    print('')
    return forget({ bot, workDir, print, env })
  }

  if (args.mode === 'cloud-logout') {
    refuseCloudLogout({ bot, env, pointed: args.pointed })
    const token =
      given ||
      tokenFromVariables(env, bot.id) ||
      (await ask(`Token of ${bot.label} (not shown): `))
    if (!botIdOfToken(token)) {
      throw new Error('that is not a bot token (expected <id>:<secret>)')
    }
    planLines({ bot, mode: args.mode, localRoot, token }).forEach(l => print(l))
    print('')
    return cloudLogout({ bot, token, fetchImpl, print })
  }

  // Everything that can be refused without the token is refused before the
  // prompt: a wrong id or a bot this server never held costs no typing.
  if (args.mode === 'back')
    refuseUnlessHeld({ bot, token: undefined, workDir, env, mode: 'back' })
  else requireWorkDir(workDir)

  const token = given || (await ask(`Token of ${bot.label} (not shown): `))
  if (!botIdOfToken(token)) {
    throw new Error('that is not a bot token (expected <id>:<secret>)')
  }
  planLines({ bot, mode: args.mode, localRoot, token }).forEach(l => print(l))
  print('')
  return args.mode === 'apply'
    ? apply({ bot, token, localRoot, workDir, fetchImpl, print })
    : back({ bot, token, localRoot, workDir, fetchImpl, print, env })
}

module.exports = {
  CLOUD_API_ROOT,
  DEFAULT_WORK_DIR,
  parseArgs,
  parseBot,
  planLines,
  apply,
  back,
  forget,
  cloudLogout,
  tokenFromVariables,
  main,
  usage,
}

if (require.main === module) {
  main(process.argv.slice(2)).then(
    () => process.exit(0),
    e => {
      console.error(`bot-api-move: ${e && e.message ? e.message : e}`)
      process.exit(1)
    }
  )
}
