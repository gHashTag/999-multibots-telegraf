/**
 * Выбор модели для агента. Два провайдера с ОДНИМ протоколом.
 *
 * z.ai (GLM) и OpenAI оба говорят на диалекте /chat/completions, поэтому
 * различие сводится к базовому адресу, имени переменной с ключом и одному
 * полю: у GLM режим размышления включается блоком `thinking`, у OpenAI его
 * нет вовсе.
 *
 * ПОЧЕМУ НЕ «просто OpenAI». Владелец просил кодерскую модель z.ai и видимый
 * поток размышления. GLM отдаёт reasoning_content отдельным полем — его можно
 * показывать человеку по мере поступления, а не после того, как всё
 * досчиталось. У OpenAI такого поля в этом API нет, и притворяться, что есть,
 * значит показывать пустую панель «думает».
 *
 * ПОЧЕМУ ОТКАЗ ГРОМКИЙ. Пустой ключ уезжал бы к провайдеру и возвращался
 * невнятной 400 через три вызова. Здесь он падает на первой строке с именем
 * переменной и командой, которой её взять.
 */

import { chosenProvider } from './provider-choice'
import * as SPEC from '../spec/agent-provider-chain.gen'

export type ProviderId =
  | 'zai'
  | 'kie'
  | 'zai-lite'
  | 'nemotron'
  | 'reserve'
  | 'ollama'

export interface Provider {
  id: ProviderId
  base: string
  model: string
  key: string
  /**
   * ROTATION OF KEYS: the route's whole pool in rotation order, with `key`
   * as its head. The pool is assembled from variables (providerKeys): a
   * variable's value may list several keys separated by commas or
   * semicolons, a plural sister variable (GLM_API_KEYS) adds a whole pool,
   * and numbered sisters (GLM_API_KEY_2 .. _9) add one each. A one-key pool
   * repeats `key` and everything behaves exactly as before.
   */
  keys?: readonly string[]
  /** Умеет ли отдавать поток размышления отдельным полем. */
  thinking: boolean
  /**
   * Can this model be TRUSTED to call a tool when the brief says so?
   *
   * Production 2026-09-08..10, the seller's proactive sweep: the answer came
   * back as `[[Подпись|crm_leads]]`, `[[Подпись|no_one_available]]`,
   * `[[Подпись|tg_send]]` -- fifteen characters, the name of the tool inside
   * the button-marker template, zero tool calls. That is the signature of a
   * small model handed a tool schema: it writes the tool's name where it
   * learnt to write a marker. Nothing in the log said which model answered,
   * so three prompt repairs went in blind.
   *
   * `false` here does not disable the provider for chat -- a small model that
   * talks is better than silence for a person at the keyboard. It excludes
   * the provider from turns that ask for `toolsOnly`, where a turn without a
   * tool call is by definition a failure and a chatty fallback only hides it.
   */
  tools: boolean
  /**
   * Can this model actually LOOK at an image?
   *
   * Measured against the live endpoints on 2026-09-07, not read off the model
   * name. Both z.ai models refuse the shape outright:
   *
   *   HTTP 400 {"code":"1210","message":"messages.content.type is invalid,
   *             allowed values: ['text']"}
   *
   * and the coding endpoint's catalogue has no vision model to switch to --
   * ten ids, glm-4.5 through glm-5.3-flash, all text. Nemotron answered 200
   * and named the colour of a solid-red and a solid-blue PNG differently, so
   * it is reading pixels rather than guessing.
   */
  vision: boolean
  /**
   * Can this model HEAR an attached recording?
   *
   * Kept apart from `vision` on purpose. Today one provider happens to do both,
   * so a single flag would work and would be a coincidence -- the next provider
   * with sight and no hearing would silently send voice to a model that cannot
   * listen, and the person would get a confident answer about nothing.
   *
   * Measured the same way: nemotron transcribed a generated sentence word for
   * word from ogg, mp3, wav and m4a. The z.ai models refuse any non-text part.
   */
  audio: boolean
  /** Tokens the model can hold at once; decides how many tools it is shown. */
  context: number
  /** A small context: the seller's tools only, not all sixty-odd. */
  compact: boolean
  /**
   * Ceiling on the answer, sent as `max_tokens`. Set for the reserve and Kie
   * routes only (spec: agent-provider-chain.t27 `ceiling_for`).
   *
   * Measured 2026-09-15 against OpenRouter: with no max_tokens the vendor
   * priced the model ceiling (16000) against the prepaid balance (2506
   * affordable) and answered 402 before reading the prompt. The other
   * providers keep their own defaults -- their keys are not prepaid per call.
   */
  maxTokens?: number
  /**
   * Set when another provider in the chain calls the same base with the same
   * key: the id of the first such provider, the same label on every member.
   * A key-wide limit on one member is then a limit on all of them for the
   * rest of the turn (isKeyWideLimit). Never the key itself.
   */
  keyGroup?: ProviderId
}

/**
 * Below this window the full tool catalogue is shown to nobody. Measured on
 * the live service, 2026-09-08: prompt ~4.8k tokens + all 63 tool schemas
 * ~8.8k + the owner's conversation = past 16k, and a 16k qwen3 answered a
 * one-line question in 68 seconds, most of it reading the catalogue. The
 * seller's kit (~3k) beside the prompt leaves room for the conversation.
 */
export const COMPACT_BELOW = 24_000

/**
 * OUR OWN MODEL. queen-ollama on the project's private network, spoken to
 * over Ollama's OpenAI-compatible /v1 -- no key, no bill. It is always in
 * the chain (last, the safety net when every paid provider is down) and
 * first when AGENT_PROVIDER=ollama. Present only where it is reachable:
 * OLLAMA_BASE_URL says so explicitly, and inside the Railway project the
 * reference variable to the service says so implicitly.
 */
const OLLAMA_PRIVATE = 'http://queen-ollama.railway.internal:11434/v1'
function ollamaEnabled(): boolean {
  return Boolean(
    process.env.OLLAMA_BASE_URL ||
      process.env.RAILWAY_SERVICE_QUEEN_OLLAMA_URL ||
      process.env.OLLAMA_ENABLED
  )
}
function ollamaContext(): number {
  const n = Number(
    process.env.OLLAMA_CONTEXT_LENGTH || process.env.OLLAMA_NUM_CTX
  )
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 4096
}

/**
 * The endpoint base as the loop will use it: `${base}/chat/completions`.
 *
 * A trailing slash on the variable is not harmless. NVIDIA's gateway answers
 * `/v1//chat/completions` -- and `/v1/chat/completions/chat/completions`,
 * when the whole path was pasted into the variable -- with a bare Go
 * `404 page not found`, while the same key on the clean path works.
 * Measured 2026-09-10 after the CRM sweep reported exactly that text from
 * nemotron. A slash added in a dashboard must not remove a provider from
 * the chain, so the base is trimmed here, once, for every provider.
 */
export function endpointBase(
  raw: string | undefined,
  fallback: string
): string {
  const v = (raw || '').trim() || fallback
  return v.replace(/\/+$/, '').replace(/\/chat\/completions$/, '')
}

const CATALOG: Record<
  ProviderId,
  {
    base: string
    /**
     * Where the key is read: the first variable in the list that is set.
     * Empty for ollama (no key) and unused for reserve (reserveEnv). The
     * kie base and model are set per process in build (kieModel).
     */
    env: readonly string[]
    model: string
    thinking: boolean
    tools: boolean
    vision: boolean
    audio: boolean
    context: number
  }
> = {
  // z.ai — КОДЕРСКИЙ эндпоинт, а не обычный pay-as-you-go.
  //
  // Это не деталь. Ключи проекта — от кодерской подписки GLM, и она живёт на
  // /api/coding/paas/v4. Обычный /api/paas/v4 биллит поштучно и на этих
  // ключах отвечает 429 «Insufficient balance» (код 1113) — что и выглядело
  // как «баланс 0», хотя подписка активна. Проверено 2026-08-23 на пяти
  // ключах: на обычном эндпоинте 0 из 5, на кодерском 4 из 5.
  // Адрес всё равно вынесен в переменную ZAI_BASE_URL на случай смены.
  zai: {
    base: endpointBase(
      process.env.ZAI_BASE_URL,
      'https://api.z.ai/api/coding/paas/v4'
    ),
    env: ['GLM_API_KEY'],
    // The FREE flash models, owner's rule 2026-10-04. Measured that day on a
    // key with zero balance: glm-5.3 and glm-4.5 answer 1113 "Insufficient
    // balance" on both endpoints, glm-4.5-flash and glm-4.7-flash answer 200
    // with tool calls, thinking on or off. A busy free tier says 1305
    // "overloaded", which is why zai-lite runs the OTHER flash model.
    // Skill: zai-free-flash.
    model: 'glm-4.7-flash',
    thinking: true,
    tools: true,
    // 400 code 1210: allowed values: [text]. Measured 2026-09-07.
    vision: false,
    audio: false,
    context: 128_000,
  },
  /**
   * KIE -- the second leg (agent-provider-chain.t27 v3, 2026-10-09).
   *
   * The owner's turn that day ended in "no model provider answered": zai
   * 1305, nemotron silent for the 120 s ceiling, zai-lite silent 60 s,
   * reserve 402 -- three minutes and nothing. Kie is the vendor the project
   * already pays for every image, video, song and voice, and it serves
   * Gemini over an OpenAI-compatible /chat/completions at
   * https://api.kie.ai/<model>/v1. So: the free zai first, then a funded
   * route on a DIFFERENT vendor, before the two that burned the minutes.
   *
   * gemini-2.5-flash by default: Gemini 3 wants its thought signatures sent
   * back on every tool round, and this loop does not carry them.
   * KIE_CHAT_MODEL switches the model without a commit. Tools are declared
   * by Kie's docs, not measured here; sight and hearing are not declared,
   * so images keep going to nemotron.
   */
  kie: {
    base: '',
    env: [SPEC.KIE_ENV_KEY],
    model: SPEC.KIE_MODEL_DEFAULT,
    thinking: SPEC.KIE_THINKING,
    tools: SPEC.KIE_TOOLS,
    vision: SPEC.KIE_VISION,
    audio: SPEC.KIE_AUDIO,
    context: 128_000,
  },
  /**
   * Запасной — ТОЖЕ z.ai, только более лёгкой моделью.
   *
   * Раньше здесь стоял OpenAI, и это был единственный запасной вариант. Замер
   * 2026-08-26: ключ OpenAI отвечает 401 «Incorrect API key provided», то
   * есть запасного пути не существовало вовсе — при отказе основной модели
   * агент просто молчал. Владелец сказал прямо: «у нас z.ai».
   *
   * Подписка кодерская и живёт на том же эндпоинте, поэтому запасной путь
   * ничего не стоит: та же аутентификация, другая модель. glm-4.5-flash is
   * free like glm-4.7-flash and still answers when that one is overloaded.
   *
   * ITS OWN KEY, WHEN THERE IS ONE. vibee-render production logs, 2026-10-06
   * 05:00-11:32 UTC: zai answered 429 (rate limit) 33 times,
   * zai-lite 6 times, and 15 of 45 turns ended in error. z.ai counts limits
   * per key, and both routes read GLM_API_KEY, so on a key-wide limit the
   * fallback hits the same wall as the route it stands in for.
   * ZAI_LITE_API_KEY gives it a key of its own; unset, it reads GLM_API_KEY
   * exactly as before, so nothing changes until the owner sets the variable.
   */
  'zai-lite': {
    base: endpointBase(
      process.env.ZAI_BASE_URL,
      'https://api.z.ai/api/coding/paas/v4'
    ),
    env: ['ZAI_LITE_API_KEY', 'GLM_API_KEY'],
    model: 'glm-4.5-flash',
    thinking: false,
    tools: true,
    // Same endpoint, same refusal.
    vision: false,
    audio: false,
    context: 128_000,
  },
  /**
   * NVIDIA NIM — запасной, когда z.ai упирается в лимит.
   *
   * Заведён 06.09.2026 по живому отказу: владелец написал боту вопрос и не
   * получил ответа, потому что не отозвался НИ ОДИН провайдер — у zai и
   * zai-lite «превышен лимит запросов», у openai «ключ недействителен». Два
   * запасных пути, ведущих в один и тот же z.ai, запасными не были.
   *
   * ИМЯ МОДЕЛИ ВЫЯСНЕНО У САМОГО NVIDIA, а не выбрано по названию: из восьми
   * моделей с «nemotron» в имени этому аккаунту доступна ровно одна.
   * llama-3.1-nemotron 51b/70b/ultra отвечают 404 «Not found for account».
   * Проверено и главное: она умеет вызывать ИНСТРУМЕНТЫ — без этого агент
   * превращается в собеседника, который ничего не может сделать.
   */
  nemotron: {
    base: endpointBase(
      process.env.NVIDIA_BASE_URL,
      'https://integrate.api.nvidia.com/v1'
    ),
    env: ['NVIDIA_API_KEY'],
    model: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
    thinking: false,
    // Checked at NVIDIA when it was added: it calls tools (see above).
    tools: true,
    // Answers 200 with an image part, and streaming plus tool schemas work
    // alongside it. The only sighted provider configured here.
    vision: true,
    // Transcribes ogg, mp3, wav and m4a -- but ONLY via `audio_url`.
    // `input_audio` returns 200 and silently ignores the sound.
    audio: true,
    context: 128_000,
  },
  /**
   * RESERVE -- a fourth, independent route the owner points at any
   * OpenAI-compatible vendor with three variables (agent-provider-chain.t27).
   *
   * Why it exists: 2026-09-13, three duet runs and the business bot before
   * them died with EVERY paid provider at a limit -- z.ai twice (glm-5.3 and
   * glm-4.5 share one subscription and one limit) and NVIDIA "Worker local
   * total request limit reached (16/16)". Two of three routes lead to the
   * same wall; the third has its own. A route to a different vendor is the
   * only thing that helps, and which vendor is the owner's call, not this
   * file's.
   *
   * DECLARED, NOT MEASURED. `tools` and `vision` below are what the owner
   * says about the model in RESERVE_TOOLS / RESERVE_VISION, not something
   * this repository checked against the endpoint. Base, model and key are
   * read when the chain is built, so a variable added on Railway is seen on
   * the next process, no code change. All three or the route is absent.
   */
  reserve: {
    base: '',
    env: ['RESERVE_API_KEY'],
    model: '',
    thinking: false,
    tools: true,
    vision: false,
    audio: false,
    context: 128_000,
  },
  ollama: {
    base: endpointBase(process.env.OLLAMA_BASE_URL, OLLAMA_PRIVATE),
    env: [],
    model: process.env.OLLAMA_MODEL || 'qwen3:1.7b',
    thinking: false,
    // A 1.7B model writes tool names into markers instead of calling them.
    // Fine as the last voice for a person; not for an unattended sweep.
    tools: false,
    vision: false,
    audio: false,
    context: ollamaContext(),
  },
}

/**
 * ВСЕ настроенные провайдеры по порядку предпочтения.
 *
 * Нужны именно все, а не первый попавшийся: ключ может быть ЗАДАН и при этом
 * не работать. Измерено 2026-08-23 на живых ключах проекта:
 *   z.ai   — ключ валиден, но баланс нулевой: 429, код 1113
 *            «Insufficient balance or no resource package»;
 *   OpenAI — 401 «Incorrect API key provided».
 * Провайдер, выбранный по наличию переменной, в обоих случаях дал бы отказ,
 * а человек увидел бы «агент не отвечает» без единой подсказки почему.
 * Поэтому петля перебирает их и собирает причины отказа по каждому.
 */
/** Where a provider is available at all, key or not. */
function available(id: ProviderId): { key: string } | null {
  const c = CATALOG[id]
  if (id === 'ollama') return ollamaEnabled() ? { key: 'ollama' } : null
  if (id === 'reserve') {
    const r = reserveEnv()
    return r ? { key: r.key } : null
  }
  const key = keyFrom(c.env)
  return key ? { key } : null
}

/**
 * The value of the first variable in `names` that is set and not blank.
 * Exported for tests; the value is a secret and is never logged.
 */
export function keyFrom(names: readonly string[]): string | undefined {
  for (const name of names) {
    const v = process.env[name]
    // A blank variable is "not set": an empty ZAI_LITE_API_KEY on the
    // dashboard must fall through to GLM_API_KEY, not drop the route.
    if (v && v.trim()) return v
  }
  return undefined
}

/**
 * The GLM-facing view of the pool (#4048): the primary first, then
 * GLM_API_KEYS, blanks and duplicates dropped. providerKeys('zai') reads the
 * same variable plus the numbered sisters; this narrower door stays because
 * the operator's runbook names GLM_API_KEYS and its test pins the order.
 */
export function glmPoolKeys(primary: string): string[] {
  const out = [primary]
  for (const k of splitKeys(process.env.GLM_API_KEYS || ''))
    if (!out.includes(k)) out.push(k)
  return out
}

/**
 * ROTATION OF KEYS.
 *
 * 2026-10-26 16:09 UTC, a live outage: every route ran out of its own
 * resource at once -- zai 429 code 1305, nemotron "ResourceExhausted:
 * Worker local total request limit reached (16/16)", reserve and kie
 * "ключ недействителен" // cyrillic-ok: quoted refusal text, zai-lite "на
 * ключе нет средств" // cyrillic-ok: quoted refusal text -- and the chain
 * ended, while the owner's vendor consoles held more keys than the one
 * variable each route read. Until this day a route read EXACTLY ONE key
 * from one variable: restarting it meant reissuing the key by hand and
 * rewriting a Railway variable while a person was waiting for an answer.
 *
 * A route now carries as many keys as the owner wrote:
 *   -- the primary variable's value may list keys separated by commas,
 *      semicolons or spaces (GLM_API_KEY="k1,k2,k3");
 *   -- the plural sister variable adds a whole pool
 *      (GLM_API_KEYS="k1,k2" -- the same as above);
 *   -- numbered sisters add one each (GLM_API_KEY_2 .. GLM_API_KEY_9).
 * A refusal that is THE KEY's fault -- this key's rate limit, an invalid
 * key, no funds, NVIDIA's account ceiling -- moves the route to its next
 * key (chat.ts) before the chain moves to the next provider. The cursor
 * holds the last key that answered and lives in this process's memory: a
 * restart returns to the first key, exactly like the breaker.
 *
 * WHAT DOES NOT ROTATE. 1305 is "the model is busy for everybody"
 * (measured 2026-10-06): another key of the same route hits the same wall,
 * and the way round it is the neighbouring model, as before. A nameless
 * 429, a timeout and a 404 are not the key's fault: rotation would only
 * pay for extra calls. isKeyFailure lists the measured cases only; an
 * unmeasured one costs one quick extra call, a wrongly rotating one costs
 * the answer that would have been.
 */

/** How many numbered sisters (_2 .. _9) are read for each variable. */
export const KEY_POOL_SLOTS = 9 // t27-plumbing: how many numbered key variables exist on Railway, config not a rule

/** Keys inside one variable's value: commas, semicolons and spaces split. */
function splitKeys(raw: string | undefined): string[] {
  return (raw || '')
    .split(/[\s,;]+/)
    .map(s => s.trim())
    .filter(Boolean)
}

/**
 * The route's whole pool in declaration order: each variable from `env`
 * (its value may list several keys), then its plural sister NAME_KEYS,
 * then the numbered sisters NAME_2 .. NAME_9. Duplicates and blanks are
 * dropped. Key values are never logged.
 */
export function providerKeys(id: ProviderId): string[] {
  const c = CATALOG[id]
  const names: readonly string[] =
    id === 'reserve' ? ['RESERVE_API_KEY'] : id === 'ollama' ? [] : c.env
  const pool: string[] = []
  const push = (k: string) => {
    if (k && !pool.includes(k)) pool.push(k)
  }
  for (const name of names) {
    for (const k of splitKeys(process.env[name])) push(k)
    // The plural sister: GLM_API_KEY -> GLM_API_KEYS, KIE_AI_API_KEY ->
    // KIE_AI_API_KEYS. A whole extra pool in one variable.
    for (const k of splitKeys(process.env[name.replace(/KEY$/, 'KEYS')]))
      push(k)
    for (let i = 2; i <= KEY_POOL_SLOTS; i++)
      for (const k of splitKeys(process.env[`${name}_${i}`])) push(k)
  }
  return pool
}

/** The rotation cursor: the pool index this route starts from. */
const keyCursor = new Map<ProviderId, number>()

/**
 * The pool in rotation order: from the cursor, wrapping around. Fewer than
 * two keys -- no rotation; a cursor past the pool's end (the key was
 * removed on Railway) wraps by modulo instead of crashing.
 */
export function keyChain(id: ProviderId): string[] {
  const pool = providerKeys(id)
  if (pool.length < 2) return pool
  const at = keyCursor.get(id) ?? 0
  const off = ((at % pool.length) + pool.length) % pool.length
  return [...pool.slice(off), ...pool.slice(0, off)]
}

/**
 * The verdict on one key (chat.ts): success -- start from it next turn,
 * a key-class refusal -- start past it. A key that is no longer in the
 * pool (the variables changed) moves nothing.
 */
export function rememberKey(
  id: ProviderId,
  key: string,
  worked: boolean
): void {
  const pool = providerKeys(id)
  const at = pool.indexOf(key)
  if (at < 0) return
  keyCursor.set(id, worked ? at : (at + 1) % pool.length)
}

/** For tests: forget the rotation cursors. */
export function forgetKeyRotationForTests(): void {
  keyCursor.clear()
}

/**
 * A refusal that is THE KEY's fault -- the reason to try this route's next
 * key. Takes a ready reason line (diagnose()/notAStream() or a mid-stream
 * error text): 401 "ключ недействителен" // cyrillic-ok: quoted refusal
 * text, 402/1113 "на ключе нет средств" // cyrillic-ok: quoted refusal
 * text, z.ai code 1302 -- THIS key's rate limit (measured 2026-10-06: the
 * production key answered 1302 three out of three while three other
 * accounts' keys answered 200 on the same model), NVIDIA ResourceExhausted
 * "request limit reached" -- the account ceiling (16/16, 2026-09-13 and
 * 2026-10-26). 1305, a nameless 429, a timeout and a 404 are false here on
 * purpose -- see the rotation block above.
 */
// t27-plumbing: classifies an already-produced refusal line for routing, it decides nothing by itself
export function isKeyFailure(reason: string): boolean {
  const b = (reason || '').toLowerCase()
  return (
    b.includes('ключ недействителен') ||
    b.includes('на ключе нет средств') ||
    b.includes('insufficient balance') ||
    b.includes('requires more credits') ||
    b.includes('code 1302') ||
    b.includes('resourceexhausted') ||
    b.includes('request limit reached')
  )
}

/**
 * The order providers are tried in: the paid ones first by default, our
 * own model last as the safety net. AGENT_PROVIDER moves any of them to
 * the front; the rest keep their order behind it. This is the WANTED order;
 * `providerChain` drops absent providers and demotes a head without tools.
 */
export function providerOrder(): ProviderId[] {
  // The owner's choice from the bot, then the deploy-time variable.
  const wanted = (
    chosenProvider() ||
    process.env.AGENT_PROVIDER ||
    ''
  ).toLowerCase() as ProviderId
  const DEFAULT_ORDER = SPEC.ORDER_DEFAULT.split(',') as ProviderId[]
  return DEFAULT_ORDER.includes(wanted)
    ? [wanted, ...DEFAULT_ORDER.filter(id => id !== wanted)]
    : DEFAULT_ORDER
}

/**
 * The provider AGENT_MODEL was written for: the deploy-time AGENT_PROVIDER,
 * or the default head of the chain when none is set. A choice the owner
 * makes later from the bot must NOT inherit that name -- measured
 * 2026-09-13: owner picked nemotron, AGENT_MODEL=glm-5.3 went to NVIDIA,
 * whose gateway answers an unknown model with a bare `404 page not found`;
 * every nemotron turn and every image/audio description died on it.
 */
function envModelOwner(): ProviderId {
  const env = (process.env.AGENT_PROVIDER || '').toLowerCase() as ProviderId
  return env in CATALOG ? env : 'zai'
}

/**
 * The reserve route, or null unless RESERVE_BASE_URL, RESERVE_API_KEY and
 * RESERVE_MODEL are ALL set. Read per call: the owner adds the variables on
 * Railway, the next process has the route.
 */
export function reserveEnv(): {
  base: string
  key: string
  model: string
  tools: boolean
  vision: boolean
  maxTokens: number
} | null {
  const base = (process.env.RESERVE_BASE_URL || '').trim()
  const key = (process.env.RESERVE_API_KEY || '').trim()
  const model = (process.env.RESERVE_MODEL || '').trim()
  if (!base || !key || !model) return null
  return {
    base: endpointBase(base, base),
    key,
    model,
    tools: process.env.RESERVE_TOOLS !== '0',
    vision: process.env.RESERVE_VISION === '1',
    maxTokens: reserveMaxTokens(process.env.RESERVE_MAX_TOKENS),
  }
}

/**
 * The Kie chat model: KIE_CHAT_MODEL when set, else the spec's default. It is
 * part of the PATH (api.kie.ai/<model>/v1), so AGENT_MODEL -- a GLM name --
 * never renames it (spec KIE_TAKES_AGENT_MODEL = false).
 */
export function kieModel(): string {
  return (
    (process.env[SPEC.KIE_ENV_MODEL] || '').trim() || SPEC.KIE_MODEL_DEFAULT
  )
}

/** Spec: agent-provider-chain.t27 RESERVE_MAX_TOKENS_DEFAULT. */
export const RESERVE_MAX_TOKENS_DEFAULT = SPEC.RESERVE_MAX_TOKENS_DEFAULT

/**
 * RESERVE_MAX_TOKENS as a positive integer, else the default. "0", "-5",
 * "abc" and "" all mean "the owner did not say" -- a zero ceiling would make
 * every answer empty, which is worse than the default.
 */
export function reserveMaxTokens(raw: string | undefined): number {
  const n = Number.parseInt((raw || '').trim(), 10)
  return Number.isFinite(n) && n > 0 ? n : RESERVE_MAX_TOKENS_DEFAULT
}

function build(id: ProviderId, key: string): Provider {
  const c = CATALOG[id]
  // The pool in rotation order; `key` (the first set variable) is only the
  // fallback head when the pool is somehow empty. The cursor inside keyChain
  // is what makes every other consumer of Provider.key (duet, media, voice)
  // start from the key that answered last, not from a dead one.
  const keys = keyChain(id)
  if (id === 'reserve') {
    const r = reserveEnv()!
    return {
      id,
      base: r.base,
      model: r.model,
      key: keys[0] || r.key,
      keys: keys.length ? keys : [r.key],
      thinking: c.thinking,
      tools: r.tools,
      vision: r.vision,
      audio: c.audio,
      context: c.context,
      compact: c.context < COMPACT_BELOW,
      maxTokens: r.maxTokens,
    }
  }
  if (id === 'kie') {
    const model = kieModel()
    return {
      id,
      base: endpointBase(undefined, `${SPEC.KIE_BASE_ROOT}/${model}/v1`),
      model,
      key: keys[0] || key,
      keys: keys.length ? keys : [key],
      thinking: c.thinking,
      tools: c.tools,
      vision: c.vision,
      audio: c.audio,
      context: c.context,
      compact: c.context < COMPACT_BELOW,
      maxTokens: SPEC.KIE_MAX_TOKENS,
    }
  }
  // Our model's name comes from OLLAMA_MODEL; AGENT_MODEL is the paid
  // providers' override and must not rename an Ollama tag by accident.
  const model =
    id === 'ollama'
      ? c.model
      : (id === envModelOwner() && process.env.AGENT_MODEL) || c.model
  return {
    id,
    base: c.base,
    model,
    key: keys[0] || key,
    keys: keys.length ? keys : [key],
    thinking: c.thinking,
    tools: c.tools,
    vision: c.vision,
    audio: c.audio,
    context: c.context,
    compact: c.context < COMPACT_BELOW,
  }
}

/**
 * A HEAD WITHOUT TOOLS IS DEMOTED (#3659, spec agent-provider-chain.t27 v2).
 * 2026-10-05: AGENT_PROVIDER=ollama put qwen3:1.7b (tools: false) at the
 * head of every chat turn, and the agent "made the poster" without calling a
 * single tool. The bot button is the owner's explicit pick and still wins;
 * any other head that cannot call tools (the variable, or the default order
 * once absent providers drop out) moves right behind the first provider that
 * can. A chain where nobody calls tools keeps its order. Mirrors the spec's
 * `demote_head`, `head_note` and `demoted_index`.
 */
export function demoteHead(
  fromBot: boolean,
  headTools: boolean,
  anyTools: boolean
): boolean {
  return !fromBot && !headTools && anyTools
}

export function headNote(
  fromBot: boolean,
  headTools: boolean,
  anyTools: boolean
): string {
  if (headTools) return SPEC.NOTE_NONE
  if (fromBot) return SPEC.NOTE_BOT_PICK
  if (anyTools) return SPEC.NOTE_DEMOTED
  return SPEC.NOTE_NO_TOOLS
}

/** `restIndex`: the first tools-capable provider's index without the head. */
export function demotedIndex(restIndex: number): number {
  return restIndex + 1
}

/**
 * Label providers that share a key on the same base (see `keyGroup`).
 * Today that is zai and zai-lite while ZAI_LITE_API_KEY is unset.
 */
function markKeyGroups(chain: Provider[]): void {
  for (const p of chain) {
    const first = chain.find(q => q.base === p.base && q.key === p.key)
    if (first && first !== p) {
      first.keyGroup = first.id
      p.keyGroup = first.id
    }
  }
}

/**
 * z.ai codes that mean THIS KEY is limited, not the model.
 *
 * Measured 2026-10-06 on the coding endpoint: the production key answered
 * 1302 three times out of three even on glm-4.5-flash, while three other
 * accounts' keys answered 200 on that model -- a per-key limit, so another
 * route on the same key is the same wall. 1305 is the opposite: "model
 * overloaded" for everybody, returned by glm-4.7-flash on 3 of 4 accounts --
 * a different model on the same key is exactly the way round it, so 1305
 * must NOT skip zai-lite. Only measured codes are listed; an unlisted code
 * costs one quick extra call, a wrongly listed one costs a fallback that
 * would have answered.
 */
export const KEY_WIDE_LIMIT_CODES: readonly string[] = ['1302']

export function isKeyWideLimit(status: number, body: string): boolean {
  if (status !== 429) return false
  const code = vendorCode(body)
  return !!code && KEY_WIDE_LIMIT_CODES.includes(code)
}

/** The line a skipped key-sharing provider is logged with. */
export function sharedKeyReason(id: ProviderId, limited: ProviderId): string {
  return `${id}: shares ${limited}'s key, same limit -- not asked this turn`
}

/** The available chain, head rule applied, and what to say about its head. */
export function providerChain(): { chain: Provider[]; note: string } {
  const out: Provider[] = []
  for (const id of providerOrder()) {
    const have = available(id)
    if (!have) continue
    out.push(build(id, have.key))
  }
  markKeyGroups(out)
  const head = out[0]
  if (!head) return { chain: out, note: SPEC.NOTE_NONE }
  const fromBot = chosenProvider() === head.id
  const rest = out.slice(1)
  const firstTools = rest.findIndex(p => p.tools)
  const anyTools = firstTools >= 0
  const note = headNote(fromBot, head.tools, anyTools)
  if (!demoteHead(fromBot, head.tools, anyTools)) return { chain: out, note }
  const at = demotedIndex(firstTools)
  return { chain: [...rest.slice(0, at), head, ...rest.slice(at)], note }
}

export function allProviders(): Provider[] {
  return providerChain().chain
}

/**
 * The vendor's numeric error code in an error body, or null.
 *
 * WHY. The logs of 2026-10-06 (05:00-11:32 UTC) hold 33 zai and 6 zai-lite
 * 429s as the bare line "limit exceeded", and z.ai puts very different things
 * behind that one status: 1302/1303 are this key's request rate, 1305 is the
 * free model being overloaded for everybody. The first is shared by every
 * route on the key, the second is not -- zai-lite runs the other flash model
 * precisely for 1305. Without the code nobody can tell from the log whether a
 * shared key is the wall, so the code rides along. Only the code: the body is
 * the vendor's text and never carries the key.
 */
export function vendorCode(body: string): string | null {
  const m = /"code"\s*:\s*"?(\d{3,5})"?/.exec(body || '')
  return m ? m[1] : null
}

export function diagnose(id: ProviderId, status: number, body: string): string {
  const b = body.toLowerCase()
  // 402 is the vendor's own word for it; OpenRouter says "requires more
  // credits" (measured 2026-09-15), z.ai says code 1113. Spec:
  // agent-provider-chain.t27 PAYMENT_REQUIRED_IS_DIAGNOSED.
  if (
    status === 402 ||
    b.includes('insufficient balance') ||
    b.includes('requires more credits') ||
    b.includes('1113')
  ) {
    return `${id}: на ключе нет средств — пополните баланс в кабинете провайдера`
  }
  if (
    status === 401 ||
    b.includes('incorrect api key') ||
    b.includes('invalid api key')
  ) {
    return `${id}: ключ недействителен — перевыпустите и обновите переменную`
  }
  if (status === 404 && b.includes('model')) {
    return id === 'ollama'
      ? `${id}: такой модели нет на queen-ollama — ollama pull ${process.env.OLLAMA_MODEL || 'qwen3:1.7b'} или поправьте OLLAMA_MODEL`
      : `${id}: такой модели нет — проверьте AGENT_MODEL`
  }
  if (status === 429) {
    const code = vendorCode(body)
    return `${id}: превышен лимит запросов` + (code ? ` (code ${code})` : '')
  }
  if (status === 404 && b.trim() === '404 page not found') {
    // Measured 2026-09-13 against integrate.api.nvidia.com with NO base URL
    // override: GET /v1/models answers 200 with the catalogue, a POST with a
    // Bearer key to /v1/chat/completions answers per model (410 for a retired
    // one), yet the project's key gets a bare "404 page not found". Same
    // shape as the NVIDIA forum threads about a personal org missing the
    // "Public API Endpoints" permission -- an account-side fault, not a
    // path. A misbuilt base is still possible, so both are named.
    return (
      `${id}: ответил 404 «page not found» на POST /chat/completions — ` +
      (id === 'nemotron'
        ? 'у организации ключа NVIDIA обычно нет разрешения Public API Endpoints (build.nvidia.com → организация/ключ); ' // cyrillic-ok
        : '') +
      'также проверьте базовый адрес провайдера (без завершающего слэша и без самого пути)' // cyrillic-ok
    )
  }
  return `${id}: ответил ${status} — ${body.slice(0, 200)}`
}

/**
 * The reason for a 200 whose body is not a stream. Kie answers its own
 * errors this way -- HTTP 200 and `{"code":402,"msg":"..."}` -- so the code
 * inside the body is the real status when it looks like one, and diagnose()
 * names it as it names any other refusal (402: no funds, 401: bad key).
 */
export function notAStream(
  id: ProviderId,
  status: number,
  body: string
): string {
  const code = Number(vendorCode(body))
  return diagnose(id, code >= 400 && code <= 599 ? code : status, body)
}

/**
 * One whole chat.completion in a body that was asked to stream, or null.
 * The message is what a stream would have accumulated: text and tool calls.
 */
export function plainCompletion(
  body: string
): { content: string; tool_calls: unknown[] } | null {
  let j: any
  try {
    j = JSON.parse(body)
  } catch {
    return null
  }
  const m = j?.choices?.[0]?.message
  if (!m || typeof m !== 'object') return null
  return {
    content: typeof m.content === 'string' ? m.content : '',
    tool_calls: Array.isArray(m.tool_calls) ? m.tool_calls : [],
  }
}

export function resolveProvider(): Provider {
  const first = allProviders()[0]
  if (first) return first
  const names = [
    ...new Set(
      providerOrder().flatMap(id =>
        id === 'ollama'
          ? ['OLLAMA_BASE_URL']
          : id === 'reserve'
            ? ['RESERVE_BASE_URL+RESERVE_API_KEY+RESERVE_MODEL']
            : CATALOG[id].env
      )
    ),
  ].join(' или ')
  throw new Error(
    `Ключ модели не задан. Нужен ${names}. ` +
      'Взять: railway variables --kv | grep -E "GLM_API_KEY|OPENAI_API_KEY"'
  )
}
