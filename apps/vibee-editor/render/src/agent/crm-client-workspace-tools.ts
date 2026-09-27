/**
 * THE PER-CLIENT WORKSPACE: what the `/crm/:clientId` dashboard reads.
 *
 * The owner's complaint (2026-09-13): every client landed in one list and one
 * chat. The data was already keyed per client -- crm_people, crm_touches,
 * crm_client_profiles, content_plan_* -- only the reads were missing. Two
 * read-only tools, both seller-gated BEFORE the first query (crm-owner-gate
 * test), both free. Spec: t27 specs/automation/crm-client-workspace.t27.
 *
 *  - crm_client_plan {telegram_id}: goals and items of the content plan with
 *    done/total, so the dashboard draws a bar instead of guessing.
 *  - crm_clients {limit}: the union of clients with a profile and people the
 *    ingest met for this owner, newest first, one row per person.
 *
 * Each source is read on its own; a base without a table costs that column,
 * not the answer. Nothing here sends anything.
 */
import type { AgentTool, ToolContext } from './tools'
import { requireSeller } from './telegram-tools'
import { requireOwnLead } from './crm-reach'
import { ensurePlanTables, ensureProfileTable } from './crm-client-setup-tool'
import { stageOf, type Stage } from './crm-stages'
import { visibleScope, whoPaid } from './crm-tools'
import { touchesByLead, type TouchKind } from './crm-touches'
import * as REEL from '../spec/crm-story-reel.gen'

const ID_RE = /^\d{5,15}$/

export interface PlanGoalRow {
  id: number
  title: string
  intent: string | null
}
export interface PlanItemRow {
  id: number
  goal_id: number
  title: string
  status: string
  template_id: string | null
  updated_at: string | null
}

/** Pure: goals with their item counts by status, plus the totals. */
export function aggregatePlan(goals: PlanGoalRow[], items: PlanItemRow[]) {
  const perGoal = new Map<
    number,
    { total: number; done: number; by_status: Record<string, number> }
  >()
  for (const g of goals) perGoal.set(g.id, { total: 0, done: 0, by_status: {} })
  let done = 0
  for (const it of items) {
    const c = perGoal.get(it.goal_id) ?? { total: 0, done: 0, by_status: {} }
    perGoal.set(it.goal_id, c)
    c.total++
    c.by_status[it.status] = (c.by_status[it.status] ?? 0) + 1
    if (it.status === 'done') {
      c.done++
      done++
    }
  }
  return {
    goals: goals.map(g => ({
      id: g.id,
      title: g.title,
      intent: g.intent,
      items: perGoal.get(g.id) ?? { total: 0, done: 0, by_status: {} },
    })),
    items,
    total: items.length,
    done,
  }
}

export interface ProfileRow {
  telegram_id: string
  client: string | null
  updated_at: string | null
}
export interface PersonRow {
  lead_id: string
  first_name: string | null
  last_name: string | null
  username: string | null
  seen_at: string | null
}
export interface ClientRow {
  telegram_id: string
  name: string | null
  username: string | null
  client: string | null
  has_profile: boolean
  has_soul: boolean
  skills: number
  stage: Stage
  /** A COMPLETED MONEY_INCOME row in payments_v2 for one of the owner's bots. */
  paid: boolean
  last_seen: string | null
  duets: number
  /**
   * The picture the app draws the person with. Owner, 2026-09-23: show people
   * as circles with their avatar and their name under it. Null when we have
   * never stored one -- the app then draws initials rather than a grey hole,
   * and nothing is fetched from Telegram to fill this in: a list of fifty
   * would become fifty API calls for a decoration.
   */
  avatar_url: string | null
}

/**
 * Who paid, scoped to the owner's own bots (spec crm-client-ownership.t27).
 * A dead Supabase costs the money column, not the answer: `known: false`
 * and the stage falls back to touches alone.
 */
export async function paidSetFor(
  ctx: ToolContext
): Promise<{ paid: Set<string>; known: boolean }> {
  try {
    const scope = await visibleScope(ctx)
    return { paid: await whoPaid(scope, ctx.pool as never), known: true }
  } catch {
    return { paid: new Set<string>(), known: false }
  }
}

const later = (a: string | null, b: string | null): string | null => {
  if (!a) return b
  if (!b) return a
  return Date.parse(b) > Date.parse(a) ? b : a
}

/** Pure: one row per person, profile and ingest merged, newest first. */
/** A search for the clients list: an exact id, or a name / @username. */
export function clientQuery(
  raw: unknown
): { id: string; like: string; text: string } | null {
  const text = String(raw ?? '')
    .trim()
    .replace(/^@/, '')
    .slice(0, 64)
  if (!text) return null
  // LIKE wildcards typed by a person are literal characters.
  const escaped = text.replace(/[\\%_]/g, m => `\\${m}`)
  return { id: text, like: `%${escaped}%`, text: text.toLowerCase() }
}

/** The same search over a profile row, which lives in JSON, not columns. */
export function profileMatches(
  p: ProfileRow,
  q: { id: string; text: string }
): boolean {
  if (String(p.telegram_id) === q.id) return true
  return JSON.stringify(p.client ?? '')
    .toLowerCase()
    .includes(q.text)
}

export function mergeClients(input: {
  profiles: ProfileRow[]
  people: PersonRow[]
  souls: Set<string>
  skills: Map<string, number>
  duets: Map<string, number>
  avatars?: Map<string, string>
  touches: Map<string, Array<{ kind: TouchKind; at: string }>>
  paid?: Set<string>
  now?: number
}): ClientRow[] {
  const now = input.now ?? Date.now()
  const rows = new Map<string, ClientRow>()
  const blank = (id: string): ClientRow => ({
    telegram_id: id,
    name: null,
    username: null,
    client: null,
    has_profile: false,
    has_soul: input.souls.has(id),
    skills: input.skills.get(id) ?? 0,
    stage: 'new',
    paid: input.paid?.has(id) ?? false,
    last_seen: null,
    duets: input.duets.get(id) ?? 0,
    avatar_url: input.avatars?.get(id) ?? null,
  })
  for (const p of input.people) {
    const id = String(p.lead_id)
    const r = rows.get(id) ?? blank(id)
    r.name = [p.first_name, p.last_name].filter(Boolean).join(' ') || r.name
    r.username = p.username ?? r.username
    r.last_seen = later(r.last_seen, p.seen_at)
    rows.set(id, r)
  }
  for (const p of input.profiles) {
    const id = String(p.telegram_id)
    const r = rows.get(id) ?? blank(id)
    r.has_profile = true
    r.client = p.client ?? r.client
    r.last_seen = later(r.last_seen, p.updated_at)
    rows.set(id, r)
  }
  for (const r of rows.values()) {
    const touches = input.touches.get(r.telegram_id) ?? []
    const quietDays = r.last_seen
      ? Math.max(0, Math.floor((now - Date.parse(r.last_seen)) / 86_400_000))
      : null
    // Money first, as crm-stages.ts says: somebody who paid is a client even
    // if the last touch says 'refused'.
    r.stage = stageOf({ paid: r.paid, touches, quietDays }).stage
  }
  return [...rows.values()].sort(
    (a, b) =>
      (b.last_seen ? Date.parse(b.last_seen) : 0) -
      (a.last_seen ? Date.parse(a.last_seen) : 0)
  )
}

async function tryQuery<T = any>(
  ctx: ToolContext,
  sql: string,
  params: unknown[]
): Promise<T[]> {
  try {
    const r = await ctx.pool.query(sql, params)
    return (r.rows ?? []) as T[]
  } catch {
    return []
  }
}

/** How a reel is made from a plan item, said where the plan is read. */
export function planReelRoute(): string {
  return (
    `рилс по пункту плана — ${REEL.SELLER_TOOL} {lead, start: true, topic: название пункта}: три кадра, лицо и голос клиента; ` + // cyrillic-ok: tool result copy
    `template_id пункта (${REEL.OLD_PLAN_REEL}) — старый беззвучный шаблон, только если владелец назвал его сам` // cyrillic-ok: tool result copy
  )
}

export const CRM_CLIENT_WORKSPACE_TOOLS: AgentTool[] = [
  {
    name: 'crm_client_plan',
    description:
      'Контент-план клиента: цели и карточки (idea/draft/done), прогресс done/total.',
    parameters: {
      type: 'object',
      properties: {
        telegram_id: { type: 'string', description: 'Telegram ID клиента' },
      },
      required: ['telegram_id'],
      additionalProperties: false,
    },
    async handler(args: Record<string, any>, ctx?: ToolContext) {
      await requireSeller(ctx)
      const telegramId = String(args.telegram_id ?? '').trim()
      if (!ID_RE.test(telegramId))
        throw new Error('telegram_id должен быть числовым Telegram ID')
      /*
       * A PLAN IS READ ONLY BY ITS OWNER OR BY THAT PERSON'S OWN SELLER.
       *
       * Same class as crm_deliver_photo, same sweep (2026-09-20): `isSeller`
       * is self-serve, and this read took `telegram_id` from the call and
       * returned that person's goals and cards to ANY seller. A content plan
       * is somebody's unpublished ideas; "any user who connected their own
       * Telegram" is not who should read them.
       *
       * The check written here by hand on 2026-09-20 now lives in crm-reach,
       * because two more tools turned out to need the same sentence and a
       * fourth hand-written copy is how the first one gets forgotten. Reading
       * from the shared rule also gains the keeper their access: the platform
       * owner is the super-admin and does see the whole farm, which the inline
       * version denied them.
       */
      await requireOwnLead(ctx, telegramId)
      await ensurePlanTables(ctx!)
      const goals = await tryQuery<PlanGoalRow>(
        ctx!,
        `SELECT id, title, intent FROM content_plan_goals WHERE telegram_id = $1 ORDER BY id`,
        [telegramId]
      )
      const items = await tryQuery<PlanItemRow>(
        ctx!,
        `SELECT id, goal_id, title, status, template_id, updated_at::text AS updated_at
           FROM content_plan_items WHERE telegram_id = $1 ORDER BY goal_id, id`,
        [telegramId]
      )
      return {
        telegram_id: telegramId,
        ...aggregatePlan(goals, items),
        /*
         * THE ROUTE BESIDE THE ITEMS (crm-story-reel v9, REEL_TOOL_IN_PLAN_READ).
         * One client's twelve items carry template_id LeelaPlanReel; read with
         * nothing beside them, "D5, template LeelaPlanReel" was a reason to
         * render the silent reel the owner had moved away from.
         */
        ...(items.length ? { reel_route: planReelRoute() } : {}),
      }
    },
  },
  {
    name: 'crm_clients',
    description:
      'Клиенты продавца (профили + люди из переписки), новые сверху: имя, стадия (оплата выше касаний), SOUL, скиллы, дуэты.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'По умолчанию 50, максимум 200' },
        // Page mode (#2947): offset comes from next_offset; query matches a
        // name, @username or id. Undescribed: the compact kit is full.
        offset: { type: 'number' },
        query: { type: 'string' },
      },
      additionalProperties: false,
    },
    async handler(args: Record<string, any>, ctx?: ToolContext) {
      await requireSeller(ctx)
      const owner = String(ctx!.telegramId)
      const limit = Math.min(
        200,
        Math.max(1, Math.floor(Number(args.limit) || 50))
      )
      /*
       * PAGES PAST FIFTY (#2947). With the contact book in crm_people an
       * owner has hundreds or thousands of people, and the list stopped at
       * fifty. `offset` / `query` switch to page mode: people are paged in
       * SQL (still WHERE owner_id = caller), profiles ride along on the
       * first page only, nothing is cut after the merge, and `next_offset`
       * says where the next page starts (null at the end).
       */
      const paged = args.offset !== undefined || Boolean(args.query)
      const offset = Math.max(0, Math.floor(Number(args.offset) || 0))
      const query = clientQuery(args.query)
      try {
        await ensureProfileTable(ctx!)
      } catch {
        // No profiles table: the list is built from the ingest alone.
      }
      const people = await tryQuery<PersonRow>(
        ctx!,
        query
          ? `SELECT lead_id, first_name, last_name, username, seen_at::text AS seen_at
               FROM crm_people
              WHERE owner_id = $1
                AND (lead_id = $4
                     OR coalesce(first_name, '') || ' ' || coalesce(last_name, '') ILIKE $5
                     OR username ILIKE $5)
              ORDER BY seen_at DESC, lead_id LIMIT $2 OFFSET $3`
          : `SELECT lead_id, first_name, last_name, username, seen_at::text AS seen_at
               FROM crm_people WHERE owner_id = $1
              ORDER BY seen_at DESC, lead_id LIMIT $2 OFFSET $3`,
        query
          ? [owner, limit, offset, query.id, query.like]
          : [owner, limit, offset]
      )
      // Our own profiles and the legacy rows nobody has claimed yet. In page
      // mode they come with the first page only, so a later page is people.
      const profiles =
        paged && offset > 0
          ? []
          : (
              await tryQuery<ProfileRow>(
                ctx!,
                `SELECT telegram_id, client, updated_at::text AS updated_at
                   FROM crm_client_profiles
                  WHERE owner_id = $2 OR owner_id IS NULL
                  ORDER BY updated_at DESC LIMIT $1`,
                [limit, owner]
              )
            ).filter(p => !query || profileMatches(p, query))
      const ids = [
        ...new Set([
          ...people.map(p => String(p.lead_id)),
          ...profiles.map(p => String(p.telegram_id)),
        ]),
      ]
      const souls = new Set(
        (
          await tryQuery<{ telegram_id: string }>(
            ctx!,
            `SELECT telegram_id FROM user_soul WHERE telegram_id = ANY($1)`,
            [ids]
          )
        ).map(r => String(r.telegram_id))
      )
      const skills = new Map<string, number>()
      for (const r of await tryQuery<{ telegram_id: string; n: number }>(
        ctx!,
        `SELECT telegram_id, count(*)::int AS n FROM user_skills WHERE telegram_id = ANY($1) GROUP BY telegram_id`,
        [ids]
      ))
        skills.set(String(r.telegram_id), Number(r.n))
      const duets = new Map<string, number>()
      for (const r of await tryQuery<{ buyer_id: string; n: number }>(
        ctx!,
        `SELECT buyer_id, count(*)::int AS n FROM crm_duet_runs WHERE owner_id = $1 GROUP BY buyer_id`,
        [owner]
      ))
        duets.set(String(r.buyer_id), Number(r.n))
      const touches = await touchesByLead(ctx!.pool as never, owner)
      const money = await paidSetFor(ctx!)
      /*
       * The pictures we ALREADY have. One query for the whole page, from our
       * own `users` row -- never a trip to Telegram per person: a list of
       * fifty would become fifty API calls for a decoration, and the app draws
       * initials perfectly well without them.
       */
      const avatars = new Map<string, string>()
      for (const r of await tryQuery<{
        telegram_id: string
        avatar_url: string | null
      }>(
        ctx!,
        `SELECT telegram_id, avatar_url FROM users
          WHERE telegram_id = ANY($1) AND avatar_url IS NOT NULL`,
        [ids]
      )) {
        const url = String(r.avatar_url ?? '').trim()
        if (url) avatars.set(String(r.telegram_id), url)
      }
      // Faces the owner's session fetched (crm_client_avatars): every lead
      // met in his own Telegram, not only people who once opened our bot.
      for (const r of await tryQuery<{
        lead_id: string
        avatar_url: string | null
      }>(
        ctx!,
        `SELECT lead_id, avatar_url FROM crm_people
          WHERE owner_id = $1 AND lead_id = ANY($2) AND avatar_url IS NOT NULL`,
        [owner, ids]
      )) {
        const url = String(r.avatar_url ?? '').trim()
        if (url && !avatars.has(String(r.lead_id)))
          avatars.set(String(r.lead_id), url)
      }
      const clients = mergeClients({
        profiles,
        people,
        souls,
        skills,
        duets,
        touches,
        avatars,
        paid: money.paid,
      })
      if (!paged) {
        return { clients: clients.slice(0, limit), paid_known: money.known }
      }
      return {
        clients,
        paid_known: money.known,
        next_offset: people.length === limit ? offset + limit : null,
      }
    },
  },
]
