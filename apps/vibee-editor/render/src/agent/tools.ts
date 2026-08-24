/**
 * ЕДИНЫЙ реестр инструментов агента.
 *
 * Один список — три входа:
 *   1. чат внутри мини-аппа   POST /api/agent/chat   (подпись initData)
 *   2. внешний клиент MCP     POST /mcp              (ключ, привязанный к человеку)
 *   3. отладка курлом         POST /mcp              (тот же ключ)
 *
 * ПОЧЕМУ ОДИН СПИСОК, А НЕ ДВА. В этом репозитории уже было место, где список
 * возможностей писали руками отдельно от реализации: GET /compositions отдавал
 * шесть шаблонов, а в бандле существовал ОДИН. Расхождение было неизбежным —
 * ничто их не связывало. Здесь и чат, и MCP читают ровно этот массив, поэтому
 * разойтись им не с чем.
 *
 * ГРАНИЦА ОТВЕТСТВЕННОСТИ. Инструмент НИКОГДА не получает telegram_id из
 * аргументов — только из подтверждённого контекста вызова. Иначе любой, кто
 * умеет писать JSON, читал бы чужие черновики и публиковал от чужого имени.
 *
 * ГЕНЕРАЦИИ. Владелец выдал агенту полный доступ к производству: картинки —
 * через собственный POST /api/generate/image (FAL), озвучка — через
 * /api/generate/audio (ElevenLabs), видео — через /api/generate/video (MCP),
 * рилс целиком — через /render/template (Remotion). Инструменты ниже ходят
 * в эти же эндпоинты по SELF_URL, а не дублируют их логику: один список
 * возможностей — один путь к провайдеру. Когда появится списание баланса,
 * границу пропуска нужно будет вернуть сюда же — одним местом.
 */

export interface ToolContext {
  /** Подтверждён подписью или ключом. НЕ приходит из аргументов. */
  telegramId: string
  pool: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }
}

export interface AgentTool {
  name: string
  description: string
  /** JSON Schema аргументов — её же отдаём наружу по MCP tools/list. */
  parameters: Record<string, unknown>
  handler: (args: Record<string, any>, ctx: ToolContext) => Promise<unknown>
}

const noArgs = { type: 'object', properties: {}, additionalProperties: false }

/**
 * Адрес собственного сервера для внутренних вызовов (генерация, рендер, S3).
 * Тот же приём, что у templates_list: инструменты ходят в живые эндпоинты,
 * а не дублируют их логику.
 */
const selfBase = () =>
  process.env.SELF_URL || 'http://127.0.0.1:' + (process.env.PORT || '3000')

/**
 * Self-call инструментов. На проде гвард в режиме enforce: вызов самого
 * себя без ключа отбивается 401 (локальный warn это маскировал — второй
 * случай ловушки «новый маршрут режется гвардом»). Представляемся
 * серверным ключом, как это делает бот.
 */
function selfFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {})
  const key = process.env.RENDER_API_KEY
  if (key) headers.set('X-Api-Key', key)
  return fetch(url, { ...init, headers })
}

/**
 * Суточный лимит платных генераций на человека. Без него автономный цикл
 * (или просто любопытный агент) способен выкачать баланс провайдера за
 * одну ночь. Считаем по уже созданным файлам с bot_name='agent' — это
 * честнее счётчика в памяти: переживает рестарт и виден человеку в файлах.
 */
const DAILY_GENERATION_CAP = 60
async function generationsLeftToday(ctx: ToolContext): Promise<number> {
  const r = await ctx.pool.query(
    `SELECT COUNT(*)::int AS n FROM assets
     WHERE telegram_id = $1 AND bot_name = 'agent'
       AND created_at > now() - interval '24 hours'`,
    [ctx.telegramId]
  )
  return DAILY_GENERATION_CAP - (r.rows[0]?.n ?? 0)
}

/**
 * ТОКЕНЫ — валюта генераций. Старт даём даром (20), дальше человек
 * пополняет звёздами Telegram (канал пополнения — за владельцем).
 * Прайс фиксирован и виден человеку везде: в чате, в my_balance и в
 * каждом результате платного инструмента.
 */
/**
 * Цены выводятся из СЕБЕСТОИМОСТИ (loop/PRICING.md — источник правды),
 * а не придумываются: единая долларовая база исключает продажу операций
 * в минус (видео раньше стоило 5 токенов ≈ $0.025 продажи при $0.10
 * себестоимости — прямые убытки на каждом ролике).
 */
const COST_PER_TOKEN_USD = 0.005
/** Себестоимость операций, $ (оценки Replicate/рынка — см. PRICING.md). */
const OPERATION_COST_USD: Record<string, number> = {
  image_generate: 0.003,
  video_generate: 0.1,
  audio_generate: 0.03,
  reel_render: 0.005,
}
/** Цена = ceil(себестоимость / база). Источник значений — не руки, а расчёт. */
function priceFor(op: string): number {
  return Math.ceil(OPERATION_COST_USD[op] / COST_PER_TOKEN_USD)
}
export const TOKEN_PRICES: Record<string, number> = {
  image_generate: priceFor('image_generate'), // 1
  audio_generate: priceFor('audio_generate'), // 6
  reel_render: priceFor('reel_render'), // 1
  video_generate: priceFor('video_generate'), // 20
}
const TOKEN_START = 20

/**
 * ИНВАРИАНТЫ ЦЕНЫ (PRICING.md, I1–I3). Вызов при загрузке модуля:
 * нарушение — громкий лог, а не падение прода; регресс-чек ловит дублирующе.
 * Менял прайс — перечитай инварианты здесь и в loop/regression-check.sh.
 */
export function validateTokenPricing(): { ok: boolean; нарушено: string[] } {
  const нарушено: string[] = []
  // I2: единая база — каждая операция не дешевле себестоимости в токенах
  for (const [op, price] of Object.entries(TOKEN_PRICES)) {
    if (price < OPERATION_COST_USD[op] / COST_PER_TOKEN_USD) {
      нарушено.push(`I2: ${op} продаётся ниже себестоимости (${price} токенов)`)
    }
  }
  // I1: маржа ≥ 50% против самого дешёвого пакета продажи ($0.0152/токен)
  const SALE_USD_PER_TOKEN = 0.0152
  if (COST_PER_TOKEN_USD > SALE_USD_PER_TOKEN * 0.5) {
    нарушено.push('I1: себестоимость токена выше 50% цены продажи')
  }
  // I3: старт-бонус ≤ $0.15 себестоимости
  if (TOKEN_START * COST_PER_TOKEN_USD > 0.15) {
    нарушено.push(`I3: старт-бонус ${TOKEN_START} токенов дороже $0.15`)
  }
  return { ok: нарушено.length === 0, нарушено }
}
const pricingCheck = validateTokenPricing()
if (!pricingCheck.ok) {
  // Не роняем сервис, но крик в логах: это ошибка ценообразования.
  console.error('❌ [PRICING] нарушены инварианты:', pricingCheck.нарушено)
}

async function ensureTokenRow(ctx: ToolContext): Promise<number> {
  await ctx.pool.query(
    `CREATE TABLE IF NOT EXISTS user_tokens (
       telegram_id text PRIMARY KEY,
       balance     int NOT NULL,
       updated_at  timestamptz NOT NULL DEFAULT now()
     )`
  )
  const r = await ctx.pool.query(
    `INSERT INTO user_tokens (telegram_id, balance)
     VALUES ($1, $2)
     ON CONFLICT (telegram_id) DO UPDATE SET telegram_id = EXCLUDED.telegram_id
     RETURNING balance`,
    [ctx.telegramId, TOKEN_START]
  )
  return r.rows[0].balance
}

/** Таблица скиллов создаётся лениво при первом обращении — как user_soul. */
async function ensureSkillsTable(ctx: ToolContext): Promise<void> {
  await ctx.pool.query(
    `CREATE TABLE IF NOT EXISTS user_skills (
       id          serial PRIMARY KEY,
       telegram_id text NOT NULL,
       name        text NOT NULL,
       content     text NOT NULL,
       created_at  timestamptz NOT NULL DEFAULT now(),
       updated_at  timestamptz NOT NULL DEFAULT now(),
       UNIQUE (telegram_id, name)
     )`
  )
  // Маркетплейс: публичность скилла — отдельная колонка, приватность
  // по умолчанию; витрина читает только is_public.
  await ctx.pool.query(
    `ALTER TABLE user_skills ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false`
  )
}

/** Списание с честным отказом: недостаток — это ответ, а не исключение. */
async function spendTokens(
  ctx: ToolContext,
  tool: string
): Promise<{
  ok: boolean
  потрачено?: number
  осталось?: number
  причина?: string
}> {
  const price = TOKEN_PRICES[tool]
  if (!price) return { ok: true }
  const balance = await ensureTokenRow(ctx)
  if (balance < price) {
    return {
      ok: false,
      причина:
        `не хватает токенов: нужно ${price}, есть ${balance}. ` +
        'Пополняется звёздами Telegram — скажи человеку и предложи бесплатные действия (лента, SOUL, ремикс из готовых файлов)',
    }
  }
  const r = await ctx.pool.query(
    `UPDATE user_tokens SET balance = balance - $2, updated_at = now()
     WHERE telegram_id = $1 RETURNING balance`,
    [ctx.telegramId, price]
  )
  return { ok: true, потрачено: price, осталось: r.rows[0].balance }
}

/** Допишет стоимость к результату инструмента, если она есть. */
async function withTokens<T extends object>(
  ctx: ToolContext,
  tool: string,
  result: T
): Promise<T & { токены?: { потрачено: number; осталось: number } }> {
  const price = TOKEN_PRICES[tool]
  if (!price) return result
  const balance = await ensureTokenRow(ctx)
  return { ...result, токены: { потрачено: price, осталось: balance } }
}

export const TOOLS: AgentTool[] = [
  {
    name: 'whoami',
    description:
      'Кто вызывает инструменты: telegram_id, имя в приложении и сколько у человека опубликованных роликов. ' +
      'Полезно, чтобы не спрашивать имя у человека, который уже вошёл.',
    parameters: noArgs,
    async handler(_args, ctx) {
      const u = await ctx.pool.query(
        `SELECT telegram_id, COALESCE(username,'') AS username,
                COALESCE(first_name,'') AS first_name
         FROM users WHERE telegram_id = $1 LIMIT 1`,
        [ctx.telegramId]
      )
      const c = await ctx.pool.query(
        `SELECT COUNT(*)::int AS n FROM public_templates
         WHERE telegram_id = $1 AND is_public = TRUE AND deleted_at IS NULL`,
        [ctx.telegramId]
      )
      return {
        telegram_id: ctx.telegramId,
        профиль: u.rows[0] ?? null,
        опубликовано: c.rows[0]?.n ?? 0,
      }
    },
  },

  {
    name: 'feed_list',
    description:
      'Лента опубликованных роликов. Отдаёт последние записи с автором, описанием, ссылкой на видео ' +
      'и счётчиками. Используй, чтобы показать человеку, что уже есть, или найти ролик для ремикса.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 50,
          description: 'сколько записей, по умолчанию 10',
        },
        mine: { type: 'boolean', description: 'только мои публикации' },
      },
      additionalProperties: false,
    },
    async handler(args, ctx) {
      const limit = Math.min(
        Math.max(parseInt(String(args.limit ?? 10), 10) || 10, 1),
        50
      )
      const mine = args.mine === true
      const r = await ctx.pool.query(
        `SELECT id, creator_name, COALESCE(creator_username,'') AS creator_username,
                name, description, video_url, thumbnail_url,
                likes_count, views_count, uses_count, created_at::text
         FROM public_templates
         WHERE is_public = TRUE AND deleted_at IS NULL
           ${mine ? 'AND telegram_id = $2' : ''}
         ORDER BY created_at DESC LIMIT $1`,
        mine ? [limit, ctx.telegramId] : [limit]
      )
      return { всего: r.rows.length, записи: r.rows }
    },
  },

  {
    name: 'feed_get',
    description:
      'Одна запись ленты ЦЕЛИКОМ, вместе со слоями: assets и tracks. Это то, что нужно для ремикса — ' +
      'без слоёв редактор откроется пустым.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'integer', description: 'идентификатор записи' },
      },
      required: ['id'],
      additionalProperties: false,
    },
    async handler(args, ctx) {
      const r = await ctx.pool.query(
        `SELECT id, telegram_id, creator_name, COALESCE(creator_username,'') AS creator_username,
                name, description, video_url, thumbnail_url,
                template_settings::text, assets::text, tracks::text,
                likes_count, views_count, uses_count, created_at::text,
                parent_template_id, original_creator_id
         FROM public_templates
         WHERE id = $1 AND is_public = TRUE AND deleted_at IS NULL`,
        [args.id]
      )
      if (!r.rows.length)
        return { найдено: false, причина: 'записи нет или она не публичная' }
      const row = r.rows[0]
      const parse = (v: string, d: unknown) => {
        try {
          return JSON.parse(v)
        } catch {
          return d
        }
      }
      return {
        найдено: true,
        запись: {
          ...row,
          template_settings: parse(row.template_settings, {}),
          assets: parse(row.assets, []),
          tracks: parse(row.tracks, []),
        },
      }
    },
  },

  {
    name: 'templates_list',
    description:
      'Шаблоны, которыми РЕАЛЬНО можно отрендерить ролик. Список берётся из бандла рендера, а не из ' +
      'рукописного перечня: рукописный уже расходился с действительностью — обещал шесть композиций ' +
      'при одной существующей.',
    parameters: noArgs,
    async handler() {
      const r = await selfFetch(`${selfBase()}/compositions`)
      if (!r.ok) {
        // Молчать нельзя: пустой список читается как «шаблонов нет».
        return { ошибка: `рендер не отдал список композиций: HTTP ${r.status}` }
      }
      return await r.json()
    },
  },

  {
    name: 'my_assets',
    description:
      'Файлы человека: сгенерированные картинки, видео, озвучка. Отдаёт последние. ' +
      'Используй, чтобы собрать ролик из того, что уже сделано, и не платить за повтор.',
    parameters: {
      type: 'object',
      properties: { limit: { type: 'integer', minimum: 1, maximum: 50 } },
      additionalProperties: false,
    },
    async handler(args, ctx) {
      const limit = Math.min(
        Math.max(parseInt(String(args.limit ?? 20), 10) || 20, 1),
        50
      )
      const r = await ctx.pool.query(
        `SELECT id, type, COALESCE(public_url,'') AS public_url,
                storage_path, trigger_word, created_at::text
         FROM assets WHERE telegram_id = $1
         ORDER BY created_at DESC LIMIT $2`,
        [ctx.telegramId, limit]
      )
      return {
        всего: r.rows.length,
        файлы: r.rows,
        подсказка:
          'у файлов с public_url отдавай ссылку человеку — в чате она станет живым превью',
      }
    },
  },

  {
    name: 'feed_publish',
    description:
      'Опубликовать ролик в ленту. ВАЖНО: текст поста (description) обязателен и должен содержать ' +
      'хештеги — по канону проекта к каждому видео идёт текст для инстаграма. ' +
      'Публикация от имени того, кто вызвал инструмент; чужой telegram_id подставить нельзя.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'название ролика' },
        description: { type: 'string', description: 'текст поста с хештегами' },
        video_url: { type: 'string', description: 'ссылка на готовое видео' },
        thumbnail_url: { type: 'string' },
        template_settings: { type: 'object', description: 'настройки шаблона' },
        assets: { type: 'array', description: 'слои: файлы' },
        tracks: { type: 'array', description: 'слои: дорожки' },
        post_to_telegram: {
          type: 'boolean',
          description: 'публиковать ли ролик в Telegram-канал; по умолчанию да',
        },
      },
      required: ['name', 'description', 'video_url'],
      additionalProperties: false,
    },
    async handler(args, ctx) {
      if (!/#\w/.test(String(args.description || ''))) {
        return {
          опубликовано: false,
          причина:
            'в тексте поста нет ни одного хештега. По канону проекта к видео всегда идёт текст ' +
            'для инстаграма с хештегами — добавь их и повтори.',
        }
      }
      const u = await ctx.pool.query(
        `SELECT COALESCE(first_name,'Автор') AS n, COALESCE(username,'') AS un
         FROM users WHERE telegram_id = $1 LIMIT 1`,
        [ctx.telegramId]
      )

      /**
       * Публикуем через СОБСТВЕННЫЙ эндпоинт, а не своим INSERT.
       *
       * Здесь стоял отдельный `INSERT INTO public_templates` — вторая дверь в
       * ту же таблицу. Из-за неё ролики автопилота:
       *
       *   1. НЕ уходили в Telegram-канал: постинг живёт в обработчике
       *      /api/feed/publish, и этот путь его просто не проходил. За всё
       *      время автопилот не доставил в канал ни одного ролика;
       *   2. не получали upsert по имени — повторная публикация того же
       *      шаблона плодила карточки вместо обновления.
       *
       * Приём тот же, что у reel_render рядом: сходить к себе по HTTP через
       * selfFetch. Импортировать publishTemplateRow напрямую нельзя — она не
       * экспортирована из render-server.ts, а вытаскивать её значило бы резать
       * пятитысячный файл ради одного вызова.
       *
       * Одна дверь важнее экономии на сетевом вызове: две реализации записи в
       * одну таблицу расходятся молча, и здесь они уже разошлись.
       */
      const base = selfBase()
      const res = await selfFetch(`${base}/api/feed/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegram_id: ctx.telegramId,
          creator_name: u.rows[0]?.n ?? 'Автор',
          creator_username: u.rows[0]?.un ?? '',
          name: args.name,
          description: args.description,
          thumbnail_url: args.thumbnail_url ?? null,
          video_url: args.video_url,
          template_settings: args.template_settings ?? {},
          assets: args.assets ?? [],
          tracks: args.tracks ?? [],
          // Текст поста уже собран агентом с хештегами — он же идёт в канал.
          telegram_caption: args.description,
          // Автопилот публикует В КАНАЛ. Раньше флаг не ставил никто, и
          // автоматические ролики оставались в ленте мини-аппа.
          post_to_telegram: args.post_to_telegram !== false,
        }),
      })
      const body = (await res.json().catch(() => ({}))) as {
        id?: number
        template?: { created_at?: string }
        telegram?: { posted: boolean; error?: string }
      }
      if (!res.ok || !body.id) {
        return {
          опубликовано: false,
          причина: `публикация не прошла: HTTP ${res.status}`,
        }
      }
      return {
        опубликовано: true,
        id: body.id,
        создано: body.template?.created_at,
        // Отдаём результат доставки НАРУЖУ: агент должен знать, дошёл ли
        // ролик до людей, а не только записался ли он в таблицу.
        вКанале: body.telegram?.posted ?? false,
        ...(body.telegram?.posted === false && body.telegram.error
          ? { каналОшибка: body.telegram.error }
          : {}),
      }
    },
  },

  {
    name: 'feed_stats',
    description: 'Сводка по ленте: авторов, роликов, просмотров, лайков.',
    parameters: noArgs,
    async handler(_a, ctx) {
      const r = await ctx.pool.query(
        `SELECT COUNT(DISTINCT telegram_id)::int AS авторов,
                COUNT(*)::int AS роликов,
                COALESCE(SUM(views_count),0)::int AS просмотров,
                COALESCE(SUM(likes_count),0)::int AS лайков
         FROM public_templates WHERE is_public = TRUE AND deleted_at IS NULL`
      )
      return r.rows[0]
    },
  },

  {
    name: 'image_generate',
    description:
      'Сгенерировать картинку по описанию (Replicate flux-schnell). Файл сохраняется в S3 и ' +
      'появляется в «моих файлах», отдаёт прямую ссылку — её можно сразу отдавать в reel_render ' +
      'или публиковать в ленту.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'что нарисовать, по-русски или по-английски',
        },
        model: {
          type: 'string',
          description:
            'fal-ai/nano-banana-pro (по умолчанию), fal-ai/flux/dev, fal-ai/flux-pro/v1.1-ultra, fal-ai/reve/text-to-image',
        },
        width: { type: 'integer', description: 'ширина, по умолчанию 1024' },
        height: { type: 'integer', description: 'высота, по умолчанию 1024' },
      },
      required: ['prompt'],
      additionalProperties: false,
    },
    async handler(args, ctx) {
      if ((await generationsLeftToday(ctx)) <= 0) {
        return {
          сделано: false,
          причина:
            `суточный лимит генераций (${DAILY_GENERATION_CAP}) исчерпан — защита баланса владельца. ` +
            'Скажи человеку честно и предложи собрать ролик из уже готовых файлов (my_assets).',
        }
      }
      const charge = await spendTokens(ctx, 'image_generate')
      if (!charge.ok) return { сделано: false, причина: charge.причина }
      const base = selfBase()
      const gen = await selfFetch(`${base}/api/generate/image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: String(args.prompt),
          model: args.model,
          width: args.width,
          height: args.height,
        }),
      })
      const genData: any = await gen.json().catch(() => null)
      if (!gen.ok || !genData?.url) {
        return {
          сделано: false,
          причина: `генерация не удалась: HTTP ${gen.status} ${String(genData?.error || '')}`,
        }
      }
      // Ссылка FAL живёт ограниченное время — сразу забираем файл в наше S3,
      // иначе через час и лента, и рендер показывали бы битую картинку.
      const img = await fetch(genData.url) // внешний провайдер — ключ не нужен
      if (!img.ok) {
        return {
          сделано: false,
          причина: `картинка сгенерирована, но не скачалась: HTTP ${img.status}`,
          fal_url: genData.url,
        }
      }
      const bytes = Buffer.from(await img.arrayBuffer())
      const up = await selfFetch(`${base}/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': img.headers.get('content-type') || 'image/jpeg',
          'X-Filename': `agent-image-${Date.now()}.jpg`,
        },
        body: new Uint8Array(bytes),
      })
      const upData: any = await up.json().catch(() => null)
      if (!up.ok || !upData?.directUrl) {
        return {
          сделано: false,
          причина: `S3 не принял файл: HTTP ${up.status}`,
          fal_url: genData.url,
        }
      }
      const r = await ctx.pool.query(
        `INSERT INTO assets (type, trigger_word, telegram_id, storage_path, public_url, text, bot_name)
         VALUES ('generated_image', '', $1, '', $2, $3, 'agent')
         RETURNING id, created_at::text`,
        [ctx.telegramId, upData.directUrl, String(args.prompt)]
      )
      return withTokens(ctx, 'image_generate', {
        сделано: true,
        url: upData.directUrl,
        id: r.rows[0]?.id,
        подсказка:
          'ссылка готова: отдай её в reel_render как слой или в feed_publish',
      })
    },
  },

  {
    name: 'audio_generate',
    description:
      'Озвучить текст голосом (ElevenLabs). Работает ТОЛЬКО при валидном ключе аккаунта: если вернулась ' +
      'ошибка про голоса — озвучка не настроена, честно скажи это и собери рилс без звука. ' +
      'Если voice_id не знаешь — не указывай, возьмётся первый доступный голос.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'текст для озвучки' },
        voice_id: {
          type: 'string',
          description: 'идентификатор голоса ElevenLabs, необязателен',
        },
      },
      required: ['text'],
      additionalProperties: false,
    },
    async handler(args, ctx) {
      const charge = await spendTokens(ctx, 'audio_generate')
      if (!charge.ok) return { сделано: false, причина: charge.причина }
      const base = selfBase()
      let voiceId = args.voice_id ? String(args.voice_id) : ''
      if (!voiceId) {
        const v = await selfFetch(`${base}/api/voices`)
        const vData: any = await v.json().catch(() => null)
        voiceId = vData?.voices?.[0]?.voice_id || ''
      }
      if (!voiceId) {
        return {
          сделано: false,
          причина: 'не нашёлся ни один голос — проверь ELEVENLABS_API_KEY',
        }
      }
      const gen = await selfFetch(`${base}/api/generate/audio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: String(args.text), voice_id: voiceId }),
      })
      const genData: any = await gen.json().catch(() => null)
      if (!gen.ok || !genData?.url) {
        return {
          сделано: false,
          причина: `озвучка не удалась: HTTP ${gen.status} ${String(genData?.error || '')}`,
        }
      }
      // /api/generate/audio отдаёт прокси-путь /s3/... — делаем абсолютным,
      // чтобы ссылку можно было отдать и в рендер, и в ленту.
      const absolute = genData.url.startsWith('http')
        ? genData.url
        : `${base}${genData.url}`
      const direct = genData.directUrl || absolute
      const r = await ctx.pool.query(
        `INSERT INTO assets (type, trigger_word, telegram_id, storage_path, public_url, text, bot_name)
         VALUES ('voiceover', '', $1, '', $2, $3, 'agent')
         RETURNING id, created_at::text`,
        [ctx.telegramId, direct, String(args.text).slice(0, 500)]
      )
      return withTokens(ctx, 'audio_generate', {
        сделано: true,
        url: direct,
        id: r.rows[0]?.id,
      })
    },
  },

  {
    name: 'video_generate',
    description:
      'Сгенерировать видеофрагмент по описанию (Replicate seedance-1-lite, 5 или 10 секунд). ' +
      'Ролик сразу перекладывается в наше S3. Если вернулась ошибка — скажи человеку честно ' +
      'и собери ролик из картинок через reel_render.',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'что происходит в кадре' },
        model: {
          type: 'string',
          description:
            'например kling-v1-6 std/pro — если не уверен, не указывай',
        },
        duration: { type: 'integer', description: 'длительность в секундах' },
        aspect_ratio: { type: 'string', description: 'например 9:16' },
      },
      required: ['prompt'],
      additionalProperties: false,
    },
    async handler(args, ctx) {
      if ((await generationsLeftToday(ctx)) <= 0) {
        return {
          сделано: false,
          причина: `суточный лимит генераций (${DAILY_GENERATION_CAP}) исчерпан — защита баланса владельца`,
        }
      }
      const charge = await spendTokens(ctx, 'video_generate')
      if (!charge.ok) return { сделано: false, причина: charge.причина }
      const gen = await selfFetch(`${selfBase()}/api/generate/video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: String(args.prompt),
          model: args.model,
          duration: args.duration,
          aspect_ratio: args.aspect_ratio,
        }),
      })
      const genData: any = await gen.json().catch(() => null)
      if (!gen.ok || !genData?.url) {
        return {
          сделано: false,
          причина: `видео не сгенерировалось: HTTP ${gen.status} ${String(genData?.error || '')}`,
        }
      }
      const r = await ctx.pool.query(
        `INSERT INTO assets (type, trigger_word, telegram_id, storage_path, public_url, text, bot_name)
         VALUES ('generated_video', '', $1, '', $2, $3, 'agent')
         RETURNING id, created_at::text`,
        [ctx.telegramId, genData.url, String(args.prompt)]
      )
      return withTokens(ctx, 'video_generate', {
        сделано: true,
        url: genData.url,
        id: r.rows[0]?.id,
      })
    },
  },

  {
    name: 'reel_render',
    description:
      'Собрать рилс: отрендерить композицию Remotion в готовый mp4. Список композиций — templates_list. ' +
      'По умолчанию ждёт окончания (до 6 минут) и отдаёт прямую ссылку на видео — её сразу можно в feed_publish.',
    parameters: {
      type: 'object',
      properties: {
        compositionId: {
          type: 'string',
          description: 'идентификатор композиции из templates_list',
        },
        props: {
          type: 'object',
          description:
            'входные данные композиции: картинки, текст, аудио и т.д.',
        },
        wait: {
          type: 'boolean',
          description: 'ждать окончания (по умолчанию true)',
        },
      },
      required: ['compositionId'],
      additionalProperties: false,
    },
    async handler(args, ctx) {
      const charge = await spendTokens(ctx, 'reel_render')
      if (!charge.ok) return { началось: false, причина: charge.причина }
      const base = selfBase()
      const start = await selfFetch(`${base}/render/template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          compositionId: String(args.compositionId),
          props: args.props || {},
        }),
      })
      const startData: any = await start.json().catch(() => null)
      if (!start.ok || !startData?.renderId) {
        return {
          началось: false,
          причина: `рендер не стартовал: HTTP ${start.status} ${String(startData?.error || '')}`,
        }
      }
      const renderId: string = startData.renderId
      if (args.wait === false) {
        return {
          началось: true,
          renderId,
          статус: `GET /render/${renderId}`,
          подсказка: 'проверь render_status',
        }
      }
      // Рендер занимает минуты: держим один вызов инструмента до готовности,
      // иначе 8 витков диалога уходят на поллинг, а не на работу.
      const deadline = Date.now() + 6 * 60 * 1000
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 4000))
        const st = await selfFetch(`${base}/render/${renderId}`)
        const stData: any = await st.json().catch(() => null)
        if (stData?.status === 'completed') {
          const url = stData.publicUrl || stData.outputUrl
          const full = url && !url.startsWith('http') ? `${base}${url}` : url
          return withTokens(ctx, 'reel_render', {
            готово: true,
            renderId,
            url: full,
          })
        }
        if (stData?.status === 'failed') {
          return {
            готово: false,
            renderId,
            причина: `рендер упал: ${String(stData.error || 'без подробностей')}`,
          }
        }
      }
      return {
        готово: false,
        renderId,
        причина: 'не уложился в 6 минут — проверь render_status',
      }
    },
  },

  {
    name: 'render_status',
    description:
      'Статус рендера: progress, готовое видео или ошибка. Для renderId из reel_render.',
    parameters: {
      type: 'object',
      properties: { renderId: { type: 'string' } },
      required: ['renderId'],
      additionalProperties: false,
    },
    async handler(args) {
      const st = await selfFetch(
        `${selfBase()}/render/${encodeURIComponent(String(args.renderId))}`
      )
      const stData: any = await st.json().catch(() => null)
      if (!st.ok) {
        return { ошибка: `рендер не найден: HTTP ${st.status}` }
      }
      const url = stData.publicUrl || stData.outputUrl
      return {
        ...stData,
        url: url && !url.startsWith('http') ? `${selfBase()}${url}` : url,
      }
    },
  },

  {
    name: 'my_balance',
    description:
      'Баланс токенов человека и прайс генераций. Бесплатно. Говори баланс сам после ' +
      'каждой платной операции (поле «токены» приходит в результате) — человек всегда ' +
      'видит, сколько что стоит и сколько осталось.',
    parameters: noArgs,
    async handler(_a, ctx) {
      const balance = await ensureTokenRow(ctx)
      const прайс: Record<string, number> = {}
      for (const [k, v] of Object.entries(TOKEN_PRICES)) прайс[k] = v
      return {
        баланс_токенов: balance,
        прайс: прайс,
        бесплатно: [
          'whoami, feed_list, feed_get, my_assets, templates_list, feed_stats',
          'feed_analytics, my_balance, soul_get, soul_edit, render_status',
          'публикация feed_publish',
        ].join(', '),
      }
    },
  },

  {
    name: 'feed_analytics',
    description:
      'Аналитика МОИХ постов: просмотры, звёзды, ремиксы, лучший пост и средние. ' +
      'Основа выбора тем: что человек смотрит — то и производить. Цифры честные: ' +
      'нулевые просмотры означают «не смотрели», а не «сломалось».',
    parameters: noArgs,
    async handler(_a, ctx) {
      const r = await ctx.pool.query(
        `SELECT id, name, views_count, likes_count, uses_count,
                stars_count, created_at::text
         FROM public_templates
         WHERE telegram_id = $1 AND is_public = TRUE AND deleted_at IS NULL
         ORDER BY created_at DESC`,
        [ctx.telegramId]
      )
      const rows = r.rows
      const sum = (k: string) =>
        rows.reduce((acc: number, x: any) => acc + (Number(x[k]) || 0), 0)
      const best = rows.reduce(
        (b: any, x: any) =>
          Number(x.views_count) > Number(b?.views_count ?? -1) ? x : b,
        null
      )
      const week = rows.filter(
        (x: any) => Date.now() - Date.parse(x.created_at) < 7 * 86400_000
      )
      const result = {
        постов: rows.length,
        просмотров: sum('views_count'),
        звёзд: sum('stars_count'),
        ремиксов: sum('uses_count'),
        среднее_просмотров: rows.length
          ? Math.round((sum('views_count') / rows.length) * 10) / 10
          : 0,
        лучший_пост: best
          ? { id: best.id, name: best.name, просмотров: best.views_count }
          : null,
        за_7_дней: {
          постов: week.length,
          просмотров: week.reduce(
            (a: number, x: any) => a + Number(x.views_count || 0),
            0
          ),
        },
      } as Record<string, unknown>
      // A/B заголовков: стиль лежит в template_settings.ab_style
      // (кладёт автопилот). Посты без метки в «прочие» не попадают —
      // они и есть контрольная группа до начала эксперимента.
      try {
        const ab = await ctx.pool.query(
          `SELECT template_settings->>'ab_style' AS style,
                  COUNT(*)::int AS постов,
                  COALESCE(SUM(views_count),0)::int AS просмотров
           FROM public_templates
           WHERE telegram_id = $1 AND is_public = TRUE AND deleted_at IS NULL
             AND template_settings->>'ab_style' IS NOT NULL
           GROUP BY 1`,
          [ctx.telegramId]
        )
        if (ab.rows.length) {
          result['заголовки_AB'] = ab.rows
        }
      } catch {
        /* нет колонки-метки — эксперимент ещё не начат */
      }
      return result
    },
  },

  /**
   * СКИЛЛЫ — папка правил человека: как писать его рилсы, какие tone
   * запрещены, каноны ниш. В отличие от SOUL (голос владельца целиком),
   * скилл — отдельный переиспользуемый навык: создать, поправить,
   * удалить. Агент видит их все в skills_list и применяет к генерациям.
   */
  {
    name: 'skills_list',
    description:
      'Все скиллы человека с полным содержимым. Применяй их к своим ответам и ' +
      'генерациям: если есть скилл про тон рилсов — пиши посты по нему. Бесплатно.',
    parameters: noArgs,
    async handler(_a, ctx) {
      await ensureSkillsTable(ctx)
      const r = await ctx.pool.query(
        `SELECT id, name, content, updated_at::text
         FROM user_skills WHERE telegram_id = $1 ORDER BY updated_at DESC`,
        [ctx.telegramId]
      )
      return {
        всего: r.rows.length,
        скиллы: r.rows,
        подсказка:
          'применяй их к текстам постов и тонам; изменение — через skills_update',
      }
    },
  },

  {
    name: 'skills_create',
    description:
      'Создать скилл: именованное правило для агента (например «Тон рилсов: без жаргона, ' +
      'числа с единицами»). Появляется в skills_list и применяется к генерациям. Бесплатно.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'короткое имя скилла' },
        content: { type: 'string', description: 'текст правила, до 8 КБ' },
      },
      required: ['name', 'content'],
      additionalProperties: false,
    },
    async handler(args, ctx) {
      const name = String(args.name || '').trim()
      const content = String(args.content || '').trim()
      if (!name || !content) {
        return { создано: false, причина: 'нужны непустые name и content' }
      }
      if (name.length > 100)
        return { создано: false, причина: 'имя до 100 символов' }
      if (content.length > 8192) {
        return {
          создано: false,
          причина: `слишком длинно: ${content.length} > 8192`,
        }
      }
      await ensureSkillsTable(ctx)
      const dup = await ctx.pool.query(
        `SELECT id FROM user_skills WHERE telegram_id = $1 AND name = $2`,
        [ctx.telegramId, name]
      )
      if (dup.rows.length) {
        return {
          создано: false,
          причина: `скилл «${name}» уже есть — используй skills_update`,
        }
      }
      const r = await ctx.pool.query(
        `INSERT INTO user_skills (telegram_id, name, content)
         VALUES ($1, $2, $3) RETURNING id, created_at::text`,
        [ctx.telegramId, name, content]
      )
      return { создано: true, id: r.rows[0].id, имя: name }
    },
  },

  {
    name: 'skills_update',
    description:
      'Обновить скилл по id (имя можно оставить прежним). Бесплатно.',
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'integer',
          description: 'идентификатор скилла из skills_list',
        },
        name: { type: 'string' },
        content: { type: 'string', description: 'полный новый текст' },
      },
      required: ['id', 'content'],
      additionalProperties: false,
    },
    async handler(args, ctx) {
      await ensureSkillsTable(ctx)
      const r = await ctx.pool.query(
        `UPDATE user_skills
         SET name = COALESCE(NULLIF($3, ''), name), content = $2, updated_at = now()
         WHERE id = $1 AND telegram_id = $4
         RETURNING id, name`,
        [
          args.id,
          String(args.content || ''),
          String(args.name || ''),
          ctx.telegramId,
        ]
      )
      if (!r.rows.length) {
        return { обновлено: false, причина: 'скилл не найден (или чужой)' }
      }
      return { обновлено: true, id: r.rows[0].id, имя: r.rows[0].name }
    },
  },

  {
    name: 'skills_delete',
    description: 'Удалить скилл по id. Бесплатно.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'integer' } },
      required: ['id'],
      additionalProperties: false,
    },
    async handler(args, ctx) {
      await ensureSkillsTable(ctx)
      const r = await ctx.pool.query(
        `DELETE FROM user_skills WHERE id = $1 AND telegram_id = $2 RETURNING name`,
        [args.id, ctx.telegramId]
      )
      if (!r.rows.length)
        return { удалено: false, причина: 'скилл не найден (или чужой)' }
      return { удалено: true, имя: r.rows[0].name }
    },
  },

  {
    name: 'skills_publish',
    description:
      'Сделать свой скилл публичным (или обратно приватным) — попасть на витрину ' +
      'маркета: другие смогут установить его себе копией. Бесплатно.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        public: {
          type: 'boolean',
          description: 'true — опубликовать, false — скрыть',
        },
      },
      required: ['id', 'public'],
      additionalProperties: false,
    },
    async handler(args, ctx) {
      await ensureSkillsTable(ctx)
      const r = await ctx.pool.query(
        `UPDATE user_skills SET is_public = $3, updated_at = now()
         WHERE id = $1 AND telegram_id = $2 RETURNING name`,
        [args.id, ctx.telegramId, args.public === true]
      )
      if (!r.rows.length)
        return { опубликовано: false, причина: 'скилл не найден' }
      return {
        опубликовано: args.public === true,
        имя: r.rows[0].name,
        витрина:
          args.public === true
            ? 'скилл виден в skills_market'
            : 'скрыт с витрины',
      }
    },
  },

  {
    name: 'skills_market',
    description:
      'Витрина публичных скиллов других людей: имя, выдержка, автор. Установка — ' +
      'skills_install (копия к себе, правишь свободно). Бесплатно.',
    parameters: noArgs,
    async handler(_a, ctx) {
      await ensureSkillsTable(ctx)
      const r = await ctx.pool.query(
        `SELECT s.id, s.name, left(s.content, 160) AS excerpt,
                COALESCE(u.username, 'автор') AS author
         FROM user_skills s
         LEFT JOIN users u ON u.telegram_id = s.telegram_id
         WHERE s.is_public = TRUE AND s.telegram_id <> $1
         ORDER BY s.updated_at DESC LIMIT 50`,
        [ctx.telegramId]
      )
      return { на_витрине: r.rows.length, скиллы: r.rows }
    },
  },

  {
    name: 'skills_install',
    description:
      'Установить публичный скилл с витрины себе (копия). Бесплатно.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'integer', description: 'id с витрины skills_market' },
      },
      required: ['id'],
      additionalProperties: false,
    },
    async handler(args, ctx) {
      await ensureSkillsTable(ctx)
      const src = await ctx.pool.query(
        `SELECT name, content FROM user_skills WHERE id = $1 AND is_public = TRUE`,
        [args.id]
      )
      if (!src.rows.length)
        return { установлено: false, причина: 'скилла нет на витрине' }
      const { name, content } = src.rows[0]
      const r = await ctx.pool.query(
        `INSERT INTO user_skills (telegram_id, name, content)
         VALUES ($1, $2, $3)
         ON CONFLICT (telegram_id, name) DO UPDATE
           SET content = EXCLUDED.content, updated_at = now()
         RETURNING id`,
        [ctx.telegramId, name, content]
      )
      return { установлено: true, id: r.rows[0].id, имя: name }
    },
  },

  {
    name: 'soul_get',
    description:
      'Прочитать ЛИЧНЫЙ SOUL.md владельца: кем он себя считает, каким голосом писать его посты, ' +
      'какие у него темы и границы. Если SOUL пуст — предложи человеку заполнить его вместе: ' +
      'задай 3-4 вопроса (кто ты, чем зарабатываешь, какой тон запрещён, чего избегать).',
    parameters: noArgs,
    async handler(_a, ctx) {
      await ctx.pool.query(
        `CREATE TABLE IF NOT EXISTS user_soul (
           telegram_id text PRIMARY KEY,
           content     text NOT NULL,
           updated_at  timestamptz NOT NULL DEFAULT now()
         )`
      )
      const r = await ctx.pool.query(
        `SELECT content, updated_at::text FROM user_soul WHERE telegram_id = $1`,
        [ctx.telegramId]
      )
      if (!r.rows.length) {
        return {
          есть: false,
          подсказка:
            'SOUL пуст. Заполни вместе с человеком через soul_edit — или предложи ему раздел в профиле.',
        }
      }
      return {
        есть: true,
        обновлён: r.rows[0].updated_at,
        soul: r.rows[0].content,
      }
    },
  },

  {
    name: 'soul_edit',
    description:
      'Записать ЛИЧНЫЙ SOUL.md владельца — как свой скилл: агент правит по просьбе человека ' +
      '(«добавь в мой SOUL, что я фотографирую в горах», «сделай тон мягче»). ' +
      'Структура свободная, но полезны блоки: кто я, чем зарабатываю, тон голоса, что запрещено. ' +
      'Полная перезапись: передавай весь текст целиком.',
    parameters: {
      type: 'object',
      properties: {
        soul: {
          type: 'string',
          description: 'полный текст личного SOUL.md (markdown), до 32 КБ',
        },
      },
      required: ['soul'],
      additionalProperties: false,
    },
    async handler(args, ctx) {
      const soul = String(args.soul ?? '')
      // Лимит как у честного поля профиля: SOUL — это карточка голоса,
      // не дневник. 32 КБ хватает на страницу текста с запасом.
      if (!soul.trim()) {
        return {
          сохранено: false,
          причина: 'пустой SOUL не сохраняем — удалять нечем',
        }
      }
      if (soul.length > 32_768) {
        return {
          сохранено: false,
          причина: `слишком длинно: ${soul.length} символов, лимит 32768`,
        }
      }
      await ctx.pool.query(
        `CREATE TABLE IF NOT EXISTS user_soul (
           telegram_id text PRIMARY KEY,
           content     text NOT NULL,
           updated_at  timestamptz NOT NULL DEFAULT now()
         )`
      )
      await ctx.pool.query(
        `INSERT INTO user_soul (telegram_id, content)
         VALUES ($1, $2)
         ON CONFLICT (telegram_id)
         DO UPDATE SET content = EXCLUDED.content, updated_at = now()`,
        [ctx.telegramId, soul]
      )
      return { сохранено: true, символов: soul.length }
    },
  },
]

export const TOOLS_BY_NAME = new Map(TOOLS.map(t => [t.name, t]))

/** Формат OpenAI tool-calling. Схема ОДНА и та же, что уходит наружу по MCP. */
export function toOpenAITools() {
  return TOOLS.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }))
}

/** Формат MCP tools/list. */
export function toMcpTools() {
  return TOOLS.map(t => ({
    name: t.name,
    description: t.description,
    inputSchema: t.parameters,
  }))
}
