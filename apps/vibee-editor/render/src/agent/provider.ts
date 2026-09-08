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

export type ProviderId = 'zai' | 'zai-lite' | 'nemotron' | 'ollama'

export interface Provider {
  id: ProviderId
  base: string
  model: string
  key: string
  /** Умеет ли отдавать поток размышления отдельным полем. */
  thinking: boolean
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

const CATALOG: Record<
  ProviderId,
  {
    base: string
    env: string
    model: string
    thinking: boolean
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
    base: process.env.ZAI_BASE_URL || 'https://api.z.ai/api/coding/paas/v4',
    env: 'GLM_API_KEY',
    model: 'glm-5.3',
    thinking: true,
    // 400 code 1210: allowed values: [text]. Measured 2026-09-07.
    vision: false,
    audio: false,
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
   * ничего не стоит: та же аутентификация, другая модель. glm-4.5 легче и
   * отвечает, когда glm-5.3 занята или недоступна.
   */
  'zai-lite': {
    base: process.env.ZAI_BASE_URL || 'https://api.z.ai/api/coding/paas/v4',
    env: 'GLM_API_KEY',
    model: 'glm-4.5',
    thinking: false,
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
    base: process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1',
    env: 'NVIDIA_API_KEY',
    model: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
    thinking: false,
    // Answers 200 with an image part, and streaming plus tool schemas work
    // alongside it. The only sighted provider configured here.
    vision: true,
    // Transcribes ogg, mp3, wav and m4a -- but ONLY via `audio_url`.
    // `input_audio` returns 200 and silently ignores the sound.
    audio: true,
    context: 128_000,
  },
  ollama: {
    base: (process.env.OLLAMA_BASE_URL || OLLAMA_PRIVATE).replace(/\/+$/, ''),
    env: '',
    model: process.env.OLLAMA_MODEL || 'qwen3:1.7b',
    thinking: false,
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
  const key = c.env ? process.env[c.env] : undefined
  return key ? { key } : null
}

/**
 * The order providers are tried in: the paid ones first by default, our
 * own model last as the safety net. AGENT_PROVIDER moves any of them to
 * the front; the rest keep their order behind it.
 */
export function providerOrder(): ProviderId[] {
  const wanted = (process.env.AGENT_PROVIDER || '').toLowerCase() as ProviderId
  const DEFAULT_ORDER: ProviderId[] = ['zai', 'zai-lite', 'nemotron', 'ollama']
  return DEFAULT_ORDER.includes(wanted)
    ? [wanted, ...DEFAULT_ORDER.filter(id => id !== wanted)]
    : DEFAULT_ORDER
}

function build(id: ProviderId, first: boolean, key: string): Provider {
  const c = CATALOG[id]
  // Our model's name comes from OLLAMA_MODEL; AGENT_MODEL is the paid
  // providers' override and must not rename an Ollama tag by accident.
  const model =
    id === 'ollama' ? c.model : (first && process.env.AGENT_MODEL) || c.model
  return {
    id,
    base: c.base,
    model,
    key,
    thinking: c.thinking,
    vision: c.vision,
    audio: c.audio,
    context: c.context,
    compact: c.context < COMPACT_BELOW,
  }
}

export function allProviders(): Provider[] {
  const order = providerOrder()
  const out: Provider[] = []
  for (const id of order) {
    const have = available(id)
    if (!have) continue
    out.push(build(id, id === order[0], have.key))
  }
  return out
}

export function diagnose(id: ProviderId, status: number, body: string): string {
  const b = body.toLowerCase()
  if (b.includes('insufficient balance') || b.includes('1113')) {
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
  if (status === 429) return `${id}: превышен лимит запросов`
  return `${id}: ответил ${status} — ${body.slice(0, 200)}`
}

export function resolveProvider(): Provider {
  const first = allProviders()[0]
  if (first) return first
  const names = providerOrder()
    .map(id => (id === 'ollama' ? 'OLLAMA_BASE_URL' : CATALOG[id].env))
    .join(' или ')
  throw new Error(
    `Ключ модели не задан. Нужен ${names}. ` +
      'Взять: railway variables --kv | grep -E "GLM_API_KEY|OPENAI_API_KEY"'
  )
}
