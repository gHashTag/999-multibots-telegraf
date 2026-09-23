/**
 * КОНТЕНТ-ПЛАН: цели и карточки под них.
 *
 * Живёт отдельным файлом, а не строками в `tools.ts`: тот уже за тысячу строк,
 * и каждая новая группа инструментов в нём делает файл менее читаемым, не
 * более. Реестр по-прежнему один — `tools.ts` подмешивает этот массив.
 *
 * МОДЕЛЬ. Цель («Продать курс») → карточки («Разбор ошибки №1», статус,
 * ссылка на вышедший ролик). Верхний уровень — цель, а не дата: сроки у
 * одиночного автора плывут, цель держится месяцами. Дата у карточки есть, но
 * как пометка, а не как ось.
 *
 * ГРАНИЦА. `telegram_id` берётся ТОЛЬКО из подтверждённого контекста — как и
 * во всех остальных инструментах. Каждый запрос, включая обновление и
 * удаление по id, фильтруется по нему: иначе любой, кто умеет подставить
 * число, правил бы чужой план.
 */

import type { AgentTool, ToolContext } from './tools'
import { EDITORIAL_PREFIX } from '../../editorial-key-scope'

const STATUSES = ['idea', 'doing', 'done'] as const
type Status = (typeof STATUSES)[number]

/** По-русски — для человека в интерфейсе и для агента в ответе. */
const STATUS_RU: Record<Status, string> = {
  idea: 'замысел',
  doing: 'в работе',
  done: 'вышло',
}

/**
 * Таблицы создаются лениво при первом обращении — как `user_soul` и
 * `user_skills`. Отдельного механизма миграций в этом сервисе нет, и заводить
 * его ради двух таблиц значит добавить вторую точку правды о схеме.
 */
async function ensurePlanTables(ctx: ToolContext): Promise<void> {
  await ctx.pool.query(
    `CREATE TABLE IF NOT EXISTS content_plan_goals (
       id          serial PRIMARY KEY,
       telegram_id text NOT NULL,
       title       text NOT NULL,
       intent      text,
       created_at  timestamptz NOT NULL DEFAULT now(),
       UNIQUE (telegram_id, title)
     )`
  )
  await ctx.pool.query(
    `CREATE TABLE IF NOT EXISTS content_plan_items (
       id          serial PRIMARY KEY,
       goal_id     integer NOT NULL
                   REFERENCES content_plan_goals(id) ON DELETE CASCADE,
       telegram_id text NOT NULL,
       title       text NOT NULL,
       note        text,
       status      text NOT NULL DEFAULT 'idea',
       template_id text,
       created_at  timestamptz NOT NULL DEFAULT now(),
       updated_at  timestamptz NOT NULL DEFAULT now()
     )`
  )
  // Выборка всегда идёт по владельцу — без индекса это seq scan по всей
  // таблице у КАЖДОГО человека, а не только у владельца плана.
  await ctx.pool.query(
    `CREATE INDEX IF NOT EXISTS content_plan_items_owner
       ON content_plan_items (telegram_id, goal_id)`
  )
}

const MAX_TITLE = 200
const MAX_NOTE = 4096
const MAX_GOALS = 50
const MAX_ITEMS_PER_GOAL = 200

function clean(v: unknown): string {
  return String(v ?? '').trim()
}

export const planTools: AgentTool[] = [
  {
    name: 'plan_list',
    description:
      'Контент-план человека: цели и карточки под каждой. Смотри сюда, прежде ' +
      'чем предлагать темы — половина уже придумана. Бесплатно.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async handler(_a, ctx) {
      await ensurePlanTables(ctx)
      const goals = await ctx.pool.query(
        `SELECT id, title, intent, created_at::text
         FROM content_plan_goals
         WHERE telegram_id = $1
         ${ctx.scope === 'leela-editorial' ? "AND title LIKE 'Leela:%'" : ''}
         ORDER BY created_at`,
        [ctx.telegramId]
      )
      if (!goals.rows.length) {
        return {
          целей: 0,
          цели: [],
          подсказка:
            'План пуст. Спроси человека, чего он хочет добиться, и заведи ' +
            'цель через plan_goal_create — потом набросай под неё карточки.',
        }
      }
      const items = await ctx.pool.query(
        `SELECT id, goal_id, title, note, status, template_id, updated_at::text
         FROM content_plan_items
         WHERE telegram_id = $1
         ${ctx.scope === 'leela-editorial' ? "AND goal_id = ANY($2::int[]) AND title LIKE 'Leela:%'" : ''}
         ORDER BY goal_id, id`,
        ctx.scope === 'leela-editorial'
          ? [ctx.telegramId, goals.rows.map(g => g.id)]
          : [ctx.telegramId]
      )
      const byGoal = new Map<number, unknown[]>()
      for (const it of items.rows) {
        const list = byGoal.get(it.goal_id) ?? []
        list.push({
          id: it.id,
          название: it.title,
          заметка: it.note ?? undefined,
          статус: STATUS_RU[it.status as Status] ?? it.status,
          ролик: it.template_id ?? undefined,
        })
        byGoal.set(it.goal_id, list)
      }
      return {
        целей: goals.rows.length,
        цели: goals.rows.map(g => ({
          id: g.id,
          цель: g.title,
          зачем: g.intent ?? undefined,
          карточки: byGoal.get(g.id) ?? [],
        })),
      }
    },
  },

  {
    name: 'plan_goal_create',
    description:
      'Завести цель в контент-плане («Продать курс», «Набрать 1000 подписчиков»). ' +
      'Под неё потом добавляются карточки через plan_item_add. Бесплатно.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'короткое имя цели' },
        intent: {
          type: 'string',
          description: 'зачем она человеку, его словами — необязательно',
        },
      },
      required: ['title'],
      additionalProperties: false,
    },
    async handler(args, ctx) {
      const title = clean(args.title)
      const intent = clean(args.intent)
      if (
        ctx.scope === 'leela-editorial' &&
        !title.startsWith(EDITORIAL_PREFIX)
      ) {
        return {
          ['создано']: false,
          ['причина']: 'Editorial goal titles must start with Leela:',
        }
      }
      if (!title) return { создано: false, причина: 'нужно непустое title' }
      if (title.length > MAX_TITLE) {
        return { создано: false, причина: `имя цели до ${MAX_TITLE} символов` }
      }
      await ensurePlanTables(ctx)
      const count = await ctx.pool.query(
        `SELECT count(*)::int AS n FROM content_plan_goals WHERE telegram_id = $1`,
        [ctx.telegramId]
      )
      if (count.rows[0].n >= MAX_GOALS) {
        return {
          создано: false,
          причина: `целей уже ${MAX_GOALS} — это не план, а свалка; удали лишние`,
        }
      }
      // ON CONFLICT, а не проверка-и-вставка: между SELECT и INSERT
      // помещается второй вызов, и тогда падает уникальный индекс.
      const r = await ctx.pool.query(
        `INSERT INTO content_plan_goals (telegram_id, title, intent)
         VALUES ($1, $2, NULLIF($3, ''))
         ON CONFLICT (telegram_id, title) DO NOTHING
         RETURNING id`,
        [ctx.telegramId, title, intent]
      )
      if (!r.rows.length) {
        return { создано: false, причина: `цель «${title}» уже есть` }
      }
      return { создано: true, id: r.rows[0].id, цель: title }
    },
  },

  {
    name: 'plan_goal_delete',
    description:
      'Удалить цель вместе со всеми её карточками. Действие необратимо — ' +
      'спроси человека, прежде чем звать. Бесплатно.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'integer', description: 'id цели из plan_list' },
      },
      required: ['id'],
      additionalProperties: false,
    },
    async handler(args, ctx) {
      await ensurePlanTables(ctx)
      const r = await ctx.pool.query(
        `DELETE FROM content_plan_goals
         WHERE id = $1 AND telegram_id = $2
         RETURNING title`,
        [args.id, ctx.telegramId]
      )
      if (!r.rows.length) return { удалено: false, причина: 'цель не найдена' }
      return { удалено: true, цель: r.rows[0].title }
    },
  },

  {
    name: 'plan_item_add',
    description:
      'Добавить карточку под цель: замысел ролика или поста. Ставь ОДНУ мысль ' +
      'на карточку — иначе план не читается. Бесплатно.',
    parameters: {
      type: 'object',
      properties: {
        goal_id: { type: 'integer', description: 'id цели из plan_list' },
        title: { type: 'string', description: 'о чём ролик, одной строкой' },
        note: { type: 'string', description: 'детали, тезисы, референсы' },
      },
      required: ['goal_id', 'title'],
      additionalProperties: false,
    },
    async handler(args, ctx) {
      const title = clean(args.title)
      const note = clean(args.note)
      if (
        ctx.scope === 'leela-editorial' &&
        !title.startsWith(EDITORIAL_PREFIX)
      ) {
        return {
          ['добавлено']: false,
          ['причина']: 'Editorial item titles must start with Leela:',
        }
      }
      if (!title) return { добавлено: false, причина: 'нужно непустое title' }
      if (title.length > MAX_TITLE) {
        return {
          добавлено: false,
          причина: `название до ${MAX_TITLE} символов`,
        }
      }
      if (note.length > MAX_NOTE) {
        return { добавлено: false, причина: `заметка до ${MAX_NOTE} символов` }
      }
      await ensurePlanTables(ctx)
      // Цель проверяется ПО ВЛАДЕЛЬЦУ, а не по существованию: без этого
      // чужой goal_id принял бы карточку в чужую папку.
      const goal = await ctx.pool.query(
        `SELECT title FROM content_plan_goals WHERE id = $1 AND telegram_id = $2
         ${ctx.scope === 'leela-editorial' ? "AND title LIKE 'Leela:%'" : ''}`,
        [args.goal_id, ctx.telegramId]
      )
      if (!goal.rows.length) {
        return { добавлено: false, причина: 'цель не найдена' }
      }
      const count = await ctx.pool.query(
        `SELECT count(*)::int AS n FROM content_plan_items
         WHERE telegram_id = $1 AND goal_id = $2`,
        [ctx.telegramId, args.goal_id]
      )
      if (count.rows[0].n >= MAX_ITEMS_PER_GOAL) {
        return {
          добавлено: false,
          причина: `под целью уже ${MAX_ITEMS_PER_GOAL} карточек — разбери их`,
        }
      }
      const r = await ctx.pool.query(
        `INSERT INTO content_plan_items (goal_id, telegram_id, title, note)
         VALUES ($1, $2, $3, NULLIF($4, ''))
         RETURNING id`,
        [args.goal_id, ctx.telegramId, title, note]
      )
      return { добавлено: true, id: r.rows[0].id, цель: goal.rows[0].title }
    },
  },

  {
    name: 'plan_item_update',
    description:
      'Изменить карточку: название, заметку, статус (idea / doing / done) или ' +
      'привязать вышедший ролик по template_id. Когда ролик отрендерен и ' +
      'опубликован — поставь done и template_id. Бесплатно.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'integer', description: 'id карточки из plan_list' },
        title: { type: 'string' },
        note: { type: 'string' },
        status: { type: 'string', enum: ['idea', 'doing', 'done'] },
        template_id: {
          type: 'string',
          description: 'id опубликованного шаблона из feed_publish',
        },
      },
      required: ['id'],
      additionalProperties: false,
    },
    async handler(args, ctx) {
      const status = clean(args.status)
      if (status && !STATUSES.includes(status as Status)) {
        return {
          изменено: false,
          причина: `статус только из: ${STATUSES.join(', ')}`,
        }
      }
      const title = clean(args.title)
      if (title.length > MAX_TITLE) {
        return { изменено: false, причина: `название до ${MAX_TITLE} символов` }
      }
      const note = clean(args.note)
      if (note.length > MAX_NOTE) {
        return { изменено: false, причина: `заметка до ${MAX_NOTE} символов` }
      }
      await ensurePlanTables(ctx)
      // COALESCE(NULLIF(...)) — пустая строка означает «не трогать это поле»,
      // иначе обновление названия стирало бы заметку.
      const r = await ctx.pool.query(
        `UPDATE content_plan_items
         SET title       = COALESCE(NULLIF($2, ''), title),
             note        = COALESCE(NULLIF($3, ''), note),
             status      = COALESCE(NULLIF($4, ''), status),
             template_id = COALESCE(NULLIF($5, ''), template_id),
             updated_at  = now()
         WHERE id = $1 AND telegram_id = $6
         RETURNING title, status`,
        [args.id, title, note, status, clean(args.template_id), ctx.telegramId]
      )
      if (!r.rows.length)
        return { изменено: false, причина: 'карточка не найдена' }
      return {
        изменено: true,
        название: r.rows[0].title,
        статус: STATUS_RU[r.rows[0].status as Status] ?? r.rows[0].status,
      }
    },
  },

  {
    name: 'plan_item_delete',
    description: 'Удалить карточку из плана. Бесплатно.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'integer', description: 'id карточки из plan_list' },
      },
      required: ['id'],
      additionalProperties: false,
    },
    async handler(args, ctx) {
      await ensurePlanTables(ctx)
      const r = await ctx.pool.query(
        `DELETE FROM content_plan_items
         WHERE id = $1 AND telegram_id = $2
         RETURNING title`,
        [args.id, ctx.telegramId]
      )
      if (!r.rows.length)
        return { удалено: false, причина: 'карточка не найдена' }
      return { удалено: true, карточка: r.rows[0].title }
    },
  },
]
