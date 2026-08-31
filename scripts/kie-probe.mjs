#!/usr/bin/env node
/**
 * EVERY KIE FUNCTION, CHECKED BEFORE A SINGLE CREDIT IS SPENT.
 *
 * WHY. The product charges a person tokens and then calls a provider. When the
 * provider is dead the money is already gone: measured today, FAL answers 403
 * "Exhausted balance" and ElevenLabs holds an identifier instead of a key, and
 * /api/providers reported "works 1 of 4" while the agent kept quoting prices
 * for services it cannot deliver. Kie is the one funded provider and nothing
 * checked it at all.
 *
 * HOW IT AVOIDS PAYING. A generation costs credits; a REJECTED generation does
 * not. Each model is probed with deliberately invalid input, and the answer
 * separates three different worlds:
 *
 *   - the API rejects the INPUT      -> the model exists, auth works, path OK
 *   - the API rejects the MODEL      -> the id is wrong, or not on this account
 *   - the API accepts and starts     -> we would have paid; the probe treats
 *                                       this as a defect in the probe itself
 *                                       and says so loudly, see BILLABLE below
 *
 * The credit balance is read before and after and printed either way, so the
 * claim "this cost nothing" is measured rather than asserted.
 *
 *   node scripts/kie-probe.mjs              # free probe of every model
 *   node scripts/kie-probe.mjs --json       # machine-readable
 *
 * Exit code: 0 when every model answered, 1 when any model is unreachable or
 * unknown, 2 when the key or the balance could not be read at all -- the third
 * outcome, never folded into a pass.
 */

import fs from 'node:fs'
import { execSync } from 'node:child_process'

const BASE = 'https://api.kie.ai/api/v1'
const JSON_OUT = process.argv.includes('--json')

/**
 * FIND THE KEY, DO NOT DEMAND IT.
 *
 * The first version read only process.env and told anyone who ran it without
 * exporting the variable first that the key was not set. I had been
 * exporting it by hand in every run, so the tool looked like it worked while
 * being unrunnable for its actual user -- the same defect this repository
 * already recorded when the dashboard died on a missing STATE.json: a tool that
 * cannot run by default is a decoration.
 *
 * Sources in order of trust, and the run SAYS which one answered, because a key
 * from a stale .env and a key from the deployment are different facts.
 */
function resolveKey() {
  if (process.env.KIE_AI_API_KEY)
    return { key: process.env.KIE_AI_API_KEY, from: 'окружение' }

  const sh = cmd => {
    try {
      return execSync(cmd, {
        encoding: 'utf8',
        timeout: 60_000,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
    } catch {
      return ''
    }
  }

  try {
    const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
    const m = env.match(/^KIE_AI_API_KEY=(.+)$/m)
    if (m && m[1].trim()) return { key: m[1].trim(), from: '.env' }
  } catch {
    /* no .env is normal here: the project keeps 5 variables locally */
  }

  // The deployment is the most trustworthy source: it is what production uses.
  // Slow (a network round trip), so it comes after the cheap ones.
  const rail = sh(
    "railway variables -s vibee-render --kv 2>/dev/null | grep '^KIE_AI_API_KEY=' | cut -d= -f2-"
  )
  if (rail) return { key: rail, from: 'railway vibee-render' }

  const bot = sh(
    "railway variables -s 999-multibots-telegraf --kv 2>/dev/null | grep '^KIE_AI_API_KEY=' | cut -d= -f2-"
  )
  if (bot) return { key: bot, from: 'railway 999-multibots-telegraf' }

  const inf = sh('infisical secrets get KIE_AI_API_KEY --plain 2>/dev/null')
  if (inf) return { key: inf, from: 'infisical' }

  return { key: '', from: null }
}

const { key: KEY, from: KEY_FROM } = resolveKey()

/**
 * The function map, taken from kie.ai/market on 2026-08-31: fifteen categories.
 * Model ids come from this repository where it already names one, so a wrong id
 * here is a finding about OUR code rather than a typo invented in this file.
 */
const MODELS = [
  {
    fn: 'lip sync / talking head',
    model: 'veed/fabric-1',
    src: 'src/config/lipsync-models.config.ts (VEED_FABRIC, "kie.ai: 18 credits")',
    input: {},
  },
  {
    fn: 'text to video',
    model: 'wan/2-5-text-to-video',
    src: 'src/config/wan25-config.ts',
    input: {},
  },
  {
    fn: 'image to video',
    model: 'wan/2-5-image-to-video',
    src: 'src/config/wan25-config.ts',
    input: {},
  },
  {
    fn: 'image editing',
    model: 'google/nano-banana-edit',
    src: 'src/ (nano-banana-edit)',
    input: {},
  },
  {
    fn: 'text to image',
    model: 'google/nano-banana',
    src: 'kie.ai/market card "Nano Banana 2"',
    input: {},
  },
  {
    fn: 'text to speech',
    model: 'google/gemini-2-5-pro-tts',
    src: 'kie.ai/pricing "Gemini 2.5 Pro TTS"; id confirmed by probe 2026-08-31',
    input: {},
  },
  {
    fn: 'text to speech (flash)',
    model: 'google/gemini-3-1-flash-tts',
    src: 'id confirmed by probe: rejected with "speakers parameter cannot be empty"',
    input: {},
  },
  {
    fn: 'speech to text',
    model: 'elevenlabs/speech-to-text',
    src: 'id confirmed by probe: rejected with "audio_url is required"',
    input: {},
  },
  {
    fn: 'video upscale',
    model: 'topaz/video-upscale',
    src: 'id confirmed by probe: rejected with "video_url is required"',
    input: {},
  },
  {
    fn: 'video (seedance)',
    model: 'bytedance/seedance-2',
    src: 'kie.ai/market card "Seedance 2"; id seen only through a throttled reply',
    input: {},
  },
]

/** Everything that speaks to the network lives here, and it never throws. */
async function call(path, init = {}, ms = 20000) {
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), ms)
  try {
    const r = await fetch(`${BASE}${path}`, {
      ...init,
      signal: c.signal,
      headers: {
        Authorization: `Bearer ${KEY}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    })
    const text = await r.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {
      /* not JSON -- keep the text, it is still evidence */
    }
    return { status: r.status, json, text }
  } catch (e) {
    return { status: null, json: null, text: String(e.message || e) }
  } finally {
    clearTimeout(t)
  }
}

/**
 * THE BALANCE NUMBER IS A DELTA YARDSTICK, NOT A BUDGET.
 *
 * Measured 2026-08-31 within the same minute, on the SAME account (the key is
 * "tim", prefix c98141e4, listed on kie.ai/api-key):
 *   GET /api/v1/chat/credit  -> 7003.5, stable across every read for two hours
 *   kie.ai/billing headline   -> 7003 at 17:44, 663 at 17:45, 2042 at 19:21
 * The page figure moved by thousands while the transaction list's newest entry
 * is from 2025-11-25, and a balance cannot RISE without a purchase. So the two
 * are not the same quantity, and neither can be certified here as "the money
 * you may spend".
 *
 * What this function is still good for is the DIFFERENCE across one run: the
 * same metric read twice. That is what proves the probe cost nothing, and it is
 * corroborated independently by kie.ai/logs being empty -- zero tasks created,
 * therefore zero spend, whichever pool is authoritative.
 *
 * Do NOT size a content plan from this number. The hard protection is the
 * per-key Safe-Spend Limit on kie.ai/api-key, which the provider enforces and
 * our own bugs cannot bypass.
 */
async function credits() {
  const r = await call('/chat/credit', { method: 'GET' })
  const v = r.json && r.json.data
  return typeof v === 'number' ? v : null
}

/**
 * Classify one model's answer.
 *
 * The distinction that matters is between "the model is unknown" and "the input
 * was wrong": only the first is a defect on our side. The API does not use a
 * dedicated code for it, so the wording is inspected -- and every branch that
 * cannot be classified is reported as UNKNOWN rather than silently as a pass.
 */
function classify(r) {
  if (r.status === null)
    return { state: 'нет связи', detail: r.text.slice(0, 90) }
  const msg = String(
    (r.json && (r.json.msg || r.json.message)) || r.text
  ).slice(0, 160)
  const code = r.json && r.json.code

  // A task id coming back means a real generation started -- that is billable,
  // and this probe exists precisely to avoid it.
  const taskId =
    r.json && r.json.data && (r.json.data.taskId || r.json.data.task_id)
  if (taskId)
    return { state: 'BILLABLE', detail: `задача создана: ${taskId}`, taskId }

  /**
   * A RATE-LIMIT ANSWER IS "COULD NOT MEASURE", NOT "EXISTS".
   *
   * The first version had no branch for it, so "Your call frequency is too
   * high" fell through to the generic "the input was rejected" case and two
   * models were reported as PRESENT on the strength of a throttle message.
   * Measured 2026-08-31: probing 22 ids at once exceeded the documented ceiling
   * of 20 new requests per 10 seconds (kie.ai/billing) and produced exactly
   * that false positive. The classifier was making the mistake the probe exists
   * to prevent.
   */
  if (
    /frequency is too high|rate limit|too many requests/i.test(msg) ||
    r.status === 429
  )
    return { state: 'НЕ ИЗМЕРЕНО', detail: `ограничение частоты: ${msg}` }
  if (
    /model|not found|not support|unknown|unavailable/i.test(msg) &&
    code !== 200
  )
    return { state: 'модель не принята', detail: msg }
  if (code === 401 || r.status === 401)
    return { state: 'ключ отвергнут', detail: msg }
  if (code === 402 || /credit|balance|insufficient/i.test(msg))
    return { state: 'нет кредитов', detail: msg }
  if (r.status >= 400 || (typeof code === 'number' && code !== 200))
    return { state: 'модель ЕСТЬ', detail: `ввод отклонён: ${msg}` }
  return { state: 'непонятно', detail: `HTTP ${r.status} ${msg}` }
}

const before = await credits()
if (before === null) {
  const m = KEY
    ? `баланс не прочитан (ключ из: ${KEY_FROM})`
    : 'ключ не найден: ни в окружении, ни в .env, ни в railway, ни в infisical'
  if (JSON_OUT) console.log(JSON.stringify({ error: m }))
  else console.error(`\n  ?    НЕ ИЗМЕРЕНО: ${m}\n`)
  process.exit(2)
}

// All models at once: the account allows 20 new requests per 10 seconds
// (kie.ai/billing, "Rate Limit"), and eight rejected calls are far under that.
// Sequential probing took the run past a minute for no benefit.
const WAVE = 10 // under the documented 20 per 10 s, with room for the two
// balance reads that bracket the run
const rows = []
for (let i = 0; i < MODELS.length; i += WAVE) {
  if (i) await new Promise(r => setTimeout(r, 10_500))
  const wave = await Promise.all(
    MODELS.slice(i, i + WAVE).map(async m => {
      const started = Date.now()
      const r = await call('/jobs/createTask', {
        method: 'POST',
        body: JSON.stringify({ model: m.model, input: m.input }),
      })
      return { ...m, ...classify(r), ms: Date.now() - started }
    })
  )
  rows.push(...wave)
}

const after = await credits()
const spent = before - after

if (JSON_OUT) {
  console.log(JSON.stringify({ before, after, spent, rows }, null, 2))
} else {
  const paint = (c, s) => `[${c}m${s}[0m`
  console.log(`\nКРЕДИТЫ ДО: ${before}   (ключ из: ${KEY_FROM})`)
  console.log(
    '  ↳ это счётчик /chat/credit; на kie.ai/billing в ту же минуту стояло другое число — как БЮДЖЕТ не использовать\n'
  )
  for (const r of rows) {
    const colour =
      r.state === 'модель ЕСТЬ' ? '32' : r.state === 'BILLABLE' ? '31' : '33'
    const mark =
      r.state === 'модель ЕСТЬ'
        ? ' OK '
        : r.state === 'BILLABLE'
          ? ' ДЕНЬГИ '
          : '  ?  '
    console.log(
      paint(
        colour,
        `  ${mark} ${r.fn.padEnd(24)} ${r.model.padEnd(30)} ${r.state}`
      )
    )
    console.log(`         ${r.detail}`)
  }
  console.log(`\nКРЕДИТЫ ПОСЛЕ: ${after}  (потрачено: ${spent.toFixed(2)})`)
  if (spent > 0)
    console.log(
      paint(
        '31',
        '  ⚠  ПРОБА СТОИЛА ДЕНЕГ. Она задумана бесплатной — это дефект пробы.'
      )
    )
  console.log('')
}

const billable = rows.filter(r => r.state === 'BILLABLE')
const broken = rows.filter(
  r => r.state !== 'модель ЕСТЬ' && r.state !== 'BILLABLE'
)
process.exit(billable.length || broken.length ? 1 : 0)
