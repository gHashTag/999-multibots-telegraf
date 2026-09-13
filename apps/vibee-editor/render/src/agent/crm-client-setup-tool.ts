/**
 * SET UP A CLIENT'S WORKSPACE FROM A BUNDLED CLIENT PACKAGE.
 *
 * Duet runs 1-5 on 2026-09-13 showed the seller agent selling to @playom with
 * nothing known about her: a generic blog reel, an off-brand generated image,
 * the app link sent twice. The fix is not a better prompt but a client package
 * the seller can read: `src/agent/clients/<client>/` holds her draft SOUL, a
 * structured profile (business, audience hypotheses, discovery questions,
 * content series, forbidden claims, visual tokens) and the skills her own
 * editorial agent would carry. This tool installs that package into the rows
 * the rest of the app already reads: user_soul, user_skills, the content plan,
 * and one new table for the profile itself.
 *
 * WHY OWNER-ONLY. The rows are written under ANOTHER person's telegram_id.
 * That is legitimate only because she connected her own account (tg_sessions)
 * and the platform owner runs it on her behalf; a seller cannot set up another
 * seller. Her SOUL is never overwritten by default: if she wrote one, hers
 * stays and the tool says so. Skills that exist with different content are
 * reported as conflicts, not replaced (the leela-999-sync contract in the Leela
 * repo asks exactly this: skip identical, hold conflicts, never exactly-once).
 *
 * WHAT THE SELLER READS. `crm_client_profile` returns the profile and what is
 * installed, so the seller opens the conversation with discovery questions and
 * proposes the client's own template (LeelaPlanReel), not the catalogue.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AgentTool, ToolContext } from './tools'
import { requireOwner, isSeller } from './telegram-tools'

const HERE = dirname(fileURLToPath(import.meta.url))
const CLIENTS_DIR = join(HERE, 'clients')

export const DEFAULT_CLIENT = 'playom'
export const DEFAULT_CLIENT_ID = '435572800'
/** The Leela repo's sync contract prefixes every imported private row. */
export const SKILL_PREFIX = 'Leela: '
export const REEL_GOAL_TITLE = 'Leela: серия рилс LeelaPlanReel v1'

export interface ClientPackage {
  client: string
  soul: string
  profile: Record<string, unknown>
  skills: { name: string; content: string }[]
}

/** First markdown H1 becomes the skill name; the file body is the content. */
export function skillNameFromMarkdown(md: string, fallback: string): string {
  const m = md.match(/^#\s+(.+)$/m)
  const raw = (m?.[1] ?? fallback).trim()
  return raw.startsWith(SKILL_PREFIX) ? raw : SKILL_PREFIX + raw
}

export function loadClientPackage(client: string = DEFAULT_CLIENT): ClientPackage {
  const safe = client.replace(/[^a-z0-9_-]/gi, '')
  const dir = join(CLIENTS_DIR, safe)
  if (!safe || !existsSync(join(dir, 'profile.json'))) {
    throw new Error(`Пакет клиента «${client}» не найден`) // cyrillic-ok
  }
  const profile = JSON.parse(readFileSync(join(dir, 'profile.json'), 'utf8'))
  const soulPath = join(dir, 'SOUL.md')
  const soul = existsSync(soulPath) ? readFileSync(soulPath, 'utf8').trim() : ''
  const skillsDir = join(dir, 'skills')
  const skills = existsSync(skillsDir)
    ? readdirSync(skillsDir)
        .filter(f => f.endsWith('.md'))
        .sort()
        .map(f => {
          const content = readFileSync(join(skillsDir, f), 'utf8').trim()
          return { name: skillNameFromMarkdown(content, f.replace(/\.md$/, '')), content }
        })
    : []
  return { client: safe, soul, profile, skills }
}

/** The twelve reel ideas the seller proposes, one canonical plan each. */
export const REEL_SERIES: { title: string; plan: number | null; note: string }[] = [
  { title: 'Вход только с шестёрки — план 6 «Заблуждение (моха)»', plan: 6, note: 'Крючок: «Следующий ход — не обязательно следующий бросок».' },
  { title: '68 на старте — ещё не победа', plan: 68, note: 'Начальное состояние хранит 68 до входа; победа — только точное попадание.' },
  { title: '68 «Космическое Сознание» — Цветок Жизни без цифры', plan: 68, note: 'Единственная клетка без номера на доске.' },
  { title: '72 → 51: последний номер поля — не финиш', plan: 72, note: 'Змея Тамогуны возвращает на 51.' },
  { title: '12 → 8: змея Зависти', plan: 12, note: 'Змея меняет положение фишки, не ваше достоинство.' },
  { title: '17 → 69: стрела Сострадания', plan: 17, note: 'Стрела — не награда, а движение.' },
  { title: '26 «Милосердие (даана)» — читать план без ярлыка', plan: 26, note: 'Название клетки не приписывается человеку.' },
  { title: '55 → 3: змея Эгоизма', plan: 55, note: 'Самая длинная змея доски.' },
  { title: '63 → 2: змея Тамаса', plan: 63, note: 'Из ряда Сахасрары — в первый ряд.' },
  { title: 'Отчёт — не экзамен на правильный смысл', plan: null, note: 'Одна фраза вместо дневника; несогласие — тоже отчёт.' },
  { title: '46 → 62: стрела Различения', plan: 46, note: 'Аджна → Сахасрара.' },
  { title: 'Групповой стол: один вопрос, разные планы', plan: null, note: 'Формат для канала: каждый приходит со своим вопросом.' },
]

/**
 * WHO OWNS A PROFILE (spec crm-client-ownership.t27, #3608).
 *
 * The first cut keyed the table by telegram_id alone: one profile per person
 * on the whole installation, so a second seller would have read and
 * overwritten the first seller's notes about the same client. The owner
 * column is nullable on purpose -- live rows exist with no owner, and a NOT
 * NULL key would either refuse the migration or invent one. Legacy rows are
 * backfilled from crm_people (the ingest already knows which owner met whom);
 * whatever is still unowned stays readable by any seller and is claimed by
 * the next crm_client_setup, which always writes owner_id.
 *
 * Idempotent: every statement is a no-op the second time.
 */
export async function ensureProfileTable(ctx: ToolContext): Promise<void> {
  await ctx.pool.query(
    `CREATE TABLE IF NOT EXISTS crm_client_profiles (
       telegram_id text NOT NULL,
       owner_id    text,
       client      text NOT NULL,
       profile     jsonb NOT NULL,
       updated_at  timestamptz NOT NULL DEFAULT now()
     )`
  )
  await ctx.pool.query(
    `ALTER TABLE crm_client_profiles ADD COLUMN IF NOT EXISTS owner_id text`
  )
  // The legacy PRIMARY KEY (telegram_id) forbids two sellers holding two
  // profiles of one person; drop it only where it still exists.
  const pk = await ctx.pool.query(
    `SELECT 1 FROM pg_constraint WHERE conname = 'crm_client_profiles_pkey'`
  )
  if (pk.rows?.length) {
    await ctx.pool.query(
      `ALTER TABLE crm_client_profiles DROP CONSTRAINT crm_client_profiles_pkey`
    )
  }
  await ctx.pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS crm_client_profiles_owner_client
       ON crm_client_profiles (owner_id, telegram_id)`
  )
  try {
    await ctx.pool.query(
      `UPDATE crm_client_profiles p
          SET owner_id = (SELECT owner_id FROM crm_people c
                           WHERE c.lead_id = p.telegram_id
                           ORDER BY c.seen_at DESC LIMIT 1)
        WHERE p.owner_id IS NULL`
    )
  } catch {
    // No crm_people table on this base: rows stay unowned until claimed.
  }
}

/** SQL fragment: the caller's own rows and the rows nobody has claimed. */
export const PROFILE_OWNER_WHERE = `(owner_id = $2 OR owner_id IS NULL)`

async function ensureSoulTable(ctx: ToolContext): Promise<void> {
  await ctx.pool.query(
    `CREATE TABLE IF NOT EXISTS user_soul (
       telegram_id text PRIMARY KEY,
       content     text NOT NULL,
       updated_at  timestamptz NOT NULL DEFAULT now()
     )`
  )
}

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
}

export async function ensurePlanTables(ctx: ToolContext): Promise<void> {
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
       goal_id     integer NOT NULL REFERENCES content_plan_goals(id) ON DELETE CASCADE,
       telegram_id text NOT NULL,
       title       text NOT NULL,
       note        text,
       status      text NOT NULL DEFAULT 'idea',
       template_id text,
       created_at  timestamptz NOT NULL DEFAULT now(),
       updated_at  timestamptz NOT NULL DEFAULT now()
     )`
  )
}

export interface SetupReport {
  client: string
  telegram_id: string
  dry_run: boolean
  soul: 'created' | 'kept_hers' | 'overwritten' | 'empty_package'
  skills: { name: string; result: 'created' | 'identical' | 'conflict' | 'overwritten' }[]
  profile: 'written'
  plan: { goal: 'created' | 'exists'; items_added: number }
}

export async function setupClient(
  ctx: ToolContext,
  o: {
    client: string
    telegramId: string
    overwriteSoul: boolean
    overwriteSkills: boolean
    withPlan: boolean
    dryRun: boolean
  }
): Promise<SetupReport> {
  const pkg = loadClientPackage(o.client)
  const id = o.telegramId
  const report: SetupReport = {
    client: pkg.client,
    telegram_id: id,
    dry_run: o.dryRun,
    soul: 'empty_package',
    skills: [],
    profile: 'written',
    plan: { goal: 'exists', items_added: 0 },
  }

  await ensureSoulTable(ctx)
  await ensureSkillsTable(ctx)
  await ensureProfileTable(ctx)

  if (pkg.soul) {
    const has = await ctx.pool.query(
      `SELECT content FROM user_soul WHERE telegram_id = $1`,
      [id]
    )
    if (has.rows.length && !o.overwriteSoul) {
      report.soul = 'kept_hers'
    } else {
      report.soul = has.rows.length ? 'overwritten' : 'created'
      if (!o.dryRun) {
        await ctx.pool.query(
          `INSERT INTO user_soul (telegram_id, content, updated_at)
           VALUES ($1, $2, now())
           ON CONFLICT (telegram_id) DO UPDATE SET content = $2, updated_at = now()`,
          [id, pkg.soul]
        )
      }
    }
  }

  for (const s of pkg.skills) {
    const cur = await ctx.pool.query(
      `SELECT content FROM user_skills WHERE telegram_id = $1 AND name = $2`,
      [id, s.name]
    )
    if (!cur.rows.length) {
      report.skills.push({ name: s.name, result: 'created' })
      if (!o.dryRun) {
        await ctx.pool.query(
          `INSERT INTO user_skills (telegram_id, name, content) VALUES ($1, $2, $3)`,
          [id, s.name, s.content]
        )
      }
    } else if (String(cur.rows[0].content).trim() === s.content) {
      report.skills.push({ name: s.name, result: 'identical' })
    } else if (o.overwriteSkills) {
      report.skills.push({ name: s.name, result: 'overwritten' })
      if (!o.dryRun) {
        await ctx.pool.query(
          `UPDATE user_skills SET content = $3, updated_at = now()
           WHERE telegram_id = $1 AND name = $2`,
          [id, s.name, s.content]
        )
      }
    } else {
      report.skills.push({ name: s.name, result: 'conflict' })
    }
  }

  if (!o.dryRun) {
    const owner = String(ctx.telegramId)
    // Claim a legacy unowned row for this client before writing our own, so
    // the setup does not leave one unowned and one owned copy side by side.
    await ctx.pool.query(
      `UPDATE crm_client_profiles SET owner_id = $2
        WHERE telegram_id = $1 AND owner_id IS NULL`,
      [id, owner]
    )
    await ctx.pool.query(
      `INSERT INTO crm_client_profiles (telegram_id, owner_id, client, profile, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, now())
       ON CONFLICT (owner_id, telegram_id) DO UPDATE
         SET client = $3, profile = $4::jsonb, updated_at = now()`,
      [id, owner, pkg.client, JSON.stringify(pkg.profile)]
    )
  }

  if (o.withPlan) {
    await ensurePlanTables(ctx)
    const goal = await ctx.pool.query(
      `SELECT id FROM content_plan_goals WHERE telegram_id = $1 AND title = $2`,
      [id, REEL_GOAL_TITLE]
    )
    let goalId: number | null = goal.rows[0]?.id ?? null
    if (goalId == null) {
      report.plan.goal = 'created'
      if (!o.dryRun) {
        const r = await ctx.pool.query(
          `INSERT INTO content_plan_goals (telegram_id, title, intent)
           VALUES ($1, $2, $3) RETURNING id`,
          [id, REEL_GOAL_TITLE, 'Привести на доску со своим вопросом — один план, один рил.'] // cyrillic-ok
        )
        goalId = r.rows[0]?.id ?? null
      }
    }
    if (goalId != null) {
      const have = await ctx.pool.query(
        `SELECT title FROM content_plan_items WHERE telegram_id = $1 AND goal_id = $2`,
        [id, goalId]
      )
      const titles = new Set(have.rows.map((r: { title: string }) => r.title))
      for (const it of REEL_SERIES) {
        if (titles.has(it.title)) continue
        report.plan.items_added++
        if (!o.dryRun) {
          await ctx.pool.query(
            `INSERT INTO content_plan_items (goal_id, telegram_id, title, note, template_id)
             VALUES ($1, $2, $3, $4, $5)`,
            [goalId, id, it.title, it.plan == null ? it.note : `План ${it.plan}. ${it.note}`, 'LeelaPlanReel'] // cyrillic-ok
          )
        }
      }
    } else if (o.dryRun) {
      report.plan.items_added = REEL_SERIES.length
    }
  }

  return report
}

/** What a seller may learn about a client before the first message. */
export async function clientProfileFor(
  ctx: ToolContext,
  telegramId: string
): Promise<Record<string, unknown>> {
  await ensureProfileTable(ctx)
  await ensureSoulTable(ctx)
  await ensureSkillsTable(ctx)
  // Scoped by owner: another seller's profile of the same person is not ours
  // to read. An unowned legacy row is, until somebody claims it.
  const p = await ctx.pool.query(
    `SELECT client, profile, updated_at::text, owner_id FROM crm_client_profiles
      WHERE telegram_id = $1 AND ${PROFILE_OWNER_WHERE}
      ORDER BY owner_id NULLS LAST LIMIT 1`,
    [telegramId, String(ctx.telegramId)]
  )
  const soul = await ctx.pool.query(
    `SELECT content, updated_at::text FROM user_soul WHERE telegram_id = $1`,
    [telegramId]
  )
  const skills = await ctx.pool.query(
    `SELECT name FROM user_skills WHERE telegram_id = $1 ORDER BY name`,
    [telegramId]
  )
  if (!p.rows.length) {
    return {
      has_profile: false,
      hint:
        'Профиль клиента не настроен. Начни с вопросов: где аудитория, что уже публикует, какой результат за месяц был бы удачей.',
      has_soul: soul.rows.length > 0,
      skills: skills.rows.map((r: { name: string }) => r.name),
    }
  }
  const content = String(soul.rows[0]?.content ?? '')
  return {
    has_profile: true,
    client: p.rows[0].client,
    owner_id: p.rows[0].owner_id ?? null,
    owned_by_caller: p.rows[0].owner_id === String(ctx.telegramId),
    updated_at: p.rows[0].updated_at,
    profile: p.rows[0].profile,
    has_soul: soul.rows.length > 0,
    soul_is_draft: content.includes('Статус: ЧЕРНОВИК'),
    soul_excerpt: content.slice(0, 400),
    skills: skills.rows.map((r: { name: string }) => r.name),
  }
}

export const CRM_CLIENT_TOOLS: AgentTool[] = [
  {
    name: 'crm_client_setup',
    description:
      'Установить клиенту его пакет: черновик SOUL (если своего нет), скиллы «Leela: …», ' +
      'профиль для продавца и цель контент-плана с серией рилс LeelaPlanReel. ' +
      'Только для владельца платформы. Свой SOUL клиента не перезаписывается без overwrite_soul; ' +
      'скиллы с другим содержимым помечаются как конфликт. dry_run показывает, что будет сделано.',
    parameters: {
      type: 'object',
      properties: {
        client: { type: 'string', description: 'имя пакета в src/agent/clients (по умолчанию playom)' },
        telegram_id: { type: 'string', description: 'Telegram ID клиента (по умолчанию 435572800)' },
        overwrite_soul: { type: 'boolean', description: 'заменить существующий SOUL клиента (по умолчанию false)' },
        overwrite_skills: { type: 'boolean', description: 'заменить скиллы с другим содержимым (по умолчанию false)' },
        with_plan: { type: 'boolean', description: 'создать цель и 12 карточек серии рилс (по умолчанию true)' },
        dry_run: { type: 'boolean', description: 'только показать план действий (по умолчанию false)' },
      },
      additionalProperties: false,
    },
    async handler(args: Record<string, any>, ctx?: ToolContext) {
      requireOwner(ctx)
      if (!ctx) throw new Error('no context')
      const telegramId = String(args.telegram_id ?? DEFAULT_CLIENT_ID).trim()
      if (!/^\d{5,20}$/.test(telegramId)) {
        return { done: false, reason: 'telegram_id должен быть числом' }
      }
      const asClient = { ...ctx, telegramId }
      if (!(await isSeller(asClient))) {
        return {
          done: false,
          reason: `Клиент ${telegramId} не подключил свой Telegram в приложении — пакет ставится только подключённому.`,
        }
      }
      const report = await setupClient(ctx, {
        client: String(args.client ?? DEFAULT_CLIENT),
        telegramId,
        overwriteSoul: args.overwrite_soul === true,
        overwriteSkills: args.overwrite_skills === true,
        withPlan: args.with_plan !== false,
        dryRun: args.dry_run === true,
      })
      return { done: !report.dry_run, report: report }
    },
  },
  {
    name: 'crm_client_profile',
    description:
      'Прочитать профиль клиента перед разговором: бизнес, гипотезы об аудитории, вопросы для discovery, ' +
      'серии контента, запрещённые формулировки, визуальные токены, одобренный CTA, есть ли у него SOUL и какие скиллы. ' +
      'Для продавца с подключённым аккаунтом. Бесплатно.',
    parameters: {
      type: 'object',
      properties: {
        telegram_id: { type: 'string', description: 'Telegram ID клиента (по умолчанию 435572800)' },
      },
      additionalProperties: false,
    },
    async handler(args: Record<string, any>, ctx?: ToolContext) {
      if (!ctx || !(await isSeller(ctx))) {
        throw new Error('Профиль клиента читает только продавец с подключённым Telegram.')
      }
      const telegramId = String(args.telegram_id ?? DEFAULT_CLIENT_ID).trim()
      return clientProfileFor(ctx, telegramId)
    },
  },
]
