/**
 * EACH AGENT WEARS THE OWNER'S FACE, IN ITS OWN STYLE (owner, 2026-09-26:
 * "make avatars in their style from my avatar, img2img gpt 2.5").
 *
 * The picture is made by the cloud agent's own tool, not by a script beside
 * it (skill cloud-agent-does-the-work): `agent_avatars_make` calls the very
 * `image_edit` a person calls, with GPT Image 2.5 and the owner's Telegram
 * avatar as the source -- so the charge, the refund on a provider failure,
 * the late-picture watch and the copy in "my files" are the ones that
 * already hold. This file only says WHICH style each agent wears and keeps
 * the finished address.
 *
 * The avatars are the catalogue's faces, shown to everybody (the chat rail,
 * the market, the dashboards), so only a keeper may make them, and reading
 * them is public (GET /api/agents/avatars).
 */
import type { AgentTool, ToolContext } from './tools'
import {
  MARKETPLACE_AGENTS,
  marketplaceAgentById,
} from '../../../packages/vibee-atoms/src/agent-marketplace'
import { LEAD_MAGNET_MODEL } from '../kie-image'

export interface Queryable {
  query: (
    sql: string,
    params?: unknown[]
  ) => Promise<{ rows: Array<Record<string, unknown>> }>
}

/** Keep the person; change only the role around them. */
const IDENTITY =
  'Keep this exact person: same face, features, age, skin tone and hairstyle. ' +
  'Square head-and-shoulders avatar, centred, looking at the camera, no text, ' +
  'no letters, no watermark. '

/** Each agent's look. English: the model reads it best. */
export const AVATAR_STYLES: Readonly<Record<string, string>> = {
  blogger:
    'Film-noir editorial portrait: black and white, hard side light, deep shadows, ' +
    'a small white upward-pointing triangle emblem on the lapel.',
  job:
    'Confident recruiter and career coach: dark suit, open collar, soft studio ' +
    'light, blurred modern office with a city window behind.',
  google:
    'Explorer and search scout: field jacket, a brass magnifying glass raised to ' +
    'one eye, a faint map of glowing search results behind.',
  tiktok:
    'Short-video producer: neon magenta and cyan rim light, ring light reflection ' +
    'in the eyes, vertical phone rig on a small gimbal in hand.',
  scientist:
    '17th-century natural-philosopher copper engraving: fine cross-hatching, ' +
    'white background, a brass armillary sphere and an open folio beside, ' +
    'a small inverted-triangle mark in the top right corner.',
  fpga:
    'Hardware engineer at the bench: an FPGA development board with a glowing ' +
    'chip, logic-analyser probes, green PCB traces, cool blue lab light.',
  rtl:
    'Digital design engineer: glowing timing-diagram waveforms and a gate-level ' +
    'schematic projected around them, dark room, amber monitor light.',
}

/** The full prompt for one agent's avatar, or null for an unknown one. Pure. */
export function avatarPrompt(agentId: string): string | null {
  const style = AVATAR_STYLES[agentId]
  return style && marketplaceAgentById(agentId) ? IDENTITY + style : null
}

export const AVATAR_PATHS = ['/api/agents/avatars'] as const
export function isAvatarPath(path: string): boolean {
  return (AVATAR_PATHS as readonly string[]).includes(path)
}

let ready = false
export function resetAvatarTableForTests(): void {
  ready = false
}

async function ensureTable(q: Queryable): Promise<void> {
  if (ready) return
  await q.query(`CREATE TABLE IF NOT EXISTS agent_avatars (
    agent_id text PRIMARY KEY,
    url text NOT NULL,
    made_at timestamptz NOT NULL DEFAULT now()
  )`)
  ready = true
}

/** The finished avatars, agent id -> address. */
export async function agentAvatars(
  q: Queryable
): Promise<Record<string, string>> {
  await ensureTable(q)
  const { rows } = await q.query(`SELECT agent_id, url FROM agent_avatars`)
  const out: Record<string, string> = {}
  for (const r of rows)
    if (marketplaceAgentById(r.agent_id) && typeof r.url === 'string')
      out[String(r.agent_id)] = r.url
  return out
}

export async function keepAvatar(
  q: Queryable,
  agentId: string,
  url: string
): Promise<void> {
  await ensureTable(q)
  await q.query(
    `INSERT INTO agent_avatars (agent_id, url) VALUES ($1, $2)
     ON CONFLICT (agent_id) DO UPDATE SET url = EXCLUDED.url, made_at = now()`,
    [agentId, url]
  )
}

/** GET /api/agents/avatars -- public: the catalogue's faces. */
export async function handleAvatars(
  req: { url?: string; method?: string },
  deps: { getPool: () => Promise<Queryable> }
): Promise<{ status: number; body: Record<string, unknown> }> {
  if ((req.method || 'GET') !== 'GET')
    return { status: 405, body: { ok: false, error: 'GET only' } }
  try {
    return {
      status: 200,
      body: { ok: true, avatars: await agentAvatars(await deps.getPool()) },
    }
  } catch {
    return { status: 503, body: { ok: false, error: 'unavailable' } }
  }
}

type EditTool = (
  args: Record<string, unknown>,
  ctx: ToolContext
) => Promise<Record<string, unknown>>

export interface MakeDeps {
  /** The `image_edit` handler; injected by tests, found in TOOLS otherwise. */
  edit?: EditTool
  keepers?: () => string[]
}

/**
 * Make the avatars of the named agent, or of every agent that has none yet
 * (all of them with `redo`). In parallel: one slow picture must not hold the
 * others. Each result says drawn / still drawing / refused, and why.
 */
export async function makeAvatars(
  args: Record<string, unknown>,
  ctx: ToolContext,
  deps: MakeDeps = {}
): Promise<Record<string, unknown>> {
  const keepers = deps.keepers ?? (await import('../hive/roles')).keepers
  if (!ctx?.telegramId || !keepers().includes(String(ctx.telegramId)))
    return {
      done: false,
      reason: 'аватарки агентов видны всем, поэтому их делает только хранитель', // cyrillic-ok: tool answer
    }
  const q = ctx.pool as unknown as Queryable
  const one = args.agent ? String(args.agent) : ''
  if (one && !avatarPrompt(one))
    return { done: false, reason: `нет агента «${one}»` } // cyrillic-ok: tool answer
  const have = one || args.redo === true ? {} : await agentAvatars(q)
  const targets = (one ? [one] : MARKETPLACE_AGENTS.map(a => a.id)).filter(
    id => !have[id]
  )
  if (!targets.length)
    return {
      done: true,
      made: [],
      note: 'у всех агентов уже есть аватарки; redo: true — перерисовать', // cyrillic-ok: tool answer
    }
  const edit =
    deps.edit ??
    ((await import('./tools')).TOOLS.find(t => t.name === 'image_edit')!
      .handler as unknown as EditTool)
  const results = await Promise.all(
    targets.map(async id => {
      try {
        const r = await edit(
          {
            prompt: avatarPrompt(id)!,
            aspect_ratio: '1:1',
            model: LEAD_MAGNET_MODEL,
          },
          ctx
        )
        if (r.done === true && typeof r.url === 'string') {
          await keepAvatar(q, id, r.url)
          return { agent: id, state: 'drawn', url: r.url }
        }
        if (r.pending === true)
          return {
            agent: id,
            state: 'drawing',
            note: 'оплачено, дорисуется в «моих файлах»; повтори для этого агента позже', // cyrillic-ok: tool answer
          }
        return { agent: id, state: 'refused', reason: String(r.reason ?? '') }
      } catch (e) {
        return {
          agent: id,
          state: 'refused',
          reason: e instanceof Error ? e.message : String(e),
        }
      }
    })
  )
  return {
    done: results.some(r => r.state === 'drawn'),
    model: LEAD_MAGNET_MODEL,
    made: results,
  }
}

export const AVATAR_TOOLS: AgentTool[] = [
  {
    name: 'agent_avatars_make',
    description:
      'Сделать аватарки агентов каталога из аватарки владельца (img2img GPT Image ' + // cyrillic-ok: tool description
      '2.5), каждому в своём стиле. Без agent — всем, у кого нет; redo — ' + // cyrillic-ok: tool description
      'перерисовать всех. Цена — gpt_image_edit за каждую. Только хранитель.', // cyrillic-ok: tool description
    parameters: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: 'id агента, например rtl' }, // cyrillic-ok: tool description
        redo: { type: 'boolean', description: 'перерисовать и готовые' }, // cyrillic-ok: tool description
      },
      additionalProperties: false,
    },
    handler: (args, ctx) => makeAvatars(args, ctx as ToolContext),
  },
]
