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

const KEY = process.env.KIE_AI_API_KEY || ''
const BASE = 'https://api.kie.ai/api/v1'
const JSON_OUT = process.argv.includes('--json')

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
  const m = KEY ? 'баланс не прочитан' : 'KIE_AI_API_KEY не задан'
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
  console.log(`\nКРЕДИТЫ ДО: ${before}\n`)
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
