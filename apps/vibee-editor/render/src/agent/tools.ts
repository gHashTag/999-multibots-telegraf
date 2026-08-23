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
 * ЧЕГО ЗДЕСЬ НАМЕРЕННО НЕТ. Платных генераций (image/video/audio/lipsync).
 * Списания баланса в рендер-сервере не существует: слов balance/deduct/credits
 * в 4000 строк файла нет вовсе. Дать агенту платный инструмент до того, как
 * появится списание, — значит открыть бесплатный кран к FAL и ElevenLabs за
 * счёт владельца. Появится списание — появятся и эти инструменты.
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
      const base =
        process.env.SELF_URL ||
        'http://127.0.0.1:' + (process.env.PORT || '3000')
      const r = await fetch(`${base}/compositions`)
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
        `SELECT id, type, storage_path, trigger_word, created_at::text
         FROM assets WHERE telegram_id = $1
         ORDER BY created_at DESC LIMIT $2`,
        [ctx.telegramId, limit]
      )
      return { всего: r.rows.length, файлы: r.rows }
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
      const asJson = (v: unknown, d: string) =>
        v == null ? d : JSON.stringify(v)
      const r = await ctx.pool.query(
        `INSERT INTO public_templates (
           telegram_id, creator_name, creator_username, name, description,
           thumbnail_url, video_url, template_settings, assets, tracks,
           is_public, likes_count, views_count, uses_count)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,TRUE,0,0,0)
         RETURNING id, created_at::text`,
        [
          ctx.telegramId,
          u.rows[0]?.n ?? 'Автор',
          u.rows[0]?.un ?? '',
          args.name,
          args.description,
          args.thumbnail_url ?? null,
          args.video_url,
          asJson(args.template_settings, '{}'),
          asJson(args.assets, '[]'),
          asJson(args.tracks, '[]'),
        ]
      )
      return {
        опубликовано: true,
        id: r.rows[0].id,
        создано: r.rows[0].created_at,
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
