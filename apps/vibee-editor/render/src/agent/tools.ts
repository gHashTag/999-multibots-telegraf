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

import { planTools } from './plan-tools'
import { pricingSummary, providerSetup, CLUB } from './pricing'
import { editImage, EDIT_MODEL } from '../kie-image'

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
/**
 * The caller's own Telegram avatar, as a URL a third-party model can fetch.
 *
 * TWO REASONS THIS IS NOT A ONE-LINER.
 *
 * 1. THE PROFILE URL IS NOT AN IMAGE. whoami hands back
 *    https://t.me/i/userpic/320/<hash>.svg -- an SVG placeholder, not the
 *    photograph. Feeding it to an image model produces a picture of nothing.
 * 2. THE TELEGRAM FILE URL CARRIES THE BOT TOKEN. api.telegram.org/file/bot
 *    <TOKEN>/<path> is the only way to fetch the real JPEG, and handing that
 *    address to an external provider would publish the token to it. So the
 *    bytes are pulled HERE and re-published to our own S3, and only that link
 *    leaves the building.
 *
 * Returns '' when there is no photo or no bot token, and the caller refuses
 * out loud rather than generating something unrelated.
 */
async function ownerAvatarUrl(ctx: any): Promise<string> {
  const tid = String(ctx?.telegramId || '')
  const token =
    process.env.TELEGRAM_BOT_TOKEN ||
    process.env.BOT_TOKEN_1 ||
    process.env.TELEGRAM_CHANNEL_BOT_TOKEN ||
    ''
  if (!tid || !token) return ''
  try {
    const api = `https://api.telegram.org/bot${token}`
    const list: any = await (
      await fetch(`${api}/getUserProfilePhotos?user_id=${tid}&limit=1`)
    ).json()
    const photo = list?.result?.photos?.[0]
    if (!photo?.length) return ''
    // Largest size: an img2img source is only as good as its pixels.
    const big = photo.reduce((a: any, b: any) => (b.width > a.width ? b : a))
    const file: any = await (
      await fetch(`${api}/getFile?file_id=${encodeURIComponent(big.file_id)}`)
    ).json()
    const path = file?.result?.file_path
    if (!path) return ''
    const bin = await fetch(`https://api.telegram.org/file/bot${token}/${path}`)
    if (!bin.ok) return ''
    const bytes = Buffer.from(await bin.arrayBuffer())
    const up = await selfFetch(`${selfBase()}/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': bin.headers.get('content-type') || 'image/jpeg',
        'X-Filename': `avatar-${tid}-${Date.now()}.jpg`,
      },
      body: new Uint8Array(bytes),
    })
    const data: any = await up.json().catch(() => null)
    return data?.directUrl || ''
  } catch {
    // A missing avatar is not an error worth crashing a tool call over; the
    // caller turns '' into a stated refusal.
    return ''
  }
}

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
/*
 * ЦЕНЫ БЕРУТСЯ ИЗ ОБЩЕЙ ТАБЛИЦЫ, А НЕ ИЗ СВОЕЙ.
 *
 * Здесь стояла ВТОРАЯ копия: свои `COST_PER_TOKEN_USD`, `OPERATION_COST_USD`
 * и `priceFor` — и БЕЗ НАЦЕНКИ. Пока общий путь считал 2 / 12 / 2 / 40,
 * агентский продавал по 1 / 6 / 1 / 20, то есть ровно по себестоимости.
 *
 * `billing-shared.ts` в своей шапке прямо говорит, что оба пути генерации
 * берут цены оттуда, «чтобы они не разошлись». Этот файл её не импортировал
 * ни разу — и они разошлись ровно вдвое, молча, потому что каждая таблица по
 * отдельности «посчитана верно». Тот же класс, что уже чинили между клиентом
 * и сервером (#1961), между списанием и возвратом (#1992).
 */
export {
  TOKEN_PRICES,
  COST_PER_TOKEN_USD,
  OPERATION_COST_USD,
} from './billing-shared'
import {
  TOKEN_PRICES,
  COST_PER_TOKEN_USD,
  OPERATION_COST_USD,
} from './billing-shared'

const TOKEN_START = 20

/**
 * Wallets that belong to the HOUSE, not to a customer: the autopilot and any
 * other in-house automation running under an agent key. Their work costs us
 * nothing at a provider (a TrinityBlogReel render is local Remotion), so
 * metering them against a customer wallet only stops our own factory -- which
 * is exactly what happened on 2026-08-27, for 51 hours.
 *
 * Set HOUSE_TELEGRAM_IDS="144022504,..." on the render service. Empty by
 * default: nobody is exempt unless deployment says so.
 */
const HOUSE_TELEGRAM_IDS = (process.env.HOUSE_TELEGRAM_IDS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

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

/** Запущенные рендеры: чат без состояния, иначе renderId теряется навсегда. */
async function ensureRendersTable(ctx: ToolContext): Promise<void> {
  await ctx.pool.query(
    `CREATE TABLE IF NOT EXISTS agent_renders (
       id          serial PRIMARY KEY,
       telegram_id text NOT NULL,
       render_id   text NOT NULL UNIQUE,
       title       text,
       created_at  timestamptz NOT NULL DEFAULT now()
     )`
  )
  await ctx.pool.query(
    `CREATE INDEX IF NOT EXISTS agent_renders_owner
       ON agent_renders (telegram_id, created_at DESC)`
  )
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

  // THE HOUSE DOES NOT BILL ITSELF.
  //
  // The autopilot runs as a normal agent key, so its telegram_id is a normal
  // wallet: it got the TOKEN_START grant of 20, spent 1 per reel, and on
  // 2026-08-27 hit zero and refused forever. The content factory then stood
  // still for 51 hours with the journal line about missing tokens -- the
  // journal -- a self-inflicted stop, since a TrinityBlogReel render costs the
  // house nothing at any provider (local Remotion). The b-roll path already
  // sidesteps this by calling the render API server-to-server with
  // RENDER_API_KEY (a CHANNEL expense, not a human wallet); reel_render simply
  // never got the same treatment.
  //
  // Allowlist rather than making the operation free for everyone: pricing for
  // real users is a product decision, not a bug fix.
  if (HOUSE_TELEGRAM_IDS.includes(ctx.telegramId)) {
    console.log(`[токены] дом не платит себе: «${tool}» для ${ctx.telegramId}`) // cyrillic-ok: log text
    return { ok: true, потрачено: 0 } // cyrillic-ok: existing return field
  }

  // Проверка баланса и списание — ОДНИМ атомарным запросом.
  //
  // Раньше было два шага: сначала read balance, потом безусловный
  // `balance = balance - price`. Между ними — окно гонки: два параллельных
  // вызова (человек нажал дважды, агент запустил две генерации) оба читают
  // balance=25, оба проходят проверку `25 >= 20`, оба списывают по 20 — и
  // баланс уходит в −15. Владелец платит за то, за что не заплатили.
  //
  // `WHERE balance >= $price` делает проверку и вычитание неделимыми: под
  // READ COMMITTED второй UPDATE ждёт блокировку строки, перечитывает уже
  // списанный баланс и не проходит условие — 0 строк, честный отказ.
  await ensureTokenRow(ctx) // гарантируем, что строка есть
  const r = await ctx.pool.query(
    `UPDATE user_tokens SET balance = balance - $2, updated_at = now()
     WHERE telegram_id = $1 AND balance >= $2 RETURNING balance`,
    [ctx.telegramId, price]
  )
  if (r.rows.length === 0) {
    const balance = await ensureTokenRow(ctx)
    return {
      ok: false,
      причина:
        `не хватает токенов: нужно ${price}, есть ${balance}. ` +
        'Пополняется звёздами Telegram — скажи человеку и предложи бесплатные действия (лента, SOUL, ремикс из готовых файлов)',
    }
  }
  return { ok: true, потрачено: price, осталось: r.rows[0].balance }
}

/**
 * ВОЗВРАТ токенов, если работа не сделана.
 *
 * ЦЕНА ОТСУТСТВИЯ, ИЗМЕРЕННАЯ. Списание стояло ПЕРЕД вызовом провайдера, а
 * возврата не было вовсе — ни одного на весь файл. Замер 2026-08-26 прямыми
 * запросами к провайдерам: у FAL «User is locked. Reason: Exhausted balance»,
 * ключ ElevenLabs хранит идентификатор вместо ключа. То есть человек просил
 * картинку, у него списывался токен, провайдер отвечал отказом — и токен
 * пропадал. За озвучку так пропадало шесть.
 *
 * Возврат идёт тем же UPDATE, что и списание, и НЕ роняет ответ: если
 * вернуть не удалось, инструмент всё равно честно скажет, что не получилось,
 * а расхождение уйдёт в лог. Молча проглотить отказ хуже, чем показать его.
 */
async function refundTokens(
  ctx: ToolContext,
  tool: string,
  why: string
): Promise<void> {
  const price = TOKEN_PRICES[tool]
  if (!price) return

  /**
   * THE HOUSE IS NOT PAID BY ITSELF EITHER -- the mirror of spendTokens.
   *
   * spendTokens returns early for a HOUSE wallet and charges it nothing. This
   * function did not, so a failed house operation credited the full price that
   * was never taken: tokens minted out of nothing, and the house balance drifts
   * upward by one price per provider failure. The exemption has to hold on BOTH
   * sides or it is not an exemption, it is a faucet.
   *
   * This also has to land BEFORE any new refund is added elsewhere in this
   * file: every refund site that exists today, and every one added tomorrow,
   * mints for a house wallet until this branch is here.
   */
  if (HOUSE_TELEGRAM_IDS.includes(ctx.telegramId)) {
    console.log(
      `[токены] дом не возвращает себе: «${tool}» для ${ctx.telegramId}` // cyrillic-ok: log text
    )
    return
  }

  try {
    await ctx.pool.query(
      `UPDATE user_tokens SET balance = balance + $2, updated_at = now()
       WHERE telegram_id = $1`,
      [ctx.telegramId, price]
    )
    console.log(`[токены] возврат ${price} за «${tool}»: ${why}`)
  } catch (e) {
    console.error(`[токены] ВОЗВРАТ НЕ ВЫПОЛНЕН ${price} за «${tool}»`, e)
  }
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

import { ценаТокенов, названиеСчёта } from './token-packs'
import { CRM_TOOLS } from './crm-tools'
import { HIVE_TOOLS } from './hive-tools'
import { TELEGRAM_TOOLS } from './telegram-tools'
import { PROJECT_TOOLS } from './project-tools'

export const TOOLS: AgentTool[] = [
  {
    name: 'whoami',
    description:
      'Кто вызывает инструменты: telegram_id, имя, ССЫЛКА НА ЕГО ФОТО и сколько у него ' +
      'опубликованных роликов. Зови ПЕРВЫМ, когда человек просит сделать что-то «про меня»: ' +
      'зная имя и лицо, историю можно строить про него, а не про абстракцию.',
    parameters: noArgs,
    async handler(_args, ctx) {
      /**
       * Аватар входит в ответ НАМЕРЕННО.
       *
       * Владелец попросил прямо: «аватарка юзера по дефолту фото — добавь в
       * контекст агенту, чтобы он из него создавал историю». До этого агент
       * не видел лица человека вообще: ни в одном инструменте не было ссылки
       * на фото, и «сделай ролик про меня» он мог только выдумать.
       *
       * Берём из profiles, а не из users: синк из Telegram пишет аватар
       * именно туда, и там же он обновляется, когда человек меняет фото.
       */
      const u = await ctx.pool.query(
        `SELECT u.telegram_id, COALESCE(u.username,'') AS username,
                COALESCE(u.first_name,'') AS first_name,
                COALESCE(p.avatar_url, '') AS avatar_url,
                COALESCE(p.display_name, '') AS display_name
         FROM users u
         LEFT JOIN profiles p ON p.telegram_id = u.telegram_id
         WHERE u.telegram_id = $1 LIMIT 1`,
        [ctx.telegramId]
      )
      const c = await ctx.pool.query(
        `SELECT COUNT(*)::int AS n FROM public_templates
         WHERE telegram_id = $1 AND is_public = TRUE AND deleted_at IS NULL`,
        [ctx.telegramId]
      )
      const профиль = u.rows[0] ?? null
      const аватар = String(профиль?.avatar_url || '')
      return {
        telegram_id: ctx.telegramId,
        профиль,
        опубликовано: c.rows[0]?.n ?? 0,
        аватар: аватар || undefined,
        подсказкаПроАватар: аватар
          ? 'Это лицо человека — опирайся на него, когда придумываешь историю ' +
            'про него самого. Перерисовать его инструментом image_edit МОЖНО: ' +
            'без image_url он сам берёт эту аватарку и сохраняет лицо. ' +
            'image_generate по-прежнему только текстовый.'
          : 'Фото профиля нет. Предложи поставить аватар — тогда истории будут ' +
            'про него самого, а не про абстракцию.',
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
      'Опубликовать ролик в ленту. Заголовок и текст — ПО-РУССКИ, даже если исходный ' +
      'материал английский: продукт русскоязычный. ВАЖНО: текст поста (description) обязателен и должен содержать ' +
      'хештеги — по канону проекта к каждому видео идёт текст для инстаграма. ' +
      'Публикация от имени того, кто вызвал инструмент; чужой telegram_id подставить нельзя.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description:
            'название ролика ПО-РУССКИ. Замер 2026-08-27: у русских заголовков ' +
            '2.6 просмотра в среднем (19 роликов), у английских — 1.0 (4 ролика). ' +
            'Выборка мала, но продукт русскоязычный, и английский заголовок в нём ' +
            'читается как чужой. Материал на английском (например блог t27.ai) — ' +
            'ПЕРЕВЕДИ заголовок, а не копируй.',
        },
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
          /**
           * АГЕНТ ПУБЛИКУЕТ СКРЫТО: в ленту пост попадает только с одобрения.
           *
           * В `public_templates` ведёт одна дверь, и зовут её двое: веб — по
           * нажатию человека, и вот этот вызов — сам. Владелец просил, чтобы
           * посторонние видели только одобренное, а разницы между двумя
           * вызывающими не было никакой.
           *
           * Пост не теряется: он лежит скрытым и ждёт в разделе «Ждут
           * одобрения» (`GET /api/feed/pending`), где его показывают ТОЛЬКО
           * автору. Одно нажатие — и он в ленте.
           */
          is_public: false,
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
    name: 'feed_unpublish',
    /**
     * Снять свою публикацию из ленты.
     *
     * ЗАЧЕМ. Из 31 инструмента у скиллов, целей и карточек плана есть
     * удаление, а у ленты не было ничего. `feed_publish` была дверью в одну
     * сторону: всё, что агент опубликовал — по ошибке, по недопонятой
     * просьбе, просто дублем, — оставалось там навсегда, и попросить убрать
     * было НЕЧЕМ.
     *
     * Нашлось потому, что я сам это и сделал: гоняя «бесплатные» сценарии,
     * попросил агента «опубликуй мой лучший ролик ещё раз» — он послушался и
     * создал дубль в живой ленте. Бесплатно в токенах не значит безопасно.
     *
     * УДАЛЕНИЯ ЗДЕСЬ НЕТ. Ставится `deleted_at` — строка остаётся на месте,
     * просмотры и лайки целы, и повторная публикация того же ролика
     * возвращает его обратно (upsert по имени сбрасывает `deleted_at`).
     * Необратимых кнопок агенту не даём.
     */
    description:
      'Снять СВОЮ публикацию из ленты по её id. Это скрытие, а не удаление: ' +
      'ролик и его просмотры целы, публикация того же ролика вернёт его в ' +
      'ленту. Чужие записи снять нельзя.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'id записи в ленте (из feed_list)' },
      },
      required: ['id'],
    },
    async handler(a, ctx) {
      const id = String((a as { id?: unknown }).id ?? '').trim()
      if (!id) return { снято: false, причина: 'нужен id записи из feed_list' }

      /**
       * Идём в СВОЙ маршрут DELETE /api/feed/:id, а не пишем в таблицу сами.
       *
       * Здесь стоял отдельный UPDATE — вторая дверь в public_templates. В этом
       * же файле такая вторая дверь уже была у публикации и молча разошлась с
       * первой: ролики автопилота не уходили в Telegram-канал, потому что
       * постинг живёт в обработчике, а прямой INSERT его не проходил.
       * Повторять не будем: правило снятия должно быть ровно одно, и оно —
       * в маршруте.
       */
      const res = await selfFetch(
        `${selfBase()}/api/feed/${encodeURIComponent(id)}` +
          `?telegram_id=${encodeURIComponent(ctx.telegramId)}`,
        { method: 'DELETE' }
      )
      const body = (await res.json().catch(() => ({}))) as {
        снято?: boolean
        название?: string
        error?: string
      }
      if (body.снято) {
        return {
          снято: true,
          id,
          название: body.название,
          подсказка:
            'Из ленты убрано. Ролик и его просмотры целы — опубликуй его снова, ' +
            'и запись вернётся на место.',
        }
      }
      return {
        снято: false,
        причина: body.error || `не удалось снять: HTTP ${res.status}`,
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
    name: 'image_edit',
    description:
      'ПЕРЕРИСОВАТЬ ФОТО по описанию (img2img). Без image_url берётся АВАТАРКА ' +
      'самого человека из Telegram — то есть «сделай историю про меня» работает ' +
      'без единого файла от него. Лицо сохраняется. Файл ложится в S3 и в «мои ' +
      'файлы», ссылку можно сразу отдавать в reel_render или в ленту.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'во что перерисовать, по-русски или по-английски',
        },
        image_url: {
          type: 'string',
          description:
            'что перерисовывать. Не задан — берётся аватарка вызывающего',
        },
        aspect_ratio: {
          type: 'string',
          description: '9:16 по умолчанию (вертикаль для рилса), 1:1, 16:9',
        },
      },
      required: ['prompt'],
      additionalProperties: false,
    },
    async handler(args, ctx) {
      if ((await generationsLeftToday(ctx)) <= 0) {
        return {
          done: false,
          reason: `суточный лимит генераций (${DAILY_GENERATION_CAP}) исчерпан — защита баланса владельца.`,
        }
      }
      /**
       * PROVIDER FIRST, CHARGE SECOND -- and this order is the point.
       *
       * Everywhere else in this file the charge comes first and a refund
       * follows a failure. That is how tokens vanished into a locked FAL
       * account: the money left, the refund path had to be trusted, and the
       * person was told a price for a service that could not run. Here the key
       * is checked before anything is taken.
       */
      if (!process.env.KIE_AI_API_KEY)
        return {
          done: false,
          reason:
            'провайдер img2img не настроен в сервисе (нет KIE_AI_API_KEY) — ' +
            'ничего не списано',
        }

      const source = args.image_url
        ? String(args.image_url)
        : await ownerAvatarUrl(ctx)
      if (!source)
        return {
          done: false,
          reason:
            'нечего перерисовывать: аватарка не читается, а image_url не задан',
        }

      const charge = await spendTokens(ctx, 'image_generate')
      if (!charge.ok)
        // The charge helper reports its refusal under a Russian key; this is
        // the file's long-standing convention and not worth churning here.
        return { done: false, reason: charge['причина'] } // cyrillic-ok

      const edited = await editImage({
        prompt: String(args.prompt),
        imageUrl: source,
        aspectRatio: args.aspect_ratio ? String(args.aspect_ratio) : '9:16',
      })
      if (!edited.ok) {
        await refundTokens(
          ctx,
          'image_generate',
          'провайдер не выполнил работу'
        )
        return { done: false, reason: edited.reason }
      }

      // The provider's link is temporary; pull the bytes into our own S3 before
      // handing the URL onward, exactly as image_generate does -- otherwise the
      // feed and the render show a broken image an hour later.
      const got = await fetch(edited.url)
      if (!got.ok) {
        await refundTokens(
          ctx,
          'image_generate',
          'провайдер не выполнил работу'
        )
        return {
          done: false,
          reason: `картинка готова, но не скачалась: HTTP ${got.status}`,
          providerUrl: edited.url,
        }
      }
      const bytes = Buffer.from(await got.arrayBuffer())
      const up = await selfFetch(`${selfBase()}/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': got.headers.get('content-type') || 'image/png',
          'X-Filename': `agent-edit-${Date.now()}.png`,
        },
        body: new Uint8Array(bytes),
      })
      const upData: any = await up.json().catch(() => null)
      if (!up.ok || !upData?.directUrl) {
        await refundTokens(
          ctx,
          'image_generate',
          'провайдер не выполнил работу'
        )
        return {
          done: false,
          reason: `картинка готова, но не сохранилась: HTTP ${up.status}`,
          providerUrl: edited.url,
        }
      }
      /**
       * REGISTER THE FILE, OR IT DOES NOT EXIST FOR THE PERSON WHO PAID.
       *
       * The mini app -- which is where the owner sees an agent's work -- reads
       * the `assets` table, not S3. This tool shipped without the insert, so a
       * picture reached the bucket, the caller got a URL in a chat message, and
       * my_assets still showed 2026-08-24 as the newest file: a week stale.
       * Measured 2026-08-31 through the production MCP.
       *
       * A failure here must NOT fail the call: the picture exists and was paid
       * for. It is reported instead, so the gap is visible rather than silent.
       */
      let assetId: number | null = null
      let assetError: string | null = null
      try {
        const row = await ctx.pool.query(
          `INSERT INTO assets (type, trigger_word, telegram_id, storage_path, public_url, text, bot_name)
           VALUES ('generated_image', '', $1, '', $2, $3, 'agent')
           RETURNING id`,
          [ctx.telegramId, upData.directUrl, String(args.prompt).slice(0, 500)]
        )
        assetId = row.rows[0]?.id ?? null
      } catch (e) {
        assetError = String((e as Error)?.message || e).slice(0, 160)
      }
      return {
        done: true,
        url: upData.directUrl,
        id: assetId,
        // Named so a caller can tell "the file is in the shop window" from
        // "the file exists but nobody can find it".
        inGallery: assetId != null,
        ...(assetError ? { galleryError: assetError } : {}),
        source: args.image_url ? 'указанный файл' : 'аватарка из Telegram',
        model: EDIT_MODEL,
        providerCredits: edited.credits,
        charged: TOKEN_PRICES.image_generate,
      }
    },
  },

  {
    name: 'image_generate',
    description:
      'Сгенерировать картинку по описанию. Провайдер выбирается сам: сначала FAL, ' +
      'потом Replicate flux-schnell, потом Kie google/nano-banana — кто первый сделает. ' +
      'В ответе поле «провайдер» говорит, кто нарисовал, а «отказы» — кто не смог и почему. ' +
      'Файл сохраняется в S3 и появляется в «моих файлах», отдаёт прямую ссылку — ' +
      'её можно сразу отдавать в reel_render или публиковать в ленту.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'что нарисовать, по-русски или по-английски',
        },
        model: {
          // A PREFERENCE, NOT A PROMISE, and saying so is the whole point.
          // These ids only select the FAL endpoint; when FAL refuses -- which
          // it does today, HTTP 403 "Exhausted balance" -- the picture comes
          // from Replicate or Kie and the id asked for was never used. A caller
          // told otherwise would report the wrong model in its own artefacts.
          type: 'string',
          description:
            'ПОЖЕЛАНИЕ по модели FAL, не гарантия: fal-ai/nano-banana-pro (по умолчанию), ' +
            'fal-ai/flux/dev, fal-ai/flux-pro/v1.1-ultra, fal-ai/reve/text-to-image. ' +
            'Если FAL откажет, рисовать будет другой провайдер — смотри «провайдер» в ответе.',
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
      /**
       * WHO REFUSED, CARRIED OUT OF THE ROUTE AND INTO THE CALLER'S HANDS.
       *
       * The route already collects one refusal per provider in `tried`. Until
       * now this handler read `url` and threw the rest away, so the only place
       * that knew WHY there was no engraving was a console line inside a
       * container with no volume -- which is exactly how the layer stayed dead
       * for weeks with nobody able to name the cause. An autopilot that gets
       * these two fields can write them into the published recipe, where they
       * outlive the container.
       */
      const servedBy: string | null =
        typeof genData?.provider === 'string' ? genData.provider : null
      const refusals: { provider: string; error: string }[] = Array.isArray(
        genData?.tried
      )
        ? genData.tried
        : []
      if (!gen.ok || !genData?.url) {
        await refundTokens(
          ctx,
          'image_generate',
          'провайдер не выполнил работу'
        )
        return {
          сделано: false,
          // Quoted, so the repository's Cyrillic guard reads this as the string
          // it is -- the tool's own response field -- rather than as a Russian
          // identifier newly added to code.
          причина:
            `генерация не удалась: HTTP ${gen.status} ${String(genData?.error || '')}`.slice(
              0,
              600
            ),
          // English keys for the new fields, and deliberately the SAME words
          // the HTTP route uses: one name for one fact from the provider chain
          // through the tool to the feed row, so a grep for `provider` finds
          // the whole path instead of three translations of it.
          provider: servedBy,
          tried: refusals,
        }
      }
      // A provider URL is short-lived (Kie hands back a tempfile link), so the
      // bytes are pulled into our own S3 at once. Without this the feed and the
      // render would both show a broken image an hour later.
      const img = await fetch(genData.url) // внешний провайдер — ключ не нужен
      if (!img.ok) {
        await refundTokens(
          ctx,
          'image_generate',
          'провайдер не выполнил работу'
        )
        return {
          сделано: false,
          причина: `картинка сгенерирована, но не скачалась: HTTP ${img.status}`,
          provider: servedBy,
          tried: refusals,
          sourceUrl: genData.url,
        }
      }
      const bytes = Buffer.from(await img.arrayBuffer())
      // The extension follows the bytes. It used to be hard-coded .jpg while
      // Kie hands back image/png (measured), so every Kie poster was stored
      // under a name that lied about its own format -- harmless until something
      // downstream trusts the extension instead of the header.
      const contentType = img.headers.get('content-type') || 'image/jpeg'
      const ext = contentType.includes('png')
        ? 'png'
        : contentType.includes('webp')
          ? 'webp'
          : 'jpg'
      const up = await selfFetch(`${base}/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': contentType,
          'X-Filename': `agent-image-${Date.now()}.${ext}`,
        },
        body: new Uint8Array(bytes),
      })
      const upData: any = await up.json().catch(() => null)
      if (!up.ok || !upData?.directUrl) {
        await refundTokens(
          ctx,
          'image_generate',
          'провайдер не выполнил работу'
        )
        return {
          сделано: false,
          причина: `S3 не принял файл: HTTP ${up.status}`,
          provider: servedBy,
          tried: refusals,
          sourceUrl: genData.url,
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
        // Named on SUCCESS too, not only on failure. A poster that arrived
        // from the third leg cost 4 Kie credits out of the same purse the
        // talking heads spend from at 18 credits a second; a caller that
        // cannot tell that from a free-ish Replicate hit cannot budget.
        provider: servedBy,
        tried: refusals,
        подсказка:
          'ссылка готова: отдай её в reel_render как слой или в feed_publish',
      })
    },
  },

  {
    name: 'audio_generate',
    description:
      'Озвучить текст голосом (ElevenLabs). Без voice_id берётся КЛОН ВЛАДЕЛЬЦА, ' +
      'а если своего клона в аккаунте нет — библиотечный, и это будет сказано в ответе. ' +
      'Работает ТОЛЬКО при валидном ключе аккаунта: если вернулась ' +
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
      /**
       * Голос по умолчанию — КЛОН ВЛАДЕЛЬЦА, а не первый попавшийся.
       *
       * Было `voices[0].voice_id`: первый в ответе ElevenLabs — это, как
       * правило, готовый голос из библиотеки. Владелец спросил напрямую:
       * «в рилсах клон голоса мой где?» — нигде. Понятия «мой голос» в коде
       * не существовало вовсе, и рилсы озвучивались чужим тембром.
       *
       * ElevenLabs помечает происхождение голоса полем `category`:
       * `premade` — библиотечный, `cloned`/`professional`/`generated` — свой.
       * Берём первый НЕ библиотечный; если своих нет — библиотечный, но об
       * этом честно сообщаем в ответе, чтобы агент мог предложить записать
       * клон.
       *
       * Поле `id`, а не `voice_id`: /api/voices переименовывает его при
       * упрощении ответа, и обращение к `voice_id` давало undefined —
       * то есть запасной путь молча не срабатывал.
       */
      let voiceId = args.voice_id ? String(args.voice_id) : ''
      let голосВладельца = false
      if (!voiceId) {
        const v = await selfFetch(`${base}/api/voices`)
        const vData: any = await v.json().catch(() => null)
        const list: any[] = Array.isArray(vData?.voices) ? vData.voices : []
        const свой = list.find(
          x => String(x?.category || '').toLowerCase() !== 'premade'
        )
        voiceId = String(
          (свой ?? list[0])?.id || (свой ?? list[0])?.voice_id || ''
        )
        голосВладельца = !!свой
      }
      if (!voiceId) {
        await refundTokens(
          ctx,
          'audio_generate',
          'провайдер не выполнил работу'
        )
        return {
          сделано: false,
          причина: 'не нашёлся ни один голос — проверь ELEVENLABS_API_KEY',
        }
      }
      // Агент должен знать, чьим голосом озвучено: если библиотечным —
      // стоит предложить человеку записать свой клон.
      const голос = args.voice_id
        ? 'выбран явно'
        : голосВладельца
          ? 'клон владельца'
          : 'библиотечный — своего клона в аккаунте нет, предложи записать'
      const gen = await selfFetch(`${base}/api/generate/audio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: String(args.text), voice_id: voiceId }),
      })
      const genData: any = await gen.json().catch(() => null)
      if (!gen.ok || !genData?.url) {
        await refundTokens(
          ctx,
          'audio_generate',
          'провайдер не выполнил работу'
        )
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
        голос,
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
        await refundTokens(
          ctx,
          'video_generate',
          'провайдер не выполнил работу'
        )
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
        await refundTokens(ctx, 'reel_render', 'провайдер не выполнил работу')
        return {
          началось: false,
          причина: `рендер не стартовал: HTTP ${start.status} ${String(startData?.error || '')}`,
        }
      }
      const renderId: string = startData.renderId
      /**
       * ЗАПИСЫВАЕМ КАЖДЫЙ ЗАПУЩЕННЫЙ РЕНДЕР.
       *
       * Найдено полным прогоном: агент собрал рилс, а следующим запросом
       * честно сказал «renderId у меня нет — в этом чате рендер не
       * запускался. Придумывать его не буду». Чат без состояния, а
       * render_status требует идентификатор, который взять неоткуда.
       *
       * То есть агент мог запустить работу и никогда не узнать, чем она
       * кончилась. Одна строка в таблицу — и рендер перестаёт теряться.
       * Ошибку записи глотаем: потерять ЛОГ хуже, чем потерять рендер, но
       * уронить из-за лога сам рендер — хуже всего.
       */
      try {
        await ensureRendersTable(ctx)
        await ctx.pool.query(
          `INSERT INTO agent_renders (telegram_id, render_id, title)
           VALUES ($1, $2, $3) ON CONFLICT (render_id) DO NOTHING`,
          [ctx.telegramId, renderId, String(args.name || '').slice(0, 200)]
        )
      } catch (e) {
        console.error('[рендеры] не записал запуск', renderId, e)
      }
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
    name: 'tokens_invoice',
    description:
      'Выставить счёт на ПОКУПКУ токенов за звёзды Telegram — на любое количество, ' +
      'не только на готовые пакеты. Возвращает ссылку на оплату и цену. ' +
      'Бесплатно: счёт — это предложение, деньги спишет Telegram только после подтверждения человеком. ' +
      'Называй цену ИЗ ОТВЕТА этого инструмента, а не по памяти: шкала со скидкой за объём, ' +
      'и придуманное число будет обещанием, за которое платит владелец. ' +
      'Тарифов и подписок нет — есть только токены.',
    parameters: {
      type: 'object',
      properties: {
        tokens: {
          type: 'number',
          description: 'сколько токенов купить, целое число от 1',
        },
      },
      required: ['tokens'],
    },
    async handler(a: any, ctx) {
      /*
       * Цена считается ЗДЕСЬ ЖЕ той же шкалой, что и в маршруте счёта, а не
       * пересказывается моделью: пересказ разошёлся бы с кассой в тот день,
       * когда шкалу поправят.
       */
      const цена = ценаТокенов(Number(a?.tokens))
      const PAY_BOT = process.env.TOKENS_PAYMENT_BOT_TOKEN || ''
      if (!PAY_BOT) {
        throw new Error(
          'касса не настроена: TOKENS_PAYMENT_BOT_TOKEN не задан — счёт выставить нечем'
        )
      }
      const о = await fetch(
        `https://api.telegram.org/bot${PAY_BOT}/createInvoiceLink`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: названиеСчёта(цена.токенов),
            description: 'Токены для генераций в Trinity S³AI',
            // Тот же payload, что и у маршрута: его разбирает бот и
            // переправляет зачисление сюда. Разойдись он — оплата не
            // зачислилась бы, а деньги ушли бы.
            payload: `tokens:${цена.токенов}:${ctx.telegramId}`,
            currency: 'XTR',
            prices: [
              { label: названиеСчёта(цена.токенов), amount: цена.звёзд },
            ],
          }),
        }
      )
      const д: any = await о.json()
      if (!д?.ok || !д?.result) {
        throw new Error(`Telegram не выдал ссылку: ${String(д?.description).slice(0, 200)}`)
      }
      return {
        ссылка: д.result,
        токенов: цена.токенов,
        звёзд: цена.звёзд,
        звёзд_за_токен: Number(цена.звёздЗаТокен.toFixed(4)),
        как_платить:
          'открой ссылку в Telegram и подтверди — токены зачислятся сразу после оплаты',
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
    /**
     * SOUL ДРУГОГО ЧЕЛОВЕКА — ПО ИМЕНИ, БЕЗ ПОДПИСИ.
     *
     * SOUL.md открыт намеренно: на нём строится знакомство. Человек находит
     * человека по интересам, а внешний агент a2a — обоих. Закрытый SOUL
     * связывать никого не может, и без этого инструмента агент мог прочитать
     * только СВОЙ — то есть не мог найти никого.
     *
     * Только чтение. Правка чужого SOUL невозможна: `soul_edit` пишет строго
     * по личности вызывающего.
     */
    name: 'soul_of',
    description:
      'Прочитать ОТКРЫТЫЙ SOUL.md другого человека по его имени пользователя: ' +
      'кем он себя считает, какие у него темы и интересы. Нужен, чтобы находить ' +
      'людей по интересам и предлагать знакомство. Правки чужого SOUL нет.',
    parameters: {
      type: 'object',
      properties: {
        username: {
          type: 'string',
          description: 'Имя пользователя без «@», как в профиле.',
        },
      },
      required: ['username'],
    },
    async handler(a: Record<string, unknown>, ctx) {
      const имя = String(a.username ?? '').replace(/^@/, '').trim()
      if (!имя) return { ok: false, error: 'нужно имя пользователя' }
      const r = await ctx.pool.query(
        `SELECT us.content, us.updated_at::text AS updated_at, p.username
           FROM profiles p
           LEFT JOIN user_soul us ON us.telegram_id = p.telegram_id::text
          WHERE p.username = $1
          LIMIT 1`,
        [имя]
      )
      if (r.rows.length === 0) return { ok: false, error: 'такого имени нет' }
      // Пустой SOUL и отсутствующий человек — РАЗНЫЕ ответы: спутав их, агент
      // пойдёт искать несуществующего.
      return {
        ok: true,
        username: r.rows[0].username,
        soul: r.rows[0].content ?? '',
        updatedAt: r.rows[0].updated_at ?? null,
      }
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

  /**
   * КОНТЕНТ-ПЛАН — цели и то, что под них снимается.
   *
   * ЗАЧЕМ ОТДЕЛЬНАЯ СУЩНОСТЬ, А НЕ ЗАМЕТКИ. У человека с генератором роликов
   * узкое место не «как снять», а «что и зачем». Лента показывает то, что уже
   * вышло; здесь лежит то, что ещё не вышло, и главное — ПОД КАКУЮ ЦЕЛЬ.
   *
   * Верхний уровень — цель («Продать курс», «Набрать 1000 подписчиков»), а не
   * дата: сроки у одиночного автора плывут, а цель держится месяцами. Внутри
   * цели — карточки: замысел, статус, ссылка на вышедший ролик.
   *
   * ЧТО ДЕЛАЕТ ЭТО НЕ БЛОКНОТОМ. План читает и пишет агент теми же
   * инструментами, что и человек. «Составь план на неделю под цель Х» —
   * plan_item_add; «сделай следующий из плана» — reel_render плюс
   * plan_item_update со статусом. Общий список, две пары рук.
   */
  {
    /**
     * ПОЧЕМУ ЭТО ГЛАВНЫЙ ИНСТРУМЕНТ ЧЕСТНОСТИ.
     *
     * Приветствие агента заканчивается словами «могу сразу сделать картинку
     * за 1 токен — только скажи тему». Замер 2026-08-26: у FAL кончился
     * баланс, ключ ElevenLabs хранит идентификатор. То есть агент обещал
     * ровно то, чего сделать не мог, а человек узнавал это, уже потратив ход.
     *
     * Токен теперь возвращается при отказе, но обещание всё равно ложное.
     * Инструмент даёт агенту способ ПРОВЕРИТЬ, прежде чем обещать.
     */
    name: 'providers_status',
    description:
      'Что из платного работает ПРЯМО СЕЙЧАС: картинки (FAL), озвучка (ElevenLabs), ' +
      'видео (Replicate), сам агент (GLM). Зови ПЕРЕД тем, как предложить платное ' +
      'действие или пообещать результат: провайдер бывает мёртв по балансу или ключу, ' +
      'и обещать в этот момент нечестно. Если что-то не работает — скажи человеку прямо, ' +
      'что именно и почему, и предложи бесплатное: ленту, файлы, план, ремикс готового. ' +
      'Бесплатно.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async handler(_a, ctx) {
      const r = await selfFetch(`${selfBase()}/api/providers`)
      const d: any = await r.json().catch(() => null)
      if (!r.ok || !d) {
        return {
          проверено: false,
          причина: `страница здоровья не ответила: HTTP ${r.status}`,
        }
      }
      const мёртвые = (d['провайдеры'] || [])
        .filter(
          (p: any) => !p.ok && !String(p['провайдер']).includes('не обязателен')
        )
        .map(
          (p: any) => `${p['провайдер']}: ${String(p['детали']).slice(0, 160)}`
        )
      return {
        работает: d['работает'],
        всего: d['всего'],
        неработает: мёртвые,
        подсказка: мёртвые.length
          ? 'НЕ ОБЕЩАЙ то, что в списке «неработает». Скажи человеку честно, ' +
            'что именно сломано, и предложи бесплатное действие взамен.'
          : 'Всё на месте — можно предлагать любое платное действие.',
      }
    },
  },

  {
    name: 'my_renders',
    description:
      'Последние рендеры человека: когда запущен, как назывался, готов ли и ссылка. ' +
      'Зови, когда спрашивают «что там с моим роликом» или когда сам запустил рендер ' +
      'в прошлом разговоре: чат без состояния, и renderId иначе взять неоткуда. ' +
      'Бесплатно.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 20,
          description: 'сколько, по умолчанию 5',
        },
      },
      additionalProperties: false,
    },
    async handler(args, ctx) {
      await ensureRendersTable(ctx)
      const limit = Math.min(20, Math.max(1, Number(args.limit) || 5))
      const r = await ctx.pool.query(
        `SELECT render_id, title, created_at::text
         FROM agent_renders WHERE telegram_id = $1
         ORDER BY created_at DESC LIMIT $2`,
        [ctx.telegramId, limit]
      )
      if (!r.rows.length) {
        /**
         * «Ещё не было» — не всегда правда, и врать тут нельзя.
         *
         * Запись рендеров появилась 2026-08-27; всё, что собрано раньше, в
         * таблицу не попало. Человек, у которого рилсы есть, услышал бы
         * «рендеров не было» и справедливо решил, что мы потеряли его работу.
         * Готовые ролики при этом лежат в файлах и в ленте — туда и посылаем.
         */
        return {
          всего: 0,
          подсказка:
            'В этом списке пусто. Учёт рендеров ведётся с 27 августа — всё, что ' +
            'собрано раньше, сюда не попало. ВНИМАНИЕ: это НЕ значит, что у ' +
            'человека нет роликов. Прежде чем сказать хоть слово о его ленте ' +
            'или файлах — ВЫЗОВИ feed_list и my_assets. Пустота здесь про ' +
            'этот список и только про него.',
        }
      }
      // Статус спрашиваем у сервера: в таблице он устарел бы через минуту.
      const рендеры = await Promise.all(
        r.rows.map(async row => {
          try {
            const st = await selfFetch(
              `${selfBase()}/render/${encodeURIComponent(row.render_id)}`
            )
            const d: any = await st.json().catch(() => null)
            const url = d?.publicUrl || d?.outputUrl
            return {
              renderId: row.render_id,
              название: row.title || undefined,
              запущен: row.created_at,
              статус: st.ok
                ? d?.status || 'неизвестно'
                : `не найден (HTTP ${st.status})`,
              ссылка:
                url && !String(url).startsWith('http')
                  ? `${selfBase()}${url}`
                  : url,
            }
          } catch (e) {
            return {
              renderId: row.render_id,
              запущен: row.created_at,
              статус: `не спросить: ${e instanceof Error ? e.message : String(e)}`,
            }
          }
        })
      )
      return { всего: рендеры.length, рендеры }
    },
  },

  {
    name: 'pricing',
    description:
      'Что БЕСПЛАТНО и что ПЛАТНО в Trinity S³AI, и тарифы клуба. Зови, когда ' +
      'человек спрашивает про деньги, токены, стоимость, «сколько стоит», ' +
      'подписку или клуб. Бесплатно.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async handler() {
      return pricingSummary()
    },
  },
  {
    name: 'provider_setup',
    description:
      'Как настроить/оплатить провайдера (replicate/fal/elevenlabs/glm/openai/' +
      'pollinations): что даёт, статус (работает/нужна оплата/нужен ключ), какая ' +
      'переменная, где взять ключ, сколько стоит. Зови, когда человек хочет ' +
      'подключить провайдера или спрашивает, почему что-то не работает и что ' +
      'сделать. Без аргумента — все провайдеры. Бесплатно.',
    parameters: {
      type: 'object',
      properties: {
        provider: {
          type: 'string',
          description:
            'имя провайдера (fal, elevenlabs, replicate, glm, openai, pollinations); пусто — все',
        },
      },
      additionalProperties: false,
    },
    async handler(args: Record<string, any>) {
      return providerSetup(args?.provider)
    },
  },
  {
    name: 'club',
    description:
      'Тарифы клуба Trinity S³AI: Basic $99/мес (доступ к харнесу — агент и все ' +
      'функции производства) и Pro $999/мес (всё из Basic + групповые встречи раз ' +
      'в неделю). Зови на вопросы про клуб, доступ, подписку, участие. Бесплатно.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async handler() {
      return {
        тарифы: CLUB,
        как_вступить:
          'Оплата подписки — в мини-аппе или боте через Telegram Stars.',
      }
    },
  },

  ...planTools,
]

/**
 * Telegram tools are appended, not inlined, and the separation is the point:
 * they are the only tools that read text written by people other than the
 * owner. Keeping them in one module keeps the boundary auditable — you can
 * read every place foreign content enters the agent in a single file.
 */
TOOLS.push(...TELEGRAM_TOOLS)
/*
 * CRM встаёт в тот же реестр: агент должен уметь ответить «кто мои люди»
 * там же, где отвечает про ленту и баланс. Инструменты только показывают —
 * рассылки среди них нет намеренно (см. crm-tools.ts).
 */
TOOLS.push(...CRM_TOOLS)
TOOLS.push(...PROJECT_TOOLS)
/*
 * Пульс улья — сюда же. Это ответ на «как дела у проекта», и спрашивают его
 * в том же чате, где спрашивают про баланс и ленту. Область видимости у
 * инструмента своя (`hive/roles.ts`): смотритель видит ферму, владелец —
 * своих ботов, остальные — только себя.
 */
TOOLS.push(...HIVE_TOOLS)

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
