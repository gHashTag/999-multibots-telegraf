/**
 * SET UP A CLIENT'S WORKSPACE FROM A CLIENT PACKAGE.
 *
 * Duet runs 1-5 on 2026-09-13 showed the seller agent selling to a client with
 * nothing known about her: a generic blog reel, an off-brand generated image,
 * the app link sent twice. The fix is not a better prompt but a client package
 * the seller can read: her draft SOUL, a structured profile (business,
 * audience hypotheses, discovery questions, content series, forbidden claims,
 * visual tokens) and the skills her own editorial agent would carry. This tool
 * installs that package into the rows the rest of the app already reads:
 * user_soul, user_skills, the content plan, and one table for the profile.
 *
 * WHERE A PACKAGE LIVES (#2712). Packages used to be folders in
 * `src/agent/clients/`, and this repository is PUBLIC: every dossier -- a real
 * telegram_id, the owner's private notes about money, law and past incidents
 * -- was published with the code. A package now lives in the render's own
 * Postgres (`crm_client_packages`), written by the owner through
 * `crm_client_package_upload`. The folder keeps ONE synthetic example with an
 * invented id, so the install path and its tests still have something real to
 * install. Nothing picks a person by default: every tool here is told whom.
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
 * the client's own style, not the catalogue.
 *
 * THE PACKAGE SHAPES THE PORTRAIT; IT DOES NOT REPLACE IT (owner, 2026-09-21).
 * This header used to end "proposes the client's own template", and the
 * seller took it literally: a client with a package got reels, and the
 * portrait from her own face -- the first gift every other person gets --
 * stopped coming. The first gift is the portrait for everybody; the package
 * gives it its scene and style (visual tokens, forbidden claims), and her
 * template comes after it. The profile says which of the two is due (`portrait`).
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AgentTool, ToolContext } from './tools'
import { requireOwner, isSeller } from './telegram-tools'
import { ownsLead } from './crm-reach'

const HERE = dirname(fileURLToPath(import.meta.url))
const CLIENTS_DIR = join(HERE, 'clients')

/** The Leela repo's sync contract prefixes every imported private row. */
export const SKILL_PREFIX = 'Leela: '
export const REEL_GOAL_TITLE = 'Leela: серия рилс LeelaPlanReel v1' // stale-route-ok: a stored goal title; the plan read carries the reel route (crm-story-reel v9)
/** The reel template whose packages get the Leela series as their plan. */
export const LEELA_TEMPLATE = 'LeelaPlanReel' // stale-route-ok: the package's template id, a value the code compares

/** Upper bounds for one uploaded package: a dossier, not a data dump. */
export const PACKAGE_LIMITS = {
  profileChars: 64_000,
  soulChars: 32_000,
  skills: 24,
  skillChars: 32_000,
  skillNameChars: 120,
}

export interface ClientPackage {
  client: string
  soul: string
  profile: Record<string, unknown>
  skills: { name: string; content: string }[]
}

/** A package found for an install, and where it was found. */
export interface FoundPackage extends ClientPackage {
  source: 'db' | 'bundled'
  /** The person the package describes, when it says so. */
  telegram_id: string | null
}

/**
 * A package name is a slug, never a path: letters, digits, dash, underscore.
 * Anything else is refused rather than cleaned, so `../x` never becomes `x`.
 */
export function packageSlug(client: unknown): string {
  const raw = typeof client === 'string' ? client.trim() : ''
  return /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(raw) ? raw : ''
}

/**
 * First markdown H1 becomes the skill name; the file body is the content.
 *
 * The prefix is the package's, not Leela's: a second client's skills carrying
 * `Leela: ` in their titles would be filed under somebody else's product.
 */
export function skillNameFromMarkdown(
  md: string,
  fallback: string,
  prefix: string = SKILL_PREFIX
): string {
  const m = md.match(/^#\s+(.+)$/m)
  const raw = (m?.[1] ?? fallback).trim()
  return raw.startsWith(prefix) ? raw : prefix + raw
}

/**
 * One shape for both homes of a package: the skill names are derived the same
 * way whether the markdown came from a bundled file or from an uploaded row.
 */
function assemblePackage(
  client: string,
  profile: Record<string, unknown>,
  soul: string,
  raw: { name?: unknown; content?: unknown }[]
): ClientPackage {
  const prefix =
    typeof profile.skill_prefix === 'string' && profile.skill_prefix
      ? profile.skill_prefix
      : SKILL_PREFIX
  const skills = raw
    .filter(s => typeof s?.content === 'string' && s.content.trim())
    .map(s => {
      const content = String(s.content).trim()
      const fallback =
        String(typeof s.name === 'string' ? s.name : '')
          .replace(/\.md$/, '')
          .trim() || 'skill'
      return { name: skillNameFromMarkdown(content, fallback, prefix), content }
    })
  return { client, soul: soul.trim(), profile, skills }
}

/** The packages that ship with the code: the synthetic example, nothing real. */
export function bundledPackageNames(): string[] {
  if (!existsSync(CLIENTS_DIR)) return []
  return readdirSync(CLIENTS_DIR)
    .filter(d => existsSync(join(CLIENTS_DIR, d, 'profile.json')))
    .sort()
}

/** A bundled package by name; throws when there is no such folder. */
export function loadClientPackage(client: string): ClientPackage {
  const safe = packageSlug(client)
  const dir = join(CLIENTS_DIR, safe)
  if (!safe || !existsSync(join(dir, 'profile.json'))) {
    throw new Error(`Пакет клиента «${client}» не найден`) // cyrillic-ok
  }
  const profile = JSON.parse(readFileSync(join(dir, 'profile.json'), 'utf8'))
  const soulPath = join(dir, 'SOUL.md')
  const soul = existsSync(soulPath) ? readFileSync(soulPath, 'utf8') : ''
  const skillsDir = join(dir, 'skills')
  const skills = existsSync(skillsDir)
    ? readdirSync(skillsDir)
        .filter(f => f.endsWith('.md'))
        .sort()
        .map(f => ({
          name: f,
          content: readFileSync(join(skillsDir, f), 'utf8'),
        }))
    : []
  return assemblePackage(safe, profile, soul, skills)
}

/**
 * WHERE UPLOADED PACKAGES LIVE. Keyed by (owner_id, client): the owner who
 * uploaded a package is the one who installs it, the same ownership rule
 * `crm_client_profiles` follows. `telegram_id` names the person the package
 * describes, so an install under somebody else's id can be refused.
 *
 * Idempotent, like every other table this module creates on first use.
 */
export async function ensurePackageTable(ctx: ToolContext): Promise<void> {
  await ctx.pool.query(
    `CREATE TABLE IF NOT EXISTS crm_client_packages (
       owner_id    text NOT NULL,
       client      text NOT NULL,
       telegram_id text NOT NULL,
       profile     jsonb NOT NULL,
       soul        text NOT NULL DEFAULT '',
       skills      jsonb NOT NULL DEFAULT '[]'::jsonb,
       updated_at  timestamptz NOT NULL DEFAULT now(),
       PRIMARY KEY (owner_id, client)
     )`
  )
}

/** jsonb comes back parsed from pg, but a string from some drivers and doubles. */
function jsonValue<T>(v: unknown, fallback: T): T {
  if (typeof v === 'string') {
    try {
      return JSON.parse(v) as T
    } catch {
      return fallback
    }
  }
  return (v ?? fallback) as T
}

/**
 * The package an install will use: the caller's uploaded row first, then the
 * bundled example. `null` when neither exists -- the caller says so plainly.
 */
export async function findClientPackage(
  ctx: ToolContext,
  client: string
): Promise<FoundPackage | null> {
  const slug = packageSlug(client)
  if (!slug) return null
  await ensurePackageTable(ctx)
  const r = await ctx.pool.query(
    `SELECT client, telegram_id, profile, soul, skills FROM crm_client_packages
      WHERE owner_id = $1 AND client = $2`,
    [String(ctx.telegramId), slug]
  )
  const row = r.rows?.[0]
  if (row) {
    const profile = jsonValue<Record<string, unknown>>(row.profile, {})
    const skills = jsonValue<{ name?: unknown; content?: unknown }[]>(
      row.skills,
      []
    )
    return {
      ...assemblePackage(
        slug,
        profile && typeof profile === 'object' ? profile : {},
        String(row.soul ?? ''),
        Array.isArray(skills) ? skills : []
      ),
      source: 'db',
      telegram_id: String(row.telegram_id),
    }
  }
  if (!bundledPackageNames().includes(slug)) return null
  const pkg = loadClientPackage(slug)
  const own = pkg.profile.telegram_id
  return {
    ...pkg,
    source: 'bundled',
    telegram_id: own == null ? null : String(own),
  }
}

/** The refusal for a package that is in neither home. */
export function packageNotFound(client: string): string {
  const bundled = bundledPackageNames()
  return (
    `Пакета «${client}» нет ни в базе, ни среди встроенных` + // cyrillic-ok
    (bundled.length ? ` (встроенные: ${bundled.join(', ')})` : '') + // cyrillic-ok
    '. Досье клиента загружает владелец через crm_client_package_upload.' // cyrillic-ok
  )
}

export interface UploadInput {
  client: unknown
  telegram_id: unknown
  profile: unknown
  soul?: unknown
  skills?: unknown
}

export type UploadResult =
  | {
      stored: true
      client: string
      telegram_id: string
      replaced: boolean
      soul: boolean
      skills: string[]
      next: string
    }
  | { stored: false; reason: string }

/**
 * STORE ONE PACKAGE IN THE RENDER'S DATABASE.
 *
 * Validation first, and a refusal writes nothing -- not even the table. A
 * profile that names a person must name the same person as `telegram_id`: a
 * dossier filed under the wrong id is exactly how the agent came to call a
 * client by another man's name. A bundled name is refused so an upload can
 * never shadow the example the tests install.
 */
export async function uploadClientPackage(
  ctx: ToolContext,
  input: UploadInput
): Promise<UploadResult> {
  const refuse = (reason: string): UploadResult => ({ stored: false, reason })
  const client = packageSlug(input.client)
  if (!client)
    return refuse(
      'Укажите client — имя пакета: латиница, цифры, «-» и «_», до 64 знаков.'
    )
  if (bundledPackageNames().includes(client))
    return refuse(
      `Имя «${client}» занято встроенным пакетом — выберите другое.`
    )
  const telegramId =
    typeof input.telegram_id === 'string' ||
    typeof input.telegram_id === 'number'
      ? String(input.telegram_id).trim()
      : ''
  if (!telegramId)
    return refuse(
      'Укажите telegram_id человека, которого описывает пакет: без него досье ничьё.'
    )
  if (!/^\d{5,20}$/.test(telegramId))
    return refuse('telegram_id должен быть числом')
  const profile = input.profile
  if (!profile || typeof profile !== 'object' || Array.isArray(profile))
    return refuse('profile должен быть JSON-объектом (как profile.json)')
  const profileJson = JSON.stringify(profile)
  if (profileJson.length > PACKAGE_LIMITS.profileChars)
    return refuse(
      `profile длиннее ${PACKAGE_LIMITS.profileChars} знаков — это досье, а не архив`
    )
  const named = (profile as Record<string, unknown>).telegram_id
  if (named != null && String(named).trim() !== telegramId)
    return refuse(
      'profile.telegram_id называет другого человека, чем telegram_id: досье под чужим id не сохраняю.'
    )
  if (input.soul != null && typeof input.soul !== 'string')
    return refuse('soul должен быть текстом (markdown)')
  const soul = String(input.soul ?? '').trim()
  if (soul.length > PACKAGE_LIMITS.soulChars)
    return refuse(`soul длиннее ${PACKAGE_LIMITS.soulChars} знаков`)
  const rawSkills = input.skills ?? []
  if (!Array.isArray(rawSkills))
    return refuse('skills должен быть списком [{name, content}]')
  if (rawSkills.length > PACKAGE_LIMITS.skills)
    return refuse(`skills: не больше ${PACKAGE_LIMITS.skills} скиллов`)
  const skills: { name: string; content: string }[] = []
  for (const s of rawSkills) {
    const content =
      s && typeof s === 'object' && typeof s.content === 'string'
        ? s.content.trim()
        : ''
    const name =
      s && typeof s === 'object' && typeof s.name === 'string'
        ? s.name.trim()
        : ''
    if (!content) return refuse('skills: у каждого скилла нужен content')
    if (content.length > PACKAGE_LIMITS.skillChars)
      return refuse(`skills: скилл длиннее ${PACKAGE_LIMITS.skillChars} знаков`)
    if (name.length > PACKAGE_LIMITS.skillNameChars)
      return refuse(
        `skills: имя длиннее ${PACKAGE_LIMITS.skillNameChars} знаков`
      )
    skills.push({ name, content })
  }

  const owner = String(ctx.telegramId)
  await ensurePackageTable(ctx)
  const had = await ctx.pool.query(
    `SELECT client FROM crm_client_packages WHERE owner_id = $1 AND client = $2`,
    [owner, client]
  )
  await ctx.pool.query(
    `INSERT INTO crm_client_packages
       (owner_id, client, telegram_id, profile, soul, skills, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6::jsonb, now())
     ON CONFLICT (owner_id, client) DO UPDATE
       SET telegram_id = $3, profile = $4::jsonb, soul = $5,
           skills = $6::jsonb, updated_at = now()`,
    [owner, client, telegramId, profileJson, soul, JSON.stringify(skills)]
  )
  const pkg = assemblePackage(
    client,
    profile as Record<string, unknown>,
    soul,
    skills
  )
  return {
    stored: true,
    client,
    telegram_id: telegramId,
    replaced: Boolean(had.rows?.length),
    soul: Boolean(soul),
    skills: pkg.skills.map(s => s.name),
    next: `crm_client_setup client=${client} telegram_id=${telegramId}`,
  }
}

/** The twelve reel ideas the seller proposes, one canonical plan each. */
export const REEL_SERIES: {
  title: string
  plan: number | null
  note: string
}[] = [
  {
    title: 'Вход только с шестёрки — план 6 «Заблуждение (моха)»',
    plan: 6,
    note: 'Крючок: «Следующий ход — не обязательно следующий бросок».',
  },
  {
    title: '68 на старте — ещё не победа',
    plan: 68,
    note: 'Начальное состояние хранит 68 до входа; победа — только точное попадание.',
  },
  {
    title: '68 «Космическое Сознание» — Цветок Жизни без цифры',
    plan: 68,
    note: 'Единственная клетка без номера на доске.',
  },
  {
    title: '72 → 51: последний номер поля — не финиш',
    plan: 72,
    note: 'Змея Тамогуны возвращает на 51.',
  },
  {
    title: '12 → 8: змея Зависти',
    plan: 12,
    note: 'Змея меняет положение фишки, не ваше достоинство.',
  },
  {
    title: '17 → 69: стрела Сострадания',
    plan: 17,
    note: 'Стрела — не награда, а движение.',
  },
  {
    title: '26 «Милосердие (даана)» — читать план без ярлыка',
    plan: 26,
    note: 'Название клетки не приписывается человеку.',
  },
  {
    title: '55 → 3: змея Эгоизма',
    plan: 55,
    note: 'Самая длинная змея доски.',
  },
  {
    title: '63 → 2: змея Тамаса',
    plan: 63,
    note: 'Из ряда Сахасрары — в первый ряд.',
  },
  {
    title: 'Отчёт — не экзамен на правильный смысл',
    plan: null,
    note: 'Одна фраза вместо дневника; несогласие — тоже отчёт.',
  },
  { title: '46 → 62: стрела Различения', plan: 46, note: 'Аджна → Сахасрара.' },
  {
    title: 'Групповой стол: один вопрос, разные планы',
    plan: null,
    note: 'Формат для канала: каждый приходит со своим вопросом.',
  },
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

/** A goal and its cards, as one package describes them. */
export interface ClientPlan {
  goal: string
  intent: string
  templateId: string | null
  items: { title: string; note: string }[]
}

/**
 * THE PLAN BELONGS TO THE PACKAGE, NOT TO LEELA.
 *
 * `REEL_SERIES` is twelve reels about a board game. Installing it for a shop
 * that sells something else -- because it happened to be the constant the
 * installer reached for -- would fill that client's plan with another client's
 * product. A package carries its own `content_plan`; the Leela constants
 * remain the plan of a package whose own reel template is the Leela one, and
 * a package with neither gets no plan rather than somebody else's.
 *
 * The fallback used to be keyed by one package NAME, which tied the code to
 * one real person's folder. The template is what the series is actually for.
 */
export function planFor(pkg: ClientPackage): ClientPlan | null {
  const own = (pkg.profile as { content_plan?: unknown }).content_plan
  if (own && typeof own === 'object') {
    const p = own as {
      goal?: string
      intent?: string
      template_id?: string | null
      items?: { title?: string; note?: string }[]
    }
    const items = (p.items ?? [])
      .filter(i => typeof i?.title === 'string' && i.title)
      .map(i => ({ title: String(i.title), note: String(i.note ?? '') }))
    if (p.goal && items.length) {
      return {
        goal: p.goal,
        intent: p.intent ?? '',
        templateId: p.template_id ?? null,
        items,
      }
    }
  }
  const template = (
    pkg.profile as { reel_template?: { composition?: unknown } }
  ).reel_template?.composition
  if (template !== LEELA_TEMPLATE) return null
  return {
    goal: REEL_GOAL_TITLE,
    intent: 'Привести на доску со своим вопросом — один план, один рил.', // cyrillic-ok
    templateId: LEELA_TEMPLATE,
    items: REEL_SERIES.map(it => ({
      title: it.title,
      note: it.plan == null ? it.note : `План ${it.plan}. ${it.note}`, // cyrillic-ok
    })),
  }
}

export interface SetupReport {
  client: string
  telegram_id: string
  dry_run: boolean
  /**
   * True when only the seller's own dossier was written, because the client
   * has no connected account of their own to hold a SOUL, skills or a plan.
   */
  profile_only: boolean
  soul:
    | 'created'
    | 'kept_hers'
    | 'overwritten'
    | 'empty_package'
    | 'not_connected'
  skills: {
    name: string
    result: 'created' | 'identical' | 'conflict' | 'overwritten'
  }[]
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
    /**
     * Write only `crm_client_profiles` -- the seller's own notes about this
     * person -- and touch none of the rows that belong to the client.
     */
    profileOnly?: boolean
    /** A package already found by the caller; otherwise it is looked up. */
    pkg?: ClientPackage
  }
): Promise<SetupReport> {
  const pkg = o.pkg ?? (await findClientPackage(ctx, o.client))
  if (!pkg) throw new Error(packageNotFound(o.client))
  const id = o.telegramId
  const profileOnly = o.profileOnly === true
  const report: SetupReport = {
    client: pkg.client,
    telegram_id: id,
    dry_run: o.dryRun,
    profile_only: profileOnly,
    soul: profileOnly ? 'not_connected' : 'empty_package',
    skills: [],
    profile: 'written',
    plan: { goal: 'exists', items_added: 0 },
  }

  await ensureSoulTable(ctx)
  await ensureSkillsTable(ctx)
  await ensureProfileTable(ctx)

  if (pkg.soul && !profileOnly) {
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

  for (const s of profileOnly ? [] : pkg.skills) {
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

  const plan = planFor(pkg)
  if (o.withPlan && plan && !profileOnly) {
    await ensurePlanTables(ctx)
    const goal = await ctx.pool.query(
      `SELECT id FROM content_plan_goals WHERE telegram_id = $1 AND title = $2`,
      [id, plan.goal]
    )
    let goalId: number | null = goal.rows[0]?.id ?? null
    if (goalId == null) {
      report.plan.goal = 'created'
      if (!o.dryRun) {
        const r = await ctx.pool.query(
          `INSERT INTO content_plan_goals (telegram_id, title, intent)
           VALUES ($1, $2, $3) RETURNING id`,
          [id, plan.goal, plan.intent]
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
      for (const it of plan.items) {
        if (titles.has(it.title)) continue
        report.plan.items_added++
        if (!o.dryRun) {
          await ctx.pool.query(
            `INSERT INTO content_plan_items (goal_id, telegram_id, title, note, template_id)
             VALUES ($1, $2, $3, $4, $5)`,
            [goalId, id, it.title, it.note, plan.templateId]
          )
        }
      }
    } else if (o.dryRun) {
      report.plan.items_added = plan.items.length
    }
  }

  return report
}

/**
 * The keys that must survive a truncation, in the order they must survive it.
 *
 * A profile goes into the prompt as JSON under a character budget, and the
 * budget used to be a blind `slice()`: it cut mid-string, produced invalid
 * JSON, and -- because the rules sit late in the file -- the first things it
 * dropped were the client's name, the name he is NOT, and the list of things
 * never to say to him. Those are the whole reason the profile exists.
 */
const PROMPT_PRIORITY = [
  'name',
  'not_name',
  'handle',
  'role',
  'identity_rules',
  'forbidden',
  'forbidden_claims',
  /*
   * An unsettled dispute decides what may be said at all, so it outranks even
   * the how-to: an open money question is the reason nothing is offered to
   * that client for sale, and a budget that kept the manner and dropped the
   * reason would produce a polite upsell.
   */
  'open_money_question',
  /*
   * One entry, not one per person. The key is `how_to_work_with_him` in one
   * package and `how_to_work_with_her` in the next, and a list of spellings
   * would silently demote whichever spelling somebody forgot to add.
   */
  'how_to_work_with_',
  'legal_note',
  'relationship',
  'open_work',
  'incidents',
  'business',
]

/**
 * A profile rendered for the system prompt: still valid JSON, rules first,
 * and whatever did not fit named out loud rather than silently lost.
 */
export function profileForPrompt(
  profile: Record<string, unknown>,
  budget = 6000
): string {
  const keys = Object.keys(profile ?? {})
  const rank = (k: string) => {
    const i = PROMPT_PRIORITY.findIndex(p =>
      p.endsWith('_') ? k.startsWith(p) : k === p
    )
    return i < 0 ? PROMPT_PRIORITY.length + keys.indexOf(k) : i
  }
  const kept: Record<string, unknown> = {}
  const dropped: string[] = []
  for (const k of [...keys].sort((a, b) => rank(a) - rank(b))) {
    const next = { ...kept, [k]: profile[k] }
    if (JSON.stringify(next).length > budget) {
      dropped.push(k)
      continue
    }
    kept[k] = profile[k]
  }
  const body = JSON.stringify(kept)
  if (!dropped.length) return body
  return `${body}\n(в профиле есть ещё, не влезло в контекст: ${dropped.join(', ')} — читается через crm_client_profile)` // cyrillic-ok
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
  const ownsTheProfile = p.rows[0]?.owner_id === String(ctx.telegramId)
  /*
   * `user_soul` and `user_skills` are PLATFORM-WIDE: one row per person, no
   * owner column, nothing in the SQL that could scope them. Until 2026-09-21
   * they were read here on the strength of `isSeller` alone -- which only
   * means "this caller connected their own Telegram" -- so any seller who
   * passed any telegram_id received 400 characters of that person's private
   * SOUL and the names of their skills, including from the `!p.rows.length`
   * branch, where the seller was being told the profile was not theirs in the
   * same breath.
   *
   * Two ways to earn them, and no third: you set this client up (the profile
   * row is yours), or crm-reach says the person is reachable for you -- you,
   * a keeper, or somebody you have corresponded with. An unowned legacy
   * profile row stays readable, because that is a deliberate migration
   * affordance for the profile only; it grants nothing private.
   */
  const mayReadPrivate = ownsTheProfile || (await ownsLead(ctx, telegramId))
  const empty = { rows: [] as Array<Record<string, any>> }
  const soul = mayReadPrivate
    ? await ctx.pool.query(
        `SELECT content, updated_at::text FROM user_soul WHERE telegram_id = $1`,
        [telegramId]
      )
    : empty
  const skills = mayReadPrivate
    ? await ctx.pool.query(
        `SELECT name FROM user_skills WHERE telegram_id = $1 ORDER BY name`,
        [telegramId]
      )
    : empty
  // Named rather than silently absent: a caller that gets `has_soul: false`
  // should be able to tell "they have not written one" from "not yours to
  // read". It says nothing about whose client the person is.
  const withheld = mayReadPrivate ? {} : { private_withheld: true }
  if (!p.rows.length) {
    return {
      has_profile: false,
      hint: 'Профиль клиента не настроен. Начни с вопросов: где аудитория, что уже публикует, какой результат за месяц был бы удачей.',
      has_soul: soul.rows.length > 0,
      skills: skills.rows.map((r: { name: string }) => r.name),
      ...withheld,
    }
  }
  const content = String(soul.rows[0]?.content ?? '')
  return {
    has_profile: true,
    client: p.rows[0].client,
    owner_id: p.rows[0].owner_id ?? null,
    owned_by_caller: ownsTheProfile,
    updated_at: p.rows[0].updated_at,
    profile: p.rows[0].profile,
    has_soul: soul.rows.length > 0,
    soul_is_draft: content.includes('Статус: ЧЕРНОВИК'),
    soul_excerpt: content.slice(0, 400),
    /*
     * THE WHOLE SOUL, not only its first 400 characters (owner, 2026-09-24:
     * "why is SOUL.md not read in full?"). The card showed the excerpt and
     * the agent's client brief said only "SOUL: есть" -- the person's own
     * words about themselves never reached the answer. Bounded so a SOUL
     * built from a thousand files cannot swallow a model's window; the
     * length says whether anything was left out.
     */
    soul: content.slice(0, SOUL_MAX_CHARS),
    soul_chars: content.length,
    skills: skills.rows.map((r: { name: string }) => r.name),
    ...withheld,
  }
}

/** The most of one SOUL a single read returns. */
export const SOUL_MAX_CHARS = 12000

export interface SchemaCheck {
  table_exists: boolean
  owner_column: boolean
  legacy_pkey: boolean
  unique_index: boolean
  rows_total: number
  rows_owned: number
  rows_unowned: number
  owners: Array<{ owner_id: string; rows: number }>
  migrated: boolean
}

/**
 * The read-only witness for the profile migration. It never calls
 * ensureProfileTable: a witness that migrates on the way in would report
 * its own work, not the state of the base it was asked about.
 * Spec: t27 specs/automation/crm-client-ownership.t27 (SCHEMA_CHECK_*).
 */
export async function schemaCheck(ctx: ToolContext): Promise<SchemaCheck> {
  const one = async (sql: string) =>
    (await ctx.pool.query(sql)).rows?.[0] ?? null
  const table = await one(
    `SELECT 1 AS ok FROM information_schema.tables WHERE table_name = 'crm_client_profiles'`
  )
  if (!table) {
    return {
      table_exists: false,
      owner_column: false,
      legacy_pkey: false,
      unique_index: false,
      rows_total: 0,
      rows_owned: 0,
      rows_unowned: 0,
      owners: [],
      migrated: false,
    }
  }
  const col = await one(
    `SELECT 1 AS ok FROM information_schema.columns
      WHERE table_name = 'crm_client_profiles' AND column_name = 'owner_id'`
  )
  const pk = await one(
    `SELECT 1 AS ok FROM pg_constraint WHERE conname = 'crm_client_profiles_pkey'`
  )
  const idx = await one(
    `SELECT indexdef FROM pg_indexes
      WHERE tablename = 'crm_client_profiles' AND indexname = 'crm_client_profiles_owner_client'`
  )
  const counts = col
    ? await one(
        `SELECT count(*)::int AS total,
                count(owner_id)::int AS owned
           FROM crm_client_profiles`
      )
    : await one(
        `SELECT count(*)::int AS total, 0 AS owned FROM crm_client_profiles`
      )
  const owners = col
    ? ((
        await ctx.pool.query(
          `SELECT owner_id, count(*)::int AS rows FROM crm_client_profiles
            WHERE owner_id IS NOT NULL GROUP BY owner_id ORDER BY rows DESC, owner_id`
        )
      ).rows ?? [])
    : []
  const total = Number(counts?.total ?? 0)
  const owned = Number(counts?.owned ?? 0)
  const uniqueIndex = Boolean(idx && /UNIQUE/i.test(String(idx.indexdef ?? '')))
  return {
    table_exists: true,
    owner_column: Boolean(col),
    legacy_pkey: Boolean(pk),
    unique_index: uniqueIndex,
    rows_total: total,
    rows_owned: owned,
    rows_unowned: total - owned,
    owners: owners.map((r: any) => ({
      owner_id: String(r.owner_id),
      rows: Number(r.rows),
    })),
    migrated: Boolean(col) && !pk && uniqueIndex,
  }
}

/**
 * THE REFUSAL FOR A MISSING ID.
 *
 * Each of these tools used to fall back to one real person's id when the
 * caller named nobody, and `crm_client_profile` -- reachable by any connected
 * seller -- therefore answered an empty call with that person's dossier. No
 * tool here picks a person any more: no id, no answer, and the answer says why.
 */
export const NO_ID_REASON =
  'Укажите telegram_id клиента: инструмент не выбирает человека сам.'

export const CRM_CLIENT_TOOLS: AgentTool[] = [
  {
    name: 'crm_client_setup',
    description:
      'Установить клиенту его пакет из базы (crm_client_package_upload) или встроенный пример: ' +
      'черновик SOUL (если своего нет), скиллы, профиль для продавца и цель контент-плана. ' +
      'Только для владельца платформы. Свой SOUL клиента не перезаписывается без overwrite_soul; ' +
      'скиллы с другим содержимым помечаются как конфликт.',
    parameters: {
      type: 'object',
      properties: {
        client: {
          type: 'string',
          description: 'имя пакета',
        },
        telegram_id: {
          type: 'string',
          description: 'Telegram ID клиента',
        },
        overwrite_soul: {
          type: 'boolean',
          description:
            'заменить существующий SOUL клиента (по умолчанию false)',
        },
        overwrite_skills: {
          type: 'boolean',
          description:
            'заменить скиллы с другим содержимым (по умолчанию false)',
        },
        with_plan: {
          type: 'boolean',
          description:
            'создать цель и карточки контент-плана пакета (по умолчанию true)',
        },
        dry_run: {
          type: 'boolean',
          description: 'только показать план действий (по умолчанию false)',
        },
      },
      required: ['client', 'telegram_id'],
      additionalProperties: false,
    },
    async handler(args: Record<string, any>, ctx?: ToolContext) {
      requireOwner(ctx)
      if (!ctx) throw new Error('no context')
      const telegramId = String(args.telegram_id ?? '').trim()
      if (!telegramId) return { done: false, reason: NO_ID_REASON }
      if (!/^\d{5,20}$/.test(telegramId)) {
        return { done: false, reason: 'telegram_id должен быть числом' }
      }
      const client = packageSlug(args.client)
      if (!client) {
        return {
          done: false,
          reason:
            'Укажите client — имя пакета (латиница, цифры, «-» и «_»): установщик не выбирает пакет сам.',
        }
      }
      const pkg = await findClientPackage(ctx, client)
      if (!pkg) return { done: false, reason: packageNotFound(client) }
      /*
       * A package that names its person is installed only for that person.
       * Filing one client's dossier under another's id is how an agent ends up
       * calling somebody by the wrong name.
       */
      if (pkg.telegram_id && pkg.telegram_id !== telegramId) {
        return {
          done: false,
          reason: `Пакет «${client}» описывает другого человека, не ${telegramId}: чужое досье не ставлю.`, // cyrillic-ok
        }
      }
      /*
       * A CLIENT WITH NO ACCOUNT STILL GETS A DOSSIER.
       *
       * The gate used to refuse everything, and the refusal cost a real VIP:
       * the one client the seller agent knew nothing about was exactly the one
       * who had never opened the app, so nothing could be installed and the
       * agent kept calling him by another man's name. SOUL, skills and a
       * content plan are rows under HIS telegram_id and still need his
       * account; `crm_client_profiles` is the seller's own notes about a
       * person they already talk to, and needs nothing from him.
       */
      const asClient = { ...ctx, telegramId }
      const connected = await isSeller(asClient)
      const report = await setupClient(ctx, {
        profileOnly: !connected,
        client,
        pkg,
        telegramId,
        overwriteSoul: args.overwrite_soul === true,
        overwriteSkills: args.overwrite_skills === true,
        withPlan: args.with_plan !== false,
        dryRun: args.dry_run === true,
      })
      return {
        done: !report.dry_run,
        report,
        ...(connected
          ? {}
          : {
              note: `Клиент ${telegramId} не подключил свой Telegram в приложении: записан только профиль для продавца, без SOUL, скиллов и контент-плана.`, // cyrillic-ok
            }),
      }
    },
  },
  {
    name: 'crm_client_profile',
    description:
      'Прочитать профиль клиента перед разговором: бизнес, гипотезы об аудитории, вопросы для discovery, ' +
      'серии контента, запрещённые формулировки, визуальные токены, одобренный CTA, есть ли у него SOUL и какие скиллы. ' +
      'portrait — подарен ли портрет: пока нет, он первый, пакет задаёт его стиль. ' +
      'Для продавца с подключённым аккаунтом. Бесплатно.',
    parameters: {
      type: 'object',
      properties: {
        telegram_id: {
          type: 'string',
          description: 'Telegram ID клиента',
        },
      },
      required: ['telegram_id'],
      additionalProperties: false,
    },
    async handler(args: Record<string, any>, ctx?: ToolContext) {
      if (!ctx || !(await isSeller(ctx))) {
        throw new Error(
          'Профиль клиента читает только продавец с подключённым Telegram.'
        )
      }
      // Only the profile that was asked for: an empty call reads nobody's.
      const telegramId = String(args.telegram_id ?? '').trim()
      if (!telegramId) throw new Error(NO_ID_REASON)
      if (!/^\d{5,20}$/.test(telegramId)) {
        throw new Error('telegram_id должен быть числом')
      }
      const profile = await clientProfileFor(ctx, telegramId)
      // Which gift is due, beside the package that styles it. Loaded here,
      // not at the top: the delivery module pulls in billing and Telegram,
      // which reading a profile does not otherwise need.
      const { portraitOf } = await import('./crm-deliver-tool')
      const portrait = await portraitOf(
        ctx.pool,
        String(ctx.telegramId),
        telegramId
      ).catch(() => null)
      return portrait ? { ...profile, portrait } : profile
    },
  },
  {
    name: 'crm_client_package_upload',
    description:
      'Загрузить пакет клиента в базу рендера: профиль (JSON), черновик SOUL и скиллы. ' +
      'Досье живёт в базе, не в публичном репозитории. Только для владельца платформы. ' +
      'Пакет с тем же client перезаписывается; поставить клиенту — crm_client_setup.',
    parameters: {
      type: 'object',
      properties: {
        client: {
          type: 'string',
          description: 'имя пакета: латиница, цифры, «-» и «_»',
        },
        telegram_id: {
          type: 'string',
          description: 'Telegram ID человека, которого описывает пакет',
        },
        profile: {
          type: 'object',
          description: 'профиль клиента, JSON-объект',
        },
        soul: {
          type: 'string',
          description: 'черновик SOUL клиента, markdown (можно пусто)',
        },
        skills: {
          type: 'array',
          description:
            'скиллы [{name, content}]: content — markdown, заголовок # становится именем',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              content: { type: 'string' },
            },
            required: ['content'],
            additionalProperties: false,
          },
        },
      },
      required: ['client', 'telegram_id', 'profile'],
      additionalProperties: false,
    },
    async handler(args: Record<string, any>, ctx?: ToolContext) {
      // The gate before anything else: a refused caller writes nothing.
      requireOwner(ctx)
      if (!ctx) throw new Error('no context')
      return uploadClientPackage(ctx, {
        client: args.client,
        telegram_id: args.telegram_id,
        profile: args.profile,
        soul: args.soul,
        skills: args.skills,
      })
    },
  },
  {
    name: 'crm_schema_check',
    description:
      'Свидетель миграции crm_client_profiles: есть ли колонка owner_id, снят ли старый первичный ключ, ' +
      'стоит ли уникальный индекс (owner_id, telegram_id), сколько строк всего / со владельцем / ничьих. ' +
      'Только читает, миграцию не запускает. Только владелец. Бесплатно.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async handler(_args: Record<string, any>, ctx?: ToolContext) {
      requireOwner(ctx)
      return schemaCheck(ctx!)
    },
  },
]
