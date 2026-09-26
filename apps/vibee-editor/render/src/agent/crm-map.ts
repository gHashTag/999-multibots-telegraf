/**
 * THE OWNER'S PEOPLE AS A MAP: WHO, WHAT THEY CARE ABOUT, WHO KNOWS WHOM.
 *
 * Owner, 2026-09-25: a tab with every contact as a round avatar, placed by
 * sphere of interest, the owner in the centre, and the links between people
 * drawn as a graph; a tap on an avatar opens every action for that contact.
 *
 * Both halves come from facts the CRM already stores -- nothing is guessed
 * by a model and nothing is asked of Telegram here:
 *
 *  - SPHERE: what a person writes, in our DMs and in the groups we share,
 *    matched against a fixed keyword table. The table is small and dull on
 *    purpose: a person the words do not place lands in `other`, and "other"
 *    is an honest answer, a wrong sphere is not.
 *  - LINKS: two people who both WROTE in the same group know of each other.
 *    That is the one relation the memory can prove; a shared sphere is not a
 *    relation and is drawn as placement, never as an edge.
 *  - WEIGHT of the spoke to the owner: how much we actually talked.
 *
 * Read-only, seller-gated, a direct call from the app (DIRECT_CALL_ONLY in
 * tools.ts): a map is a screen, not a thing the agent needs to read in a turn.
 */
import type { AgentTool, ToolContext } from './tools'
import { requireSeller } from './telegram-tools'

export const SPHERES = [
  'business',
  'content',
  'tech',
  'beauty',
  'health',
  'education',
  'art',
  'other',
] as const
export type Sphere = (typeof SPHERES)[number]

/** Word stems per sphere; Russian and English, case-blind. */
const SPHERE_WORDS: Record<Exclude<Sphere, 'other'>, RegExp> = {
  business:
    // cyrillic-ok-next-line
    /бизнес|продаж|клиент|маркетинг|стартап|инвест|предприним|доход|выручк|воронк|business|sales|marketing|startup|invest|revenue/gi,
  content:
    // cyrillic-ok-next-line
    /рилс|reels|контент|блог|инстаграм|тикток|ютуб|сторис|подписчик|монтаж|съёмк|съемк|content|blog|youtube|tiktok|instagram|stories/gi,
  tech:
    // cyrillic-ok-next-line
    /програм|разработ|нейросет|(?<![а-яё])ии(?![а-яё])|\bai\b|gpt|(?<![а-яё])бот|python|javascript|крипт|блокчейн|сервер|developer|coding|crypto|blockchain/gi,
  beauty:
    // cyrillic-ok-next-line
    /красот|макияж|косметолог|маникюр|стилист|мода|фотосесс|beauty|makeup|fashion|stylist/gi,
  health:
    // cyrillic-ok-next-line
    /здоров|спорт|фитнес|йог|питани|медитац|психолог|терап|нутрицио|health|fitness|yoga|wellness|therapy/gi,
  education:
    // cyrillic-ok-next-line
    /обучен|курс|школ|урок|учёб|учеб|универ|ментор|наставни|education|course|mentor|teach|lesson/gi,
  art:
    // cyrillic-ok-next-line
    /музык|песн|художн|дизайн|творч|(?<![а-яё])кино|живопис|music|song|artist|design|painting|\bfilm/gi,
}

/** The sphere whose words a text uses most; `other` when none. */
export function sphereOf(text: string): Sphere {
  let best: Sphere = 'other'
  let top = 0
  for (const [sphere, re] of Object.entries(SPHERE_WORDS)) {
    const n = (String(text).match(re) ?? []).length
    if (n > top) {
      top = n
      best = sphere as Sphere
    }
  }
  return best
}

export interface MapPerson {
  id: string
  name: string | null
  username: string | null
  avatarUrl: string | null
  /** Messages both ways in our DMs over the window. */
  talk: number
  text: string
}

export interface MapNode {
  id: string
  name: string | null
  username: string | null
  avatar_url: string | null
  sphere: Sphere
  talk: number
}

export interface MapEdge {
  a: string
  b: string
  /** How many groups both of them wrote in. */
  shared: number
}

/** Pairs linked inside one group at most: a 500-person chat is not 125 000 friendships. */
export const GROUP_PAIR_CAP = 12
export const MAX_EDGES = 400

/**
 * Pure: nodes with spheres, edges from groups both people wrote in.
 * `posters` is group -> the node ids that wrote there, most active first.
 */
export function buildMap(
  people: MapPerson[],
  posters: Map<string, string[]>
): { nodes: MapNode[]; edges: MapEdge[] } {
  const known = new Set(people.map(p => p.id))
  const nodes = people.map(p => ({
    id: p.id,
    name: p.name,
    username: p.username,
    avatar_url: p.avatarUrl,
    sphere: sphereOf(p.text),
    talk: p.talk,
  }))
  const pairs = new Map<string, number>()
  for (const ids of posters.values()) {
    const here = [...new Set(ids.filter(id => known.has(id)))].slice(
      0,
      GROUP_PAIR_CAP
    )
    for (let i = 0; i < here.length; i++)
      for (let j = i + 1; j < here.length; j++) {
        const [a, b] = [here[i], here[j]].sort()
        const key = `${a}|${b}`
        pairs.set(key, (pairs.get(key) ?? 0) + 1)
      }
  }
  const edges = [...pairs.entries()]
    .map(([key, shared]) => {
      const [a, b] = key.split('|')
      return { a, b, shared }
    })
    .sort((x, y) => y.shared - x.shared || (x.a + x.b).localeCompare(y.a + y.b))
    .slice(0, MAX_EDGES)
  return { nodes, edges }
}

type Pool = { query: (sql: string, p?: unknown[]) => Promise<{ rows: any[] }> }

async function rowsOf(pool: Pool, sql: string, params: unknown[]) {
  try {
    return (await pool.query(sql, params)).rows
  } catch {
    // A table not created yet costs that half of the map, not the map.
    return []
  }
}

export async function mapFor(
  pool: Pool,
  owner: string,
  limit = 120,
  days = 180
): Promise<{ nodes: MapNode[]; edges: MapEdge[] }> {
  const span = String(days)
  const talk = await rowsOf(
    pool,
    `SELECT m.lead_id, count(*)::int AS n,
            p.first_name, p.last_name, p.username, p.avatar_url
       FROM crm_messages m
       LEFT JOIN crm_people p ON p.owner_id = m.owner_id AND p.lead_id = m.lead_id
      WHERE m.owner_id = $1 AND m.at > now() - ($2 || ' days')::interval
      GROUP BY m.lead_id, p.first_name, p.last_name, p.username, p.avatar_url
      ORDER BY n DESC, m.lead_id
      LIMIT $3`,
    [owner, span, limit]
  )
  // Without avatar_url (crm-avatars never ran) the join above fails whole;
  // the same list without pictures is still a map.
  const people = talk.length
    ? talk
    : await rowsOf(
        pool,
        `SELECT m.lead_id, count(*)::int AS n,
                p.first_name, p.last_name, p.username, NULL AS avatar_url
           FROM crm_messages m
           LEFT JOIN crm_people p ON p.owner_id = m.owner_id AND p.lead_id = m.lead_id
          WHERE m.owner_id = $1 AND m.at > now() - ($2 || ' days')::interval
          GROUP BY m.lead_id, p.first_name, p.last_name, p.username
          ORDER BY n DESC, m.lead_id
          LIMIT $3`,
        [owner, span, limit]
      )
  if (!people.length) return { nodes: [], edges: [] }
  const ids = people.map(r => String(r.lead_id))
  const text = new Map<string, string>()
  const addText = (id: string, t: unknown) => {
    const prev = text.get(id) ?? ''
    if (prev.length < 6000) text.set(id, `${prev} ${String(t ?? '')}`)
  }
  for (const r of await rowsOf(
    pool,
    `SELECT lead_id, text FROM (
        SELECT lead_id, text,
               row_number() OVER (PARTITION BY lead_id ORDER BY at DESC) AS k
          FROM crm_messages
         WHERE owner_id = $1 AND "out" = false AND lead_id = ANY($2)
      ) x WHERE k <= 40`,
    [owner, ids]
  ))
    addText(String(r.lead_id), r.text)
  const posters = new Map<string, string[]>()
  for (const r of await rowsOf(
    pool,
    `SELECT chat_id, sender_id, count(*)::int AS n,
            string_agg(left(text, 300), ' ') AS said
       FROM crm_group_messages
      WHERE owner_id = $1 AND "out" = false AND sender_id = ANY($2)
        AND at > now() - ($3 || ' days')::interval
      GROUP BY chat_id, sender_id
      ORDER BY chat_id, n DESC`,
    [owner, ids, span]
  )) {
    const chat = String(r.chat_id)
    const id = String(r.sender_id)
    posters.set(chat, [...(posters.get(chat) ?? []), id])
    addText(id, r.said)
  }
  return buildMap(
    people.map(r => {
      const name = [r.first_name, r.last_name].filter(Boolean).join(' ').trim()
      const id = String(r.lead_id)
      return {
        id,
        name: name || null,
        username: r.username ? String(r.username) : null,
        avatarUrl: r.avatar_url ? String(r.avatar_url) : null,
        talk: Number(r.n) || 0,
        text: text.get(id) ?? '',
      }
    }),
    posters
  )
}

export const CRM_MAP_TOOLS: AgentTool[] = [
  {
    name: 'crm_map',
    description:
      "The owner's contacts as a map: each with a sphere of interest (from what they write), how much we talked, and links between people who wrote in the same group. Read-only; for the app's Map tab.",
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: '10..200, default 120' },
      },
      additionalProperties: false,
    },
    async handler(args: Record<string, any>, ctx?: ToolContext) {
      await requireSeller(ctx)
      const owner = String(ctx!.telegramId)
      const limit = Math.min(
        200,
        Math.max(10, Math.floor(Number(args.limit) || 120))
      )
      const map = await mapFor(ctx!.pool as never, owner, limit)
      return { ...map, spheres: SPHERES }
    },
  },
]
