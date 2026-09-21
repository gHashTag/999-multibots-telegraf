#!/usr/bin/env node
'use strict'
/**
 * MOVE ONE BOT BETWEEN THE CLOUD BOT API AND OUR OWN SERVER -- AND BACK.
 *
 *   node bot-api-move.cjs <username|id>            dry run: says what it would do
 *   node bot-api-move.cjs <username|id> --apply    cloud logOut, then getMe on ours
 *   node bot-api-move.cjs <username|id> --back     close on ours
 *
 * WHERE IT RUNS. Inside the Bot API container (`railway ssh --service
 * telegram-bot-api`), because the second half must reach our server and our
 * server is on the private network only. There it finds the server at
 * http://[::1]:8081 by itself; elsewhere pass --local-root or set
 * TELEGRAM_API_ROOT.
 *
 * THE TOKEN is read from BOT_API_MOVE_TOKEN or typed at a hidden prompt. It is
 * never printed, never put in an error, never logged -- nor is any URL built
 * from it. The dry run touches no network at all.
 *
 * WHY THE ORDER IS WHAT IT IS. Telegram's rule: after `logOut` a bot works only
 * through a local server, and any request that reaches the cloud later logs it
 * back in there -- two servers holding one bot, updates split between them. So
 *
 *   --apply  checks our server answers BEFORE touching the cloud (a bot logged
 *            out with nowhere to go is a silent bot), checks the token is the
 *            bot you named (a wrong token would move a stranger's bot), then
 *            logs out of the cloud, then logs in on ours with getMe, and prints
 *            the exact BOT_API_LOCAL_BOTS entry to add.
 *   --back   is for AFTER the entry is removed and both services redeployed:
 *            while our bot service still polls our server, `close` would be
 *            undone by the very next getUpdates.
 *
 * This file is the implementation; scripts/bot-api-move.cjs runs the same one
 * from a checkout. It lives here so it ships inside the image.
 */

// telegram-api-root-ok: logOut must reach the cloud itself, whatever any configuration says.
const CLOUD_API_ROOT = 'https://api.telegram.org'
const DEFAULT_LOCAL_ROOT = 'http://[::1]:8081'

function usage() {
  return [
    'usage: bot-api-move.cjs <username|id> [--apply | --back] [--local-root <url>]',
    '  no flag   dry run: prints the plan, calls nothing',
    '  --apply   cloud logOut, then getMe on our server (moves the bot to us)',
    '  --back    close on our server (after the entry is removed and services redeployed)',
    'the token comes from BOT_API_MOVE_TOKEN or is typed at a hidden prompt',
  ].join('\n')
}

function parseArgs(argv) {
  const out = { bot: null, mode: 'plan', localRoot: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--apply') out.mode = out.mode === 'back' ? 'both' : 'apply'
    else if (a === '--back') out.mode = out.mode === 'apply' ? 'both' : 'back'
    else if (a === '--local-root') out.localRoot = argv[++i] || ''
    else if (a.startsWith('--'))
      throw new Error(`unknown flag ${a}\n${usage()}`)
    else if (!out.bot) out.bot = a
    else throw new Error(`one bot at a time\n${usage()}`)
  }
  if (!out.bot) throw new Error(usage())
  if (out.mode === 'both')
    throw new Error('--apply and --back together make no sense')
  return out
}

/** `@Kaya_easy_art_bot` -> `kaya_easy_art_bot`; digits stay digits. */
function normalise(bot) {
  return String(bot || '')
    .trim()
    .replace(/^@/, '')
    .toLowerCase()
}

function botIdOfToken(token) {
  const m = /^(\d{1,20}):/.exec(String(token || '').trim())
  return m ? m[1] : null
}

function localRootOf(args, env) {
  const raw = (
    args.localRoot ||
    env.TELEGRAM_API_ROOT ||
    DEFAULT_LOCAL_ROOT
  ).trim()
  let url
  try {
    url = new URL(raw)
  } catch {
    throw new Error(
      'the local root is not a URL; pass --local-root http://host:8081'
    )
  }
  if (url.hostname === new URL(CLOUD_API_ROOT).hostname) {
    throw new Error(
      'the local root points at the cloud; it must name OUR server'
    )
  }
  return url.origin
}

/** What the run will do, as lines. No network. */
function planLines({ bot, mode, localRoot, token }) {
  const id = botIdOfToken(token)
  const who = /^\d+$/.test(normalise(bot))
    ? `id ${normalise(bot)}`
    : `@${normalise(bot)}`
  const tokenLine = token
    ? `token: for bot id ${id || '? (not token-shaped)'} (not shown)`
    : 'token: will be asked at a hidden prompt (or set BOT_API_MOVE_TOKEN)'
  if (mode === 'back') {
    return [
      `PLAN (--back) for ${who}, our server ${localRoot}`,
      tokenLine,
      '  1. getMe on OUR server: confirm the token is this bot',
      '  2. close on OUR server: it stops holding the bot',
      '  before running it: remove the entry from BOT_API_LOCAL_BOTS and redeploy both services',
      '  after it: the cloud takes the bot back on its next request, but not earlier than',
      '            10 minutes after the logOut that moved it',
    ]
  }
  return [
    `PLAN (--apply) for ${who}, our server ${localRoot}`,
    tokenLine,
    '  1. our server answers at all -- otherwise stop, nothing changed',
    '  2. getMe on the CLOUD: confirm the token is this bot -- otherwise stop',
    '  3. logOut on the CLOUD: from here on the bot works only through our server',
    '  4. getMe on OUR server: the bot logs in there',
    '  5. print the BOT_API_LOCAL_BOTS entry; add it and redeploy both services',
    '  between 3 and the redeploy the bot does not answer: the running process still asks the cloud',
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
  const want = normalise(bot)
  if (!me) return false
  if (/^\d+$/.test(want)) return String(me.id) === want
  return normalise(me.username) === want
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

async function apply({ bot, token, localRoot, fetchImpl, print }) {
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
        `not to ${bot}; nothing was changed`
    )
  }
  print(
    `1-2. our server answers; the token is @${cloudMe.result.username} (id ${cloudMe.result.id})`
  )

  const out = await call(fetchImpl, CLOUD_API_ROOT, token, 'logOut')
  if (!out.ok)
    throw new Error(
      `logOut on the cloud failed: ${out.description}; the bot is still on the cloud`
    )
  print('3. logged out of the cloud')

  const localMe = await call(fetchImpl, localRoot, token, 'getMe')
  if (!localMe.ok || !sameBot(bot, localMe.result)) {
    throw new Error(
      `getMe on our server failed (${localMe.description}). The bot is OFF the cloud and ` +
        'not yet on our server. Do NOT run --apply again: ten minutes after logOut a cloud ' +
        'request logs the bot back in there. Fix our server, then add ' +
        `${entryFor(cloudMe.result)} to BOT_API_LOCAL_BOTS and redeploy -- the bot service's ` +
        'first getMe logs the bot in on our server.'
    )
  }
  print(`4. @${localMe.result.username} is on our server`)
  print('')
  print(
    '5. add this entry to BOT_API_LOCAL_BOTS on 999-multibots-telegraf (comma-separated),'
  )
  print('   then redeploy it and vibee-render (which references it):')
  print(`     ${entryFor(localMe.result)}`)
  return entryFor(localMe.result)
}

async function back({ bot, token, localRoot, fetchImpl, print }) {
  const me = await call(fetchImpl, localRoot, token, 'getMe')
  if (!me.ok)
    throw new Error(
      `getMe on our server failed: ${me.description}; nothing was changed`
    )
  if (!sameBot(bot, me.result)) {
    throw new Error(
      `the token belongs to @${me.result.username} (id ${me.result.id}), not to ${bot}; nothing was changed`
    )
  }
  const closed = await call(fetchImpl, localRoot, token, 'close')
  if (!closed.ok) {
    const early = closed.status === 429
    throw new Error(
      `close on our server failed: ${closed.description}` +
        (early
          ? ' -- the server launched this bot less than 10 minutes ago; try again after that'
          : '')
    )
  }
  print(`closed @${me.result.username} on our server.`)
  print(
    'Wait about 10 minutes before expecting the cloud to answer for it: the cloud'
  )
  print(
    'refuses a bot for 10 minutes after its logOut, and takes it back on the first'
  )
  print(
    'request after that. Make sure its entry is gone from BOT_API_LOCAL_BOTS.'
  )
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
  const localRoot = localRootOf(args, env)
  const given = String(env.BOT_API_MOVE_TOKEN || '').trim()

  if (args.mode === 'plan') {
    planLines({
      bot: args.bot,
      mode: 'apply',
      localRoot,
      token: given,
    }).forEach(l => print(l))
    print('')
    planLines({ bot: args.bot, mode: 'back', localRoot, token: given }).forEach(
      l => print(l)
    )
    print('')
    print('dry run: nothing was called. Add --apply or --back to act.')
    return 'plan'
  }

  const token = given || (await ask(`Token of ${args.bot} (not shown): `))
  if (!botIdOfToken(token))
    throw new Error('that is not a bot token (expected <id>:<secret>)')
  planLines({ bot: args.bot, mode: args.mode, localRoot, token }).forEach(l =>
    print(l)
  )
  print('')
  return args.mode === 'apply'
    ? apply({ bot: args.bot, token, localRoot, fetchImpl, print })
    : back({ bot: args.bot, token, localRoot, fetchImpl, print })
}

module.exports = {
  CLOUD_API_ROOT,
  DEFAULT_LOCAL_ROOT,
  parseArgs,
  planLines,
  apply,
  back,
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
