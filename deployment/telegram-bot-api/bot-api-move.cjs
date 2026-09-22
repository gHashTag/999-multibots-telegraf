#!/usr/bin/env node
'use strict'
/**
 * MOVE ONE BOT BETWEEN THE CLOUD BOT API AND OUR OWN SERVER -- AND BACK.
 *
 *   node bot-api-move.cjs <bot>                   dry run: says what it would do
 *   node bot-api-move.cjs <bot> --apply           cloud logOut, then log in here
 *   node bot-api-move.cjs <username=id> --back    close here, take it off the allow-list
 *   node bot-api-move.cjs <username=id> --forget  take it off the allow-list, call nothing
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
    'the token comes from BOT_API_MOVE_TOKEN or is typed at a hidden prompt',
  ].join('\n')
}

const MODES = { '--apply': 'apply', '--back': 'back', '--forget': 'forget' }

function parseArgs(argv) {
  const out = { bot: null, mode: 'plan', localRoot: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (MODES[a]) {
      if (out.mode !== 'plan') {
        throw new Error(`${a} with --${out.mode} makes no sense; one at a time`)
      }
      out.mode = MODES[a]
    } else if (a === '--local-root') out.localRoot = argv[++i] || ''
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
  throw new Error(
    `"${text.slice(0, 40)}" is not a username, an id or username=id`
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
    ? `token: for bot id ${id || '? (not token-shaped)'} (not shown)`
    : 'token: will be asked at a hidden prompt (or set BOT_API_MOVE_TOKEN)'
  if (mode === 'forget') {
    return [
      `PLAN (--forget) for ${who}`,
      "  1. take the id off this server's allow-list. No call to any server.",
      '  for a rollback while our server was down: a restarted server runs no polling',
      '  bot until one is requested, so there is nothing to close.',
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

function refuseUnlessHeld({ bot, token, workDir }) {
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
  if (!allowed.readAllowedBots(workDir).has(bot.id)) {
    throw new Error(
      `bot ${bot.id} is not on this server's allow-list: it was never moved here, ` +
        'or --back / --forget already ran. Nothing was called.'
    )
  }
}

async function back({ bot, token, localRoot, workDir, fetchImpl, print }) {
  refuseUnlessHeld({ bot, token, workDir })
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

function forget({ bot, workDir, print }) {
  refuseUnlessHeld({ bot, token: undefined, workDir })
  const list = allowed.readAllowedBots(workDir)
  list.delete(bot.id)
  allowed.writeAllowedBots(workDir, list)
  print(`${bot.label}: off this server's allow-list. No server was called.`)
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
    for (const mode of ['apply', 'back', 'forget']) {
      planLines({ bot, mode, localRoot, token: given }).forEach(l => print(l))
      print('')
    }
    print(
      'dry run: nothing was called. Add --apply, --back or --forget to act.'
    )
    return 'plan'
  }

  if (args.mode === 'forget') {
    planLines({ bot, mode: 'forget', localRoot }).forEach(l => print(l))
    print('')
    return forget({ bot, workDir, print })
  }

  // Everything that can be refused without the token is refused before the
  // prompt: a wrong id or a bot this server never held costs no typing.
  if (args.mode === 'back') refuseUnlessHeld({ bot, token: undefined, workDir })
  else requireWorkDir(workDir)

  const token = given || (await ask(`Token of ${bot.label} (not shown): `))
  if (!botIdOfToken(token)) {
    throw new Error('that is not a bot token (expected <id>:<secret>)')
  }
  planLines({ bot, mode: args.mode, localRoot, token }).forEach(l => print(l))
  print('')
  return args.mode === 'apply'
    ? apply({ bot, token, localRoot, workDir, fetchImpl, print })
    : back({ bot, token, localRoot, workDir, fetchImpl, print })
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
