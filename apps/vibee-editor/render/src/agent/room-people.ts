/**
 * WHO IS IN THE ROOM, AND WHICH OF THEM WE ACTUALLY KNOW.
 *
 * The morning post for the owner's room (groupDayPlan) can only say what we
 * KNOW about a person. Its three fields have three very different answers:
 *
 *   hasProfile  ANSWERABLE. crm_client_profiles is keyed by
 *               (owner_id, telegram_id): one query settles it for a whole
 *               room, and both true and false are facts.
 *   connected   NOT ANSWERABLE TODAY. There is no table that says a person
 *               connected their own Telegram in the app, so this field is
 *               left OUT rather than guessed -- and the plan then never says
 *               "your app is not connected" to anybody. Silence is the
 *               correct output of a question nobody can answer.
 *   lastAt      NOT ANSWERABLE PER PERSON. The room's memory is one thread
 *               keyed by the chat (conversation.ts roomThread), not messages
 *               with senders, so "when did THIS person last write" is not in
 *               it. Also left out.
 *
 * Two of three missing is not a shortcoming of this module; it is the state
 * of what we hold, said out loud. A field filled with a guess would be a
 * sentence about a real person, read by their colleagues -- which is the
 * defect groupDayPlan carried until the day it was read (form 184).
 *
 * The participants come from the OWNER'S OWN SESSION: the Bot API cannot
 * list the members of a group, which is why this was called impossible for
 * several ticks. It was not; it was in the other door.
 */
import type { AgentTool, ToolContext } from './tools'
import { requireSeller, withClient } from './telegram-tools'
import { resolvingPeer } from './tg-proposals'

export const ROOM_LIMIT_MAX = 200

/** Whose profile we hold, among the ids given. Never throws: see facesKnown. */
export const PROFILES_SQL = `SELECT telegram_id FROM crm_client_profiles
   WHERE owner_id = $1 AND telegram_id = ANY($2::text[])`

/**
 * `null` MEANS "COULD NOT ASK", AND THAT IS THE WHOLE POINT.
 *
 * An empty Set would mean both "nobody in this room has a profile" and "the
 * table is not there" -- and the caller would print the first for the second,
 * telling a room full of people they are all unregistered because a query
 * failed. So a failure is its own answer, and it still never throws: a post
 * that stays quiet is the correct outcome of a question we could not ask.
 */
export async function profilesKnown(
  pool: { query: (sql: string, p?: unknown[]) => Promise<{ rows: any[] }> },
  owner: string,
  ids: readonly string[]
): Promise<Set<string> | null> {
  const list = [...new Set(ids.map(String).filter(Boolean))]
  if (!list.length) return new Set()
  try {
    const r = await pool.query(PROFILES_SQL, [String(owner), list])
    return new Set((r.rows ?? []).map(x => String(x.telegram_id)))
  } catch {
    return null
  }
}

export const ROOM_PEOPLE_TOOLS: AgentTool[] = [
  {
    name: 'crm_room_people',
    description:
      'Screen/timer helper: who is in a group and which of them has a seller ' +
      'profile. Read-only. Fields we cannot answer are left out, never guessed.',
    parameters: {
      type: 'object',
      properties: {
        chat: { type: 'string', description: 'group id or @username' },
        limit: { type: 'number', description: `1..${ROOM_LIMIT_MAX}` },
      },
      required: ['chat'],
      additionalProperties: false,
    },
    async handler(args: Record<string, any>, ctx?: ToolContext) {
      await requireSeller(ctx)
      const owner = String(ctx!.telegramId)
      const limit = Math.min(
        ROOM_LIMIT_MAX,
        Math.max(1, Math.floor(Number(args.limit) || 100))
      )
      const people = await withClient(ctx, async (c: any) =>
        resolvingPeer(c, String(args.chat), async () => {
          const raw = await c.getParticipants(String(args.chat), { limit })
          return (raw ?? []).map((p: any) => ({
            id: p?.id?.toString?.() ?? '',
            name:
              [p?.firstName, p?.lastName].filter(Boolean).join(' ') ||
              undefined,
            username: p?.username || undefined,
            bot: p?.bot === true,
          }))
        })
      )
      const real = (people as any[]).filter(p => p.id && !p.bot)
      /*
       * `null` when the lookup could not run -- told apart from an empty room
       * inside profilesKnown, because an empty Set cannot mean both.
       */
      const known = await profilesKnown(
        ctx!.pool as never,
        owner,
        real.map(p => p.id)
      )
      return {
        chat: String(args.chat),
        people: real.map(p => ({
          id: p.id,
          ...(p.name ? { name: p.name } : {}),
          ...(p.username ? { username: p.username } : {}),
          // Left out entirely when the lookup could not run.
          ...(known ? { has_profile: known.has(p.id) } : {}),
        })),
        /* Said plainly, so a caller cannot read absence as a negative. */
        unknown_fields: ['connected', 'last_message_at'],
        note: known
          ? undefined
          : 'профили не прочитаны: has_profile не заполнен ни у кого', // cyrillic-ok: tool result copy
      }
    },
  },
]
