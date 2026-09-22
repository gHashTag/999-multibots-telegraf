#!/usr/bin/env node
/**
 * THE RAINBOW BRIDGE: EVERY BOT, EVERY SURFACE, AT ONCE.
 *
 * Owner, 2026-09-20: "we test together from two accounts -- that is called the
 * rainbow bridge, the way every function is checked from both sides. Work out
 * how to speed it up: all the functions through the user bots in parallel,
 * while each profile gets configured for real work."
 *
 * The slow part was never the checking. It was that each check was a person
 * typing into a chat, one bot at a time, and by the tenth bot nobody remembers
 * what the third one answered. This walks the farm in parallel and prints a
 * matrix, so a human only looks at the rows that are not green.
 *
 * ── IT NEVER WRITES TO A PERSON ────────────────────────────────────────────
 *
 * Not one Telegram message is sent. The bot side is read-only Bot API
 * (getMe, getChatMenuButton, getMyCommands); the agent side goes to the
 * render's own chat endpoint over the server key. So it can be run a hundred
 * times a day without a single notification reaching anybody -- which is the
 * whole reason it can be run a hundred times a day.
 *
 * What it therefore CANNOT check is named in the output rather than skipped:
 * a real voice note, a real file, a real payment and the mini app's own
 * screens need a human on each side. That half is the bridge; this is the
 * half that should never have needed one.
 *
 *   tri bridge                # the owner alone
 *   tri bridge 144022504 435572800   # both sides
 *
 * Exit: 0 everything measured is fine, 1 something needs a person.
 */
'use strict'

// The host is chosen per bot: a bot on our own Bot API server must never be
// asked on the cloud (scripts/lib/telegram-api.cjs).
const {
  assertBotApiListKnown,
  telegramApiFor,
} = require('./lib/telegram-api.cjs')

const PAINT = Boolean(process.stdout.isTTY)
const E = PAINT ? String.fromCharCode(27) : ''
const wrap = (c, s) => (PAINT ? `${E}[${c}m${s}${E}[0m` : s)
const dim = s => wrap(2, s)
const red = s => wrap(31, s)
const green = s => wrap(32, s)
const yellow = s => wrap(33, s)
const bold = s => wrap(1, s)

const BASE =
  process.env.RENDER_BASE_URL ||
  'https://vibee-render-production.up.railway.app'
const MINI_APP = /t27\.ai|railway\.app/i

/** How many checks run at once. Enough to be fast, few enough to be polite. */
const LANES = 6

/** Run `jobs` with at most `lanes` in flight, keeping the input order. */
async function inParallel(jobs, lanes = LANES) {
  const out = new Array(jobs.length)
  let next = 0
  const lane = async () => {
    for (;;) {
      const i = next++
      if (i >= jobs.length) return
      try {
        out[i] = await jobs[i]()
      } catch (e) {
        out[i] = { error: e instanceof Error ? e.message : String(e) }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(lanes, jobs.length) }, lane))
  return out
}

const ask = async (url, init = {}, ms = 30_000) => {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ac.signal })
  } finally {
    clearTimeout(t)
  }
}

/** Every bot token in this environment. Values are used, never printed. */
function tokens() {
  const out = []
  for (let i = 1; i <= 20; i++) {
    const t = process.env[`BOT_TOKEN_${i}`]
    if (t) out.push(t)
  }
  return out
}

/** What one bot looks like from Telegram's side. Read-only, three calls. */
async function checkBot(token) {
  const tg = async (method, body) => {
    const r = await ask(`${telegramApiFor(token)}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    })
    return r.json()
  }
  const me = await tg('getMe')
  if (!me.ok) return { name: '(token refused)', alive: false }
  const name = me.result.username
  const [button, commands] = await Promise.all([
    tg('getChatMenuButton').catch(() => ({})),
    /*
     * THE SCOPE HAS TO BE THE ONE THEY WERE SET IN.
     *
     * setCommands.ts writes them to `all_private_chats` and deliberately
     * DELETES the group scopes. Asking without a scope asks the default one,
     * which is empty on purpose -- and the first run of this tool duly
     * reported "commands: 0" for all eleven bots and sent me hunting a defect
     * that did not exist. A check that reads a different place from the one
     * the code writes is not a check.
     */
    tg('getMyCommands', { scope: { type: 'all_private_chats' } }).catch(
      () => ({})
    ),
  ])
  const b = button?.result ?? {}
  return {
    name,
    alive: true,
    opensApp: b.type === 'web_app' && MINI_APP.test(String(b.web_app?.url)),
    buttonText: b.text ?? `(${b.type ?? 'unknown'})`,
    commands: Array.isArray(commands?.result) ? commands.result.length : null,
  }
}

/** Ask the live agent one question on one surface and read the answer. */
async function checkAgent(key, id, surface, question) {
  const r = await ask(
    `${BASE}/api/agent/chat?telegram_id=${encodeURIComponent(id)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': key },
      body: JSON.stringify({
        surface,
        messages: [{ role: 'user', content: question }],
      }),
    },
    150_000
  )
  if (!r.ok) return { ok: false, why: `${r.status}` }
  const body = await r.text()
  const words = []
  for (const line of body.split('\n')) {
    const s = line.trim()
    if (!s) continue
    try {
      const ev = JSON.parse(s)
      if (ev['тип'] === 'текст' && typeof ev['текст'] === 'string') {
        words.push(ev['текст'])
      }
    } catch {
      /* a partial line is not an answer */
    }
  }
  const text = words.join('').trim()
  return { ok: Boolean(text), text, why: text ? '' : 'no words' }
}

/*
 * One read-only tool call AS a given person. The server key is trusted with an
 * explicit telegram_id -- the same entrance every owner-side tool uses
 * (.claude/skills/mcp-owner-access). Answers null rather than throwing: a
 * missing profile is a finding, not a crash.
 */
async function asPerson(key, id, name, args = {}) {
  const r = await ask(
    `${BASE}/mcp?telegram_id=${encodeURIComponent(id)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': key },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name, arguments: args },
      }),
    },
    30_000
  )
  if (!r.ok) return null
  try {
    const d = await r.json()
    if (d.error) return null
    return JSON.parse(d.result?.content?.[0]?.text ?? 'null')
  } catch {
    return null
  }
}

/**
 * IS THIS SIDE SET UP FOR REAL WORK, not only reachable.
 *
 * The owner's words: "all the functions through the user bots in parallel,
 * while each profile gets configured for real work." Checking that the agent
 * answers a side says nothing about whether that side can SELL: a person who
 * never connected their Telegram is not a seller, so the daily sweep skips
 * them and the CRM has nobody's correspondence to read; an empty live wallet
 * refuses every generation. Each gap is printed with the one press that
 * closes it and whose press it is -- never ours: the login code is typed by
 * the person, and crediting tokens is the owner's decision.
 */
function profileGaps({ id, me, wallet, sellers }) {
  const gaps = []
  if (!me) gaps.push('unknown to the render -- sign in to the mini app once')
  if (sellers && !sellers.has(String(id))) {
    gaps.push(
      'not a seller -- in the app: /app -> Profile -> Connect Telegram; ' +
        'the person types the code themselves'
    )
  }
  const raw = wallet ? wallet['баланс_токенов'] : undefined
  const balance = typeof raw === 'number' ? raw : NaN
  if (!Number.isFinite(balance)) gaps.push('live wallet unreadable')
  else if (balance <= 0) {
    gaps.push('live wallet empty -- top up, or the owner decides to credit')
  }
  return {
    balance,
    seller: sellers ? sellers.has(String(id)) : null,
    gaps,
  }
}

async function profileOf(key, id, sellers) {
  const [me, wallet] = await Promise.all([
    asPerson(key, id, 'whoami'),
    asPerson(key, id, 'my_balance'),
  ])
  const p = me?.['профиль'] ?? {}
  return {
    id,
    name: String(p.display_name || p.first_name || p.username || '?'),
    role: String(me?.role ?? '?'),
    ...profileGaps({ id, me, wallet, sellers }),
  }
}

/* What the answer must contain to count as "it told the person what it can do". */
const SAYS_FILES = /\.md|\.txt|текстов/i // cyrillic-ok: matching the agent's own words
const SAYS_VOICE = /голосов|расшифр/i // cyrillic-ok: matching the agent's own words

async function main() {
  const key = process.env.RENDER_API_KEY
  const ids = process.argv.slice(2).filter(a => /^\d{5,15}$/.test(a))
  if (!key) {
    console.error(
      'Needs RENDER_API_KEY (and BOT_TOKEN_* for the bot half). Run it as\n' +
        '  railway run -s vibee-render node scripts/bridge.cjs <id> [id...]'
    )
    process.exitCode = 2
    return
  }
  let needsAPerson = 0

  /* ── the bots ──────────────────────────────────────────────────────────── */
  const toks = tokens()
  if (toks.length) {
    // A bot on our own Bot API server must not be asked on the cloud, and
    // this script cannot tell which those are without the service's variables.
    assertBotApiListKnown()
  }
  console.log(bold(`bots: ${toks.length} token(s) in this environment`))
  if (!toks.length) {
    console.log(
      dim('  none here -- run this on the bot service to check the bot half')
    )
  } else {
    const bots = await inParallel(toks.map(t => () => checkBot(t)))
    for (const b of bots.sort((x, y) =>
      String(x.name).localeCompare(String(y.name))
    )) {
      if (!b.alive) {
        needsAPerson++
        console.log(`  ${red('✗')} ${b.name}`)
        continue
      }
      const door = b.opensApp
        ? green('opens the app')
        : red('does NOT open the app')
      if (!b.opensApp) needsAPerson++
      console.log(
        `  ${b.opensApp ? green('✓') : red('✗')} ${String(b.name).padEnd(28)}` +
          ` ${door}  "${b.buttonText}"  commands: ${
            b.commands === null ? '?' : b.commands || red('0')
          }`
      )
    }
  }
  console.log('')

  /* ── the two sides of the bridge ───────────────────────────────────────── */
  const sides = ids.length ? ids : ['144022504']

  /* ── each side's profile: ready for real work, or what is missing ────── */
  // The seller list is the owner's to read, so it is asked as the first side.
  const sellerList = await asPerson(key, sides[0], 'crm_sellers')
  const sellers = Array.isArray(sellerList?.sellers)
    ? new Set(sellerList.sellers.map(r => String(r.telegram_id)))
    : null
  console.log(bold(`profiles, ${sides.length} side(s), in parallel`))
  if (!sellers) {
    console.log(
      dim('  seller list unreadable (the first id must be the owner)')
    )
  }
  const profiles = await inParallel(
    sides.map(id => () => profileOf(key, id, sellers))
  )
  for (const p of profiles) {
    if (p.gaps.length) needsAPerson += p.gaps.length
    const mark = p.gaps.length ? yellow('!') : green('✓')
    const seller =
      p.seller === null ? '?' : p.seller ? green('seller') : red('not a seller')
    const tokens = Number.isFinite(p.balance) ? String(p.balance) : '?'
    console.log(
      `  ${mark} ${String(p.id).padEnd(12)} ${p.name.slice(0, 20).padEnd(20)}` +
        ` ${p.role.padEnd(6)} ${seller}  tokens: ${tokens}`
    )
    for (const g of p.gaps) console.log(dim(`      · ${g}`))
  }
  console.log('')
  const question = 'Какие файлы ты умеешь принимать? Ответь одной строкой.' // cyrillic-ok: the question a person would ask
  const jobs = []
  for (const id of sides) {
    for (const surface of ['bot', 'business']) {
      jobs.push(() =>
        checkAgent(key, id, surface, question).then(r => ({
          id,
          surface,
          ...r,
        }))
      )
    }
  }
  console.log(
    bold(`the agent, ${sides.length} side(s) x 2 surfaces, in parallel`)
  )
  const answers = await inParallel(jobs)
  for (const a of answers) {
    const who = `${a.id} ${a.surface}`.padEnd(26)
    if (!a.ok) {
      needsAPerson++
      console.log(`  ${red('✗')} ${who} no answer (${a.why})`)
      continue
    }
    const files = SAYS_FILES.test(a.text)
    const voice = SAYS_VOICE.test(a.text)
    if (!files || !voice) needsAPerson++
    console.log(
      `  ${files && voice ? green('✓') : yellow('!')} ${who}` +
        ` files: ${files ? green('named') : red('SILENT')}` +
        `  voice: ${voice ? green('named') : red('SILENT')}`
    )
    console.log(dim(`      ${a.text.split('\n')[0].slice(0, 110)}`))
  }
  console.log('')

  /* ── what only a person can do ─────────────────────────────────────────── */
  console.log(
    bold('still needs two humans (this tool sends nothing to anybody)')
  )
  for (const line of [
    'a real voice note, both directions -- the transcript is the proof',
    'a real .md and a real .pdf -- one must be read, one must be refused OUT LOUD',
    'a payment through the cashier each side actually sees',
    'the mini app: hive, profile, club, and signing in on a second device',
  ]) {
    console.log(dim(`  · ${line}`))
  }

  console.log('')
  console.log(
    needsAPerson
      ? red(`${needsAPerson} row(s) need a person`)
      : green('everything measurable here is fine')
  )
  process.exitCode = needsAPerson ? 1 : 0
}

module.exports = { profileGaps }

if (require.main === module) {
  main().catch(e => {
    console.error(e instanceof Error ? e.message : String(e))
    process.exitCode = 2
  })
}
