/**
 * THE STORY-REEL TEMPLATE OF THE CRM (owner, 2026-09-26: "create it in the CRM
 * as a template for clients who gave their voice and an avatar photo, for any
 * story"; "make it so she can get a new one with one press"; "save the
 * template into her profile with all the settings -- she is a VIP client").
 *
 * ONE ENGINE, THREE DOORS. Whoever asks, the reel is made the same way:
 *
 *   - the seller, from the client's card in the CRM or through the agent
 *     (crm_story_reel {lead, topic}): the reel goes to the SELLER, who looks
 *     at it and forwards it -- a client's material never reaches the client
 *     unseen by the person whose name is on it;
 *   - the client, with one press of t.me/<bot>?start=reel: she asked, so the
 *     reel is hers and comes straight back to her with a button for the next.
 *
 * A seller's reel for a client WITH A GROUP (crm_client_group) ends in a send
 * card for that group in the seller's bot (story-card.ts): one press, and it
 * goes from the seller's account; nothing leaves without it. The seller may
 * also bring the script -- the scenes, the look, the call -- instead of a
 * topic, and the job makes exactly that.
 *
 * WHO QUALIFIES. Any client of a seller who has both halves:
 *   - a FACE -- her own avatar (crm_people.avatar_url, filled by
 *     crm_client_face and the CRM screen), or the one the seller saved in her
 *     profile (profile.story_reel.face_url);
 *   - a VOICE -- her clone from her own voice notes (lead_voices,
 *     crm_voice_clone).
 * Nothing else is required. A profile's `story_reel` block (the VIP setup)
 * only overrides the defaults: style, call to action, pause, who pays, the
 * plan cards already made by hand.
 *
 * ANY STORY. The topic is, in order: the one given; else the next card of her
 * content plan (the first `idea`, moved to `doing` in one statement so two
 * presses never take one card); else the writer picks a fresh one about her
 * business, told which topics she already has.
 *
 * SURVIVES A REDEPLOY. The job is a row: its scenes, and every still and clip
 * the moment it exists (ctx.storyProgress). A render restarted mid-reel picks
 * the running rows up on boot and continues from what is already made --
 * measured 2026-09-26, the render redeployed under long reel calls four
 * times in one afternoon, and every cut call was paid for twice.
 */
import type { ToolContext } from './tools'
import {
  endCardFromProfile,
  scenesOf,
  type StoryEndCard,
  type StoryScene,
} from './story-reel-tool'
import { leadVoiceOf } from './lead-voice'
import { TOKEN_PRICES } from './billing-shared'
import {
  defaultGroupCaption,
  type CardOutcome,
  type GroupCardOffer,
} from './story-card'

/*
 * THE NUMBERS BELOW ARE THE SPEC'S, NOT THIS FILE'S (owner, 2026-09-27: t27 is
 * the language everything is rewritten in). gHashTag/t27
 * specs/automation/crm-story-reel.t27 is vendored in ../spec/ with its
 * `t27c gen-ts` output; src/spec/crm-story-reel.test.ts fails when a number
 * here is restated instead of imported, or when the host stops doing what the
 * spec's own tests say. Change the spec, run scripts/sync-t27-spec.mjs.
 */
import * as SPEC from '../spec/crm-story-reel.gen'

type Pool = { query: (sql: string, params?: unknown[]) => Promise<any> }
type Message = { role: 'system' | 'user' | 'assistant'; content: string }

export const STORY_JOB_ATTEMPTS = SPEC.JOB_ATTEMPTS
/**
 * A running job beats every STORY_BEAT_MS; one silent for STORY_DEAD_MS lost
 * its process (a redeploy) and the sweep takes it over. Silent longer than
 * STORY_ABANDON_MINUTES, it is given up.
 */
export const STORY_BEAT_MS = SPEC.BEAT_MS
export const STORY_DEAD_MS = SPEC.DEAD_MS
export const STORY_SWEEP_MS = SPEC.SWEEP_MS
export const STORY_ABANDON_MINUTES = SPEC.ABANDON_MINUTES
/** This process, as the runner of the jobs it holds. */
const ME = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`
export const STORY_START_PARAM = SPEC.START_PARAM
export const STORY_TOPIC_MAX = SPEC.TOPIC_MAX

/** The look when the seller set none: calm, warm, one for every frame. */
export const STORY_DEFAULT_STYLE =
  'Warm natural daylight, calm editorial lifestyle photography, soft pastel tones, ' +
  'shallow depth of field; one consistent look across every frame.'
export const STORY_DEFAULT_CTA = 'Напишите мне' // cyrillic-ok: on-screen copy

export interface StorySettings {
  /** The seller whose client this is. */
  owner: string
  lead: string
  name: string
  /** '' when neither the profile nor the avatar gives one. */
  faceUrl: string
  hasVoice: boolean
  style: string
  cta: string
  pauseSec: number
  /** 'client' -- her own tokens; 'owner' -- the seller's (a VIP gift). */
  payer: 'client' | 'owner'
  /** Topics already made by hand, so a press does not make them again. */
  done: string[]
  about: string
  vip: boolean
  /** Her own visual for the end of the reel (profile.visual), when she has one. */
  endCard: StoryEndCard | null
}

const parse = (v: unknown): any => {
  if (typeof v !== 'string') return v
  try {
    return JSON.parse(v)
  } catch {
    return null
  }
}

const first = async (pool: Pool, sql: string, params: unknown[]) => {
  try {
    return (await pool.query(sql, params))?.rows?.[0] ?? null
  } catch {
    // A base that has not grown the table yet knows nothing -- not an error.
    return null
  }
}

/**
 * Whose client she is, when she asks herself: the seller whose profile of
 * her carries the template, else the seller who holds her voice.
 */
async function sellerOf(pool: Pool, lead: string): Promise<string> {
  const p = await first(
    pool,
    `SELECT owner_id FROM crm_client_profiles
      WHERE telegram_id = $1 AND owner_id IS NOT NULL AND profile ? 'story_reel'
      ORDER BY updated_at DESC LIMIT 1`,
    [lead]
  )
  if (p?.owner_id) return String(p.owner_id)
  const v = await first(
    pool,
    `SELECT owner_id FROM lead_voices WHERE lead_id = $1
      ORDER BY created_at DESC LIMIT 1`,
    [lead]
  )
  return v?.owner_id ? String(v.owner_id) : ''
}

/**
 * The template's settings for one client. `seller` scopes it to one seller's
 * CRM (their card, their tool); without it she is asking herself.
 */
export async function storySettingsOf(
  pool: Pool,
  lead: string,
  seller?: string
): Promise<StorySettings | null> {
  const id = String(lead ?? '').trim()
  if (!/^\d{5,15}$/.test(id)) return null
  const owner = String(seller ?? '').trim() || (await sellerOf(pool, id))
  if (!owner) return null

  const row = await first(
    pool,
    `SELECT profile FROM crm_client_profiles
      WHERE telegram_id = $1 AND (owner_id = $2 OR owner_id IS NULL)
      ORDER BY (owner_id = $2) DESC NULLS LAST, updated_at DESC LIMIT 1`,
    [id, owner]
  )
  const profile = parse(row?.profile) ?? {}
  const s = profile?.story_reel ?? {}
  const person = await first(
    pool,
    `SELECT first_name, avatar_url FROM crm_people
      WHERE owner_id = $1 AND lead_id = $2`,
    [owner, id]
  )
  const own = String(s.face_url ?? '').trim()
  const avatar = String(person?.avatar_url ?? '').trim()
  const faceUrl = [own, avatar].find(u => /^https?:\/\//.test(u)) ?? ''
  const voice = await leadVoiceOf(pool as never, owner, id).catch(() => null)
  const business = profile?.business ?? {}
  return {
    owner,
    lead: id,
    name: String(profile?.name ?? person?.first_name ?? '').trim(),
    faceUrl,
    hasVoice: Boolean(voice),
    style: String(s.style ?? '').trim() || STORY_DEFAULT_STYLE,
    // approved_cta is {text, button} in a client package, a string by hand.
    cta:
      [s.cta, profile?.approved_cta?.text, profile?.approved_cta]
        .find(v => typeof v === 'string' && v.trim())
        ?.trim() || STORY_DEFAULT_CTA,
    pauseSec: Math.min(4, Math.max(1, Number(s.pause_sec) || 3)),
    payer: s.payer === 'owner' ? 'owner' : 'client',
    done: Array.isArray(s.done) ? s.done.map(String) : [],
    about: [profile?.role, business?.product, business?.city]
      .filter(Boolean)
      .map(String)
      .join('; '),
    vip: profile?.vip === true,
    endCard: endCardFromProfile(profile),
  }
}

/** What is missing, in words the seller can act on; '' when nothing is. */
export function missingFor(s: StorySettings | null): string {
  if (!s)
    return 'рилсы-истории для тебя ещё не настроены — напиши владельцу бота'
  const lacks = [
    s.faceUrl
      ? ''
      : 'фото с лицом (crm_client_face: аватарка или присланное фото)',
    s.hasVoice ? '' : 'голос (crm_voice_clone из её голосовых в личке)',
  ].filter(Boolean)
  return lacks.length ? `для рилса не хватает: ${lacks.join(' и ')}` : ''
}

/**
 * The next card of her plan: the first `idea`, taken in one statement. Cards
 * made by hand (settings.done) are closed first, so they are not made twice.
 */
export async function takeNextPlanItem(
  pool: Pool,
  lead: string,
  doneTitles: readonly string[] = []
): Promise<{ id: number; title: string; note: string } | null> {
  if (doneTitles.length) {
    await pool
      .query(
        `UPDATE content_plan_items SET status = 'done', updated_at = now()
          WHERE telegram_id = $1 AND status = 'idea' AND title = ANY($2)`,
        [String(lead), [...doneTitles]]
      )
      .catch(() => undefined)
  }
  let r: any
  try {
    r = await pool.query(
      `UPDATE content_plan_items SET status = 'doing', updated_at = now()
        WHERE id = (SELECT id FROM content_plan_items
                     WHERE telegram_id = $1 AND status = 'idea'
                     ORDER BY goal_id, id LIMIT 1)
          AND status = 'idea'
        RETURNING id, title, COALESCE(note, '') AS note`,
      [String(lead)]
    )
  } catch {
    return null // no plan table: the writer picks the topic
  }
  const row = r?.rows?.[0]
  return row
    ? { id: Number(row.id), title: String(row.title), note: String(row.note) }
    : null
}

/**
 * The next card of her plan, only LOOKED at: what a press would make. The
 * press itself takes it with takeNextPlanItem.
 */
export async function peekNextPlanItem(
  pool: Pool,
  lead: string,
  doneTitles: readonly string[] = []
): Promise<string> {
  const row = await first(
    pool,
    `SELECT title FROM content_plan_items
      WHERE telegram_id = $1 AND status = 'idea' AND NOT (title = ANY($2))
      ORDER BY goal_id, id LIMIT 1`,
    [String(lead), [...doneTitles]]
  )
  return row?.title ? String(row.title) : ''
}

/** Scenes a reel of the template has. */
export const STORY_SCENES = SPEC.SCENES_DEFAULT
/**
 * Seconds of lip-sync one reel is billed for: three lines of 2-4 s, and each
 * clip is billed in whole seconds, rounded up (measured 2026-09-26: 11.9 s
 * spoken across three clips).
 */
export const STORY_BILLED_SECONDS = SPEC.BILLED_SECONDS

/**
 * What one reel costs the person who pays, in tokens, BEFORE the press --
 * read from the same prices the borrowed tools charge, so the figure moves
 * with them. An estimate only in the lip-sync seconds; the rest is exact.
 */
export function storyPriceEstimate(): number {
  return (
    STORY_SCENES * (TOKEN_PRICES.image_edit ?? 0) +
    STORY_SCENES * (TOKEN_PRICES.audio_generate ?? 0) +
    STORY_BILLED_SECONDS * (TOKEN_PRICES.lipsync_generate ?? 0) +
    (TOKEN_PRICES.reel_render ?? 0)
  )
}

/**
 * What the model is asked for: a title and three scenes, as JSON. An empty
 * topic means "pick one": the writer is told which ones she already has.
 */
export function writerMessages(
  topic: { title: string; note: string },
  s: Pick<StorySettings, 'about' | 'cta' | 'name'>,
  had: readonly string[] = []
): Message[] {
  const pick = !topic.title.trim()
  return [
    {
      role: 'system',
      content:
        'Ты пишешь короткий рилс-историю из 3 сцен для Instagram от первого лица героини (героя). ' +
        'Верни ТОЛЬКО JSON: {"title": "...", "scenes": [{"setting": "...", "line": "..."}, ×3]}. ' +
        'title — тема по-русски, до 60 знаков. ' +
        'setting — по-английски, одна НОВАЯ обстановка на сцену (фон не повторять), человек в кадре. ' +
        'line — по-русски, 2–4 секунды речи, от первого лица, простыми словами; названия и цифры словами. ' +
        'Последняя реплика — мягкий призыв к действию.',
    },
    {
      role: 'user',
      content:
        (s.name ? `Имя: ${s.name}.\n` : '') +
        `Чем занимается: ${s.about || 'своё дело — пойми из темы'}.\n` +
        (pick
          ? 'Тему выбери сам: одна живая история про её дело, которой у неё ещё не было.'
          : `Тема рилса: «${topic.title.trim()}».`) +
        (topic.note ? `\nЗаметка: ${topic.note}` : '') +
        (had.length
          ? `\nУже были: ${had.map(t => `«${t}»`).join(', ')}.`
          : '') +
        (s.cta ? `\nПризыв на экране в конце: «${s.cta}».` : ''),
    },
  ]
}

/** The title and scenes out of the model's answer, or null. */
export function parseStory(
  text: string
): { title: string; scenes: StoryScene[] } | null {
  const obj = text.indexOf('{')
  const arr = text.indexOf('[')
  let raw: any = null
  try {
    if (obj >= 0 && (arr < 0 || obj < arr))
      raw = JSON.parse(text.slice(obj, text.lastIndexOf('}') + 1))
    else if (arr >= 0)
      raw = { scenes: JSON.parse(text.slice(arr, text.lastIndexOf(']') + 1)) }
  } catch {
    return null
  }
  const scenes = scenesOf(raw?.scenes)
  if (typeof scenes === 'string' || scenes.length < 2) return null
  return { title: String(raw?.title ?? '').trim(), scenes }
}

const TABLE = `CREATE TABLE IF NOT EXISTS story_jobs (
  id          bigserial PRIMARY KEY,
  lead_id     text NOT NULL,
  seller_id   text NOT NULL,
  requester   text NOT NULL,
  bot         text,
  item_id     bigint,
  topic       text,
  about       text,
  runner      text,
  scenes      jsonb,
  stills      jsonb NOT NULL DEFAULT '[]'::jsonb,
  clips       jsonb NOT NULL DEFAULT '[]'::jsonb,
  status      text NOT NULL DEFAULT 'running',
  url         text,
  error       text,
  attempts    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
)`

/*
 * The seller's own script and the group the reel goes to. Added, not in the
 * CREATE above, because the table already exists in production.
 */
const COLUMNS = `ALTER TABLE story_jobs
  ADD COLUMN IF NOT EXISTS deliver_to text,
  ADD COLUMN IF NOT EXISTS caption    text,
  ADD COLUMN IF NOT EXISTS style      text,
  ADD COLUMN IF NOT EXISTS cta        text,
  ADD COLUMN IF NOT EXISTS card_at    timestamptz`

let tableReady: Promise<void> | null = null
export function ensureStoryJobs(pool: Pool): Promise<void> {
  tableReady ??= pool
    .query(TABLE)
    .then(() => pool.query(COLUMNS))
    .then(() => undefined)
    .catch(e => {
      tableReady = null
      throw e
    })
  return tableReady
}

export interface StoryDeps {
  pool: Pool
  /** One answer of the chat model (the seller's provider chain). */
  write: (messages: Message[]) => Promise<string>
  /** The story_reel tool's handler. */
  story: (args: Record<string, unknown>, ctx: ToolContext) => Promise<any>
  /**
   * A message in the bot the person pressed in (null: the main bot), with an
   * optional button. `video` is attached unless `renderSent` says the render
   * already delivered it to this chat through the main bot.
   */
  notify: (
    bot: string | null,
    chatId: string,
    text: string,
    extra?: {
      video?: string
      renderSent?: boolean
      button?: { text: string; url: string }
    }
  ) => Promise<boolean>
  /** The bot a client lives in, for her next-reel link. */
  botOf?: (lead: string) => Promise<string | null>
  /** The send card for a client's group (story-card.ts); absent: no card. */
  offerCard?: (o: GroupCardOffer) => Promise<CardOutcome>
  /** The title of a group the seller bound to the client, if known. */
  groupTitle?: (
    seller: string,
    lead: string,
    chat: string
  ) => Promise<string | null>
  /** Her "my reels" page in her bot, for the caption. */
  pageOf?: (bot: string | null) => string
  /** A heartbeat while a job runs; returns its stop. A test passes a no-op. */
  beat?: (fn: () => void, ms: number) => () => void
  /** Who this process is, as a runner; a test names two. */
  me?: string
}

const beatWith = (deps: StoryDeps) =>
  deps.beat ??
  ((fn, ms) => {
    const t = setInterval(fn, ms)
    t.unref?.()
    return () => clearInterval(t)
  })

export const nextLink = (bot: string | null | undefined): string =>
  bot ? `https://t.me/${bot.replace(/^@/, '')}?start=${STORY_START_PARAM}` : ''

export interface StoryJobRow {
  id: number
  topic: string
  status: string
  url: string | null
  error: string | null
  created_at: string
}

/** The last reels of one client, newest first, for the card and the tool. */
export async function storyJobsOf(
  pool: Pool,
  seller: string,
  lead: string,
  limit = 5
): Promise<StoryJobRow[]> {
  await ensureStoryJobs(pool)
  const r = await pool.query(
    `SELECT id, COALESCE(topic, '') AS topic, status, url, error, created_at::text AS created_at
       FROM story_jobs WHERE seller_id = $1 AND lead_id = $2
      ORDER BY id DESC LIMIT $3`,
    [seller, lead, limit]
  )
  return (r?.rows ?? []).map((x: any) => ({
    id: Number(x.id),
    topic: String(x.topic),
    status: String(x.status),
    url: x.url ? String(x.url) : null,
    error: x.error ? String(x.error) : null,
    created_at: String(x.created_at),
  }))
}

/**
 * A request for one reel. Answers at once; the reel is made in the
 * background by runStoryJob. Refusals say why in words one can act on.
 *
 * `requester` is who pressed: the client herself, or her seller.
 */
export async function startStory(
  deps: StoryDeps,
  who: {
    lead: string
    requester: string
    seller?: string
    bot?: string | null
    topic?: string
    about?: string
    /** The seller's own script: the scenes are made as given, not written. */
    scenes?: StoryScene[]
    style?: string
    cta?: string
    /** Where the finished reel is offered with one press (a group chat id). */
    deliverTo?: string | null
    caption?: string
  }
): Promise<{
  started: boolean
  why?: string
  topic?: string
  job?: number
  to_group?: string
}> {
  const lead = String(who.lead ?? '').trim()
  const requester = String(who.requester ?? '').trim()
  if (!/^\d{5,15}$/.test(lead) || !/^\d{5,15}$/.test(requester))
    return { started: false, why: 'кто это — неизвестно' }
  const byClient = requester === lead
  await ensureStoryJobs(deps.pool)
  const busy = await deps.pool.query(
    `SELECT id FROM story_jobs WHERE lead_id = $1 AND status = 'running'
       AND updated_at > now() - ($2 || ' minutes')::interval LIMIT 1`,
    [lead, String(STORY_ABANDON_MINUTES)]
  )
  if (busy?.rows?.length)
    return {
      started: false,
      why: byClient
        ? 'твой рилс уже делается — пришлю сюда, как будет готов'
        : 'рилс этого клиента уже делается — пришлю, как будет готов',
    }
  const s = await storySettingsOf(
    deps.pool,
    lead,
    byClient ? undefined : requester
  )
  const missing = missingFor(s)
  if (!s || missing) return { started: false, why: missing }

  const asked = String(who.topic ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, STORY_TOPIC_MAX)
  // A script brought by the seller is checked here, before anything is spent.
  const given = who.scenes === undefined ? null : scenesOf(who.scenes)
  if (typeof given === 'string') return { started: false, why: given }
  // A script is its own topic; a plan card is taken only for a written reel.
  const card =
    asked || given ? null : await takeNextPlanItem(deps.pool, lead, s.done)
  // A script with no topic is named by its first line.
  const topic =
    asked ||
    card?.title ||
    (given ? given[0].line.replace(/[.!?…]+$/, '').slice(0, 80) : '')
  const text = (v: unknown, n: number) =>
    String(v ?? '')
      .trim()
      .slice(0, n) || null
  const deliverTo = byClient ? null : text(who.deliverTo, 40)
  const r = await deps.pool.query(
    `INSERT INTO story_jobs (lead_id, seller_id, requester, bot, item_id, topic, about, runner,
                             scenes, style, cta, deliver_to, caption)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
    [
      lead,
      s.owner,
      requester,
      who.bot ?? null,
      card?.id ?? null,
      topic,
      // The seller's own words about her, for a client with no profile yet.
      String(who.about ?? '').slice(0, 400) || null,
      deps.me ?? ME,
      given ? JSON.stringify(given) : null,
      text(who.style, 600),
      text(who.cta, 120),
      // A client pressing for herself never sends into a group from here.
      deliverTo,
      deliverTo ? text(who.caption, SPEC.CAPTION_MAX) : null,
    ]
  )
  const job = Number(r?.rows?.[0]?.id)
  void runStoryJob(deps, job).catch(() => undefined)
  return {
    started: true,
    topic: topic || 'новая тема про её дело',
    job,
    ...(deliverTo ? { to_group: deliverTo } : {}),
  }
}

const list = (v: unknown): string[] => {
  const p = parse(v)
  return Array.isArray(p) ? p.map(x => String(x ?? '')) : []
}

/**
 * Make (or continue) one job's reel and hand it over. The caller holds the
 * job: startStory inserted it as this runner, or the sweep claimed it.
 */
export async function runStoryJob(deps: StoryDeps, id: number): Promise<void> {
  const { pool } = deps
  const me = deps.me ?? ME
  const r = await pool.query(`SELECT * FROM story_jobs WHERE id = $1`, [id])
  const job = r?.rows?.[0]
  if (!job || job.status !== 'running' || String(job.runner) !== me) return
  const attempts = Number(job.attempts) + 1
  await pool.query(
    `UPDATE story_jobs SET attempts = $2, updated_at = now() WHERE id = $1`,
    [id, attempts]
  )
  // Alive while it runs: a job that stops beating lost its process.
  const stop = beatWith(deps)(
    () =>
      void pool
        .query(
          `UPDATE story_jobs SET updated_at = now()
            WHERE id = $1 AND runner = $2 AND status = 'running'`,
          [id, me]
        )
        .catch(() => undefined),
    STORY_BEAT_MS
  )
  try {
    await runHeld(deps, job, attempts)
  } finally {
    stop()
  }
}

async function runHeld(
  deps: StoryDeps,
  job: any,
  attempts: number
): Promise<void> {
  const { pool } = deps
  const id = Number(job.id)
  const lead = String(job.lead_id)
  const seller = String(job.seller_id)
  const requester = String(job.requester)
  const byClient = requester === lead
  const bot = job.bot ? String(job.bot) : null
  let topic = String(job.topic ?? '')

  const fail = async (why: string) => {
    await pool.query(
      `UPDATE story_jobs SET status = 'failed', error = $2, updated_at = now() WHERE id = $1`,
      [id, why.slice(0, 500)]
    )
    // The card goes back to the plan: a failed reel is not a made one.
    if (job.item_id)
      await pool
        .query(
          `UPDATE content_plan_items SET status = 'idea', updated_at = now()
            WHERE id = $1 AND status = 'doing'`,
          [job.item_id]
        )
        .catch(() => undefined)
    await deps.notify(
      byClient ? bot : null,
      requester,
      `Рилс${topic ? ` «${topic}»` : ''} не получился: ${why.slice(0, 200)}. ` +
        'За несделанное токены не списаны.' +
        (byClient ? ' Попробуй ещё раз кнопкой.' : ''),
      byClient
        ? { button: { text: '🎬 Попробовать ещё', url: nextLink(bot) } }
        : undefined
    )
  }

  const s = await storySettingsOf(pool, lead, seller)
  const missing = missingFor(s)
  if (!s || missing) return fail(missing)

  let scenes: StoryScene[] | null = job.scenes ? parse(job.scenes) : null
  if (!scenes) {
    const had: string[] = await pool
      .query(
        `SELECT topic FROM story_jobs WHERE lead_id = $1 AND status = 'done'
           AND topic <> '' ORDER BY id DESC LIMIT 10`,
        [lead]
      )
      .then((x: any) => (x?.rows ?? []).map((y: any) => String(y.topic)))
      .catch(() => [])
    const about = s.about || String(job.about ?? '')
    const text = await deps
      .write(
        writerMessages({ title: topic, note: '' }, { ...s, about }, [
          ...s.done,
          ...had,
        ])
      )
      .catch(() => '')
    const story = parseStory(text)
    if (!story) return fail('не вышло написать сцены')
    scenes = story.scenes
    topic ||= story.title || 'история про моё дело'
    await pool.query(
      `UPDATE story_jobs SET scenes = $2, topic = $3, updated_at = now() WHERE id = $1`,
      [id, JSON.stringify(scenes), topic]
    )
  }

  /*
   * WHO PAYS. The seller who asked pays for their own request (the house pays
   * nothing). The client who pressed pays herself, unless her profile says
   * the reels are the seller's gift to her.
   */
  const payer = byClient ? (s.payer === 'owner' ? seller : lead) : requester
  const ctx: ToolContext = {
    telegramId: payer,
    pool: pool as ToolContext['pool'],
    surface: 'story',
    storyProgress: async p => {
      await pool.query(
        `UPDATE story_jobs SET stills = $2, clips = $3, updated_at = now() WHERE id = $1`,
        [id, JSON.stringify(p.stills), JSON.stringify(p.clips)]
      )
    },
  }
  const ans = await deps
    .story(
      {
        image_url: s.faceUrl,
        scenes,
        // The seller's own look and call, when the job carries them.
        style: String(job.style ?? '').trim() || s.style,
        for_lead: lead,
        cta: String(job.cta ?? '').trim() || s.cta,
        pause_sec: s.pauseSec,
        ...(s.endCard ? { end_card: s.endCard } : {}),
        stills: list(job.stills),
        clips: list(job.clips),
      },
      ctx
    )
    .catch(e => ({ done: false, reason: String((e as Error)?.message ?? e) }))

  if (ans?.done && ans?.url) {
    const url = String(ans.url)
    await pool.query(
      `UPDATE story_jobs SET status = 'done', url = $2, updated_at = now() WHERE id = $1`,
      [id, url]
    )
    if (job.item_id)
      await pool
        .query(
          `UPDATE content_plan_items
              SET status = 'done',
                  note = trim(both ' ' from coalesce(note, '') || ' ' || $2),
                  updated_at = now()
            WHERE id = $1`,
          [job.item_id, url]
        )
        .catch(() => undefined)
    // The render delivers the finished video to whoever paid, through the
    // main bot; the message below says what it is, and carries it where the
    // render did not.
    if (byClient) {
      await deps.notify(
        bot,
        lead,
        `Готово: рилс «${topic}» — твоим голосом, с твоим лицом. ` +
          'Выкладывай в Instagram. Следующий — одной кнопкой.',
        {
          video: url,
          renderSent: payer === lead,
          button: { text: '🎬 Ещё рилс', url: nextLink(bot) },
        }
      )
    } else {
      await handToSeller(deps, { ...job, url, topic }, s.name, payer)
    }
    return
  }

  const stills = list(ans?.stills)
  const clips = list(ans?.clips)
  const partial = stills.some(Boolean) || clips.some(Boolean)
  if (partial && attempts < STORY_JOB_ATTEMPTS) {
    /*
     * Part of it is made and paid for: keep it, and let the sweep take the
     * job again once it has been quiet long enough. Released, not retried
     * here -- one path back into a job, so two runners never hold one.
     */
    await pool.query(
      `UPDATE story_jobs SET stills = $2, clips = $3, runner = NULL,
              error = $4, updated_at = now() WHERE id = $1`,
      [
        id,
        JSON.stringify(stills),
        JSON.stringify(clips),
        String(ans?.reason ?? '').slice(0, 500),
      ]
    )
    return
  }
  return fail(String(ans?.reason ?? 'рилс не собрался'))
}

/**
 * A finished reel the SELLER asked for. With a group to go to: a send card
 * (story-card.ts), or -- while another card waits for the seller -- a word
 * that it will come, and the sweep offers it later. Without one, or when the
 * card cannot be made: the video, to look at and forward by hand.
 */
async function handToSeller(
  deps: StoryDeps,
  job: any,
  name: string,
  payer: string
): Promise<void> {
  const lead = String(job.lead_id)
  const seller = String(job.requester)
  const topic = String(job.topic ?? '')
  const url = String(job.url)
  const renderSent = payer === seller
  if (job.deliver_to && deps.offerCard) {
    const outcome = await offerJobCard(deps, job, name, !renderSent)
    if (outcome === 'shown') return
    if (outcome === 'busy') {
      await deps.notify(
        null,
        seller,
        `Рилс-история для ${name || lead} готова: «${topic}». ` +
          'Карточка отправки в группу придёт сюда, как только вы ответите на ту, что уже ждёт.',
        { video: url, renderSent }
      )
      return
    }
  }
  const link = nextLink(await deps.botOf?.(lead).catch(() => null))
  await deps.notify(
    null,
    seller,
    `Рилс-история для ${name || lead} готова: «${topic}». ` +
      'Посмотри и перешли клиенту сам — без тебя он к ней не уйдёт.' +
      (job.deliver_to && job.caption
        ? `\n\nПодпись для группы:\n${job.caption}`
        : '') +
      (link ? `\nСледующий она может взять сама одной кнопкой: ${link}` : ''),
    { video: url, renderSent }
  )
}

/**
 * Offer one job's group card. The job is claimed first (card_at), so the
 * runner that finished it and the sweep never both offer it; a card that
 * waits its turn gives the claim back for the sweep to try again.
 */
async function offerJobCard(
  deps: StoryDeps,
  job: any,
  name: string,
  withVideo: boolean
): Promise<CardOutcome> {
  const id = Number(job.id)
  const lead = String(job.lead_id)
  const seller = String(job.requester)
  const chat = String(job.deliver_to)
  // Her own id is her DM: the gift, not a group.
  const dm = chat === lead
  const claimed = await deps.pool.query(
    `UPDATE story_jobs SET card_at = now() WHERE id = $1 AND card_at IS NULL RETURNING id`,
    [id]
  )
  if (!claimed?.rows?.length) return 'shown' // somebody else holds it
  const bot = await deps.botOf?.(lead).catch(() => null)
  const topic = String(job.topic ?? '')
  const outcome = await deps.offerCard!({
    jobId: id,
    owner: seller,
    chat,
    dm,
    groupTitle: dm
      ? null
      : ((await deps.groupTitle?.(seller, lead, chat).catch(() => null)) ??
        null),
    url: String(job.url),
    caption:
      String(job.caption ?? '').trim() ||
      defaultGroupCaption(name, topic, deps.pageOf?.(bot ?? null) ?? ''),
    name: name || lead,
    topic,
    withVideo,
  }).catch((): CardOutcome => 'failed')
  if (outcome === 'busy')
    await deps.pool
      .query(`UPDATE story_jobs SET card_at = NULL WHERE id = $1`, [id])
      .catch(() => undefined)
  return outcome
}

/** Group cards that waited for the seller's queue: offered again, a day at most. */
export async function offerWaitingCards(deps: StoryDeps): Promise<number> {
  if (!deps.offerCard) return 0
  const r = await deps.pool.query(
    `SELECT * FROM story_jobs
      WHERE status = 'done' AND deliver_to IS NOT NULL AND card_at IS NULL
        AND url IS NOT NULL
        AND updated_at > now() - ($1 || ' hours')::interval
      ORDER BY id LIMIT $2`,
    [String(SPEC.WAITING_CARD_WINDOW_HOURS), SPEC.SWEEP_CLAIM_BATCH]
  )
  let shown = 0
  for (const job of r?.rows ?? []) {
    const s = await storySettingsOf(
      deps.pool,
      String(job.lead_id),
      String(job.seller_id)
    ).catch(() => null)
    // The video already reached the seller when the job finished.
    const outcome = await offerJobCard(deps, job, s?.name ?? '', false)
    if (outcome === 'shown') shown++
  }
  return shown
}

/**
 * THE SWEEP: at boot and every STORY_SWEEP_MS. A running job that stopped
 * beating lost its process -- a redeploy, most often -- and is claimed here in
 * one statement (two instances overlap for a minute on every deploy, and only
 * one of them may win), then continued from what is already made. A job
 * silent past STORY_ABANDON_MINUTES, or out of attempts, is given up.
 */
export async function sweepStoryJobs(deps: StoryDeps): Promise<number> {
  const { pool } = deps
  const me = deps.me ?? ME
  await ensureStoryJobs(pool)
  await pool.query(
    `UPDATE story_jobs SET status = 'failed',
            error = COALESCE(NULLIF(error, ''), 'abandoned'), updated_at = now()
      WHERE status = 'running'
        AND updated_at < now() - ($1 || ' minutes')::interval`,
    [String(STORY_ABANDON_MINUTES)]
  )
  const r = await pool.query(
    `UPDATE story_jobs SET runner = $1, updated_at = now()
      WHERE id IN (SELECT id FROM story_jobs
                    WHERE status = 'running'
                      AND updated_at < now() - ($2 || ' milliseconds')::interval
                    ORDER BY id LIMIT $3
                    FOR UPDATE SKIP LOCKED)
      RETURNING id`,
    [me, String(STORY_DEAD_MS), SPEC.SWEEP_CLAIM_BATCH]
  )
  const ids: number[] = (r?.rows ?? []).map((x: any) => Number(x.id))
  for (const id of ids) void runStoryJob(deps, id).catch(() => undefined)
  void offerWaitingCards(deps).catch(() => undefined)
  return ids.length
}

/** Start the sweep for this process: now, and every STORY_SWEEP_MS. */
export function startStorySweep(deps: StoryDeps): () => void {
  const tick = () => void sweepStoryJobs(deps).catch(() => undefined)
  tick()
  return beatWith(deps)(tick, STORY_SWEEP_MS)
}
