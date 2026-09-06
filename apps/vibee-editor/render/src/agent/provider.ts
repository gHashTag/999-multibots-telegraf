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

export type ProviderId = 'zai' | 'zai-lite' | 'nemotron' | 'openai'

export interface Provider {
  id: ProviderId
  base: string
  model: string
  key: string
  /** Умеет ли отдавать поток размышления отдельным полем. */
  thinking: boolean
}

const CATALOG: Record<
  ProviderId,
  { base: string; env: string; model: string; thinking: boolean }
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
  },
  openai: {
    base: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    env: 'OPENAI_API_KEY',
    model: 'gpt-4o-mini',
    thinking: false,
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
export function allProviders(): Provider[] {
  const wanted = (process.env.AGENT_PROVIDER || '').toLowerCase() as ProviderId
  /**
   * Порядок: z.ai, затем его же лёгкая модель, и только потом OpenAI.
   *
   * OpenAI остался последним НАМЕРЕННО, а не удалён: если однажды туда
   * положат рабочий ключ, путь сработает. Но полагаться на него нельзя —
   * сейчас он отвечает 401, а раньше был единственным запасным вариантом.
   */
  // Nemotron ПЕРЕД openai: у openai ключ недействителен (замер 06.09.2026),
  // и держать его выше живого провайдера значит тратить виток на отказ.
  const DEFAULT_ORDER: ProviderId[] = ['zai', 'zai-lite', 'nemotron', 'openai']
  const order: ProviderId[] = DEFAULT_ORDER.includes(wanted)
    ? [wanted, ...DEFAULT_ORDER.filter(id => id !== wanted)]
    : DEFAULT_ORDER
  const out: Provider[] = []
  for (const id of order) {
    const c = CATALOG[id]
    const key = process.env[c.env]
    if (!key) continue
    out.push({
      id,
      base: c.base,
      model: (id === order[0] && process.env.AGENT_MODEL) || c.model,
      key,
      thinking: c.thinking,
    })
  }
  return out
}

/**
 * Человеческий диагноз по ответу провайдера.
 *
 * «429» и «401» сами по себе ничего не говорят владельцу. Нулевой баланс и
 * протухший ключ чинятся совершенно по-разному, и путать их дорого.
 */
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
    return `${id}: такой модели нет — проверьте AGENT_MODEL`
  }
  if (status === 429) return `${id}: превышен лимит запросов`
  return `${id}: ответил ${status} — ${body.slice(0, 200)}`
}

export function resolveProvider(): Provider {
  const wanted = (process.env.AGENT_PROVIDER || '').toLowerCase() as ProviderId
  const order: ProviderId[] =
    wanted === 'zai' || wanted === 'openai'
      ? [wanted, wanted === 'zai' ? 'openai' : 'zai']
      : ['zai', 'openai']

  for (const id of order) {
    const c = CATALOG[id]
    const key = process.env[c.env]
    if (key) {
      return {
        id,
        base: c.base,
        // AGENT_MODEL перекрывает умолчание, но только если провайдер тот,
        // для которого имя модели имеет смысл: glm-4.6 у OpenAI не существует,
        // и подставить его туда — верный способ получить 404 вместо ответа.
        model: (id === order[0] && process.env.AGENT_MODEL) || c.model,
        key,
        thinking: c.thinking,
      }
    }
  }

  const names = order.map(id => CATALOG[id].env).join(' или ')
  throw new Error(
    `Ключ модели не задан. Нужен ${names}. ` +
      'Взять: railway variables --kv | grep -E "GLM_API_KEY|OPENAI_API_KEY"'
  )
}
