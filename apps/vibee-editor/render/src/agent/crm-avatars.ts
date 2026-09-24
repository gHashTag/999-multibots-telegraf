/**
 * THE FACES IN THE CRM.
 *
 * Owner, 2026-09-24: "why are there no client avatars in the CRM?!" Because
 * `crm_clients` only knew the pictures in our own `users` table -- people who
 * once opened the bot. A lead the owner met in his own Telegram was never a
 * user of ours, so the list drew initials for almost everyone, while the
 * owner's own chat list shows every face.
 *
 * The owner's session CAN see those photos (it is how the lead magnet draws
 * a portrait). So this tool walks the people of the CRM with ONE session,
 * downloads the missing profile photos, puts them on our shelf and remembers
 * the URL on the `crm_people` row. `crm_clients` then reads it beside the
 * `users` picture.
 *
 * BOUNDED: a batch of at most 30, people not checked in the last 7 days
 * (a person without a photo is checked again a week later, not on every
 * screen open), and the dialog list is warmed ONCE per batch instead of once
 * per unknown id. A screen-driven helper: DIRECT_CALL_ONLY and outside the
 * compact kit -- the model has no reason to call it, and a sentence in a
 * client's message must not be able to open the owner's session in a loop.
 */
import type { AgentTool, ToolContext } from './tools'
import { requireSeller, withClient } from './telegram-tools'

export const AVATAR_BATCH_MAX = 30
export const AVATAR_RECHECK_DAYS = 7

export async function ensureAvatarColumns(pool: {
  query: (sql: string, p?: unknown[]) => Promise<unknown>
}): Promise<void> {
  await pool.query(
    `ALTER TABLE crm_people ADD COLUMN IF NOT EXISTS avatar_url text`
  )
  await pool.query(
    `ALTER TABLE crm_people ADD COLUMN IF NOT EXISTS avatar_checked_at timestamptz`
  )
}

interface Due {
  lead_id: string
  username: string | null
}

/** Who needs a look: never checked, or checked long enough ago. */
export const DUE_SQL = `SELECT lead_id, username FROM crm_people
  WHERE owner_id = $1
    AND (avatar_checked_at IS NULL
         OR avatar_checked_at < now() - ($2 || ' days')::interval)
  ORDER BY seen_at DESC
  LIMIT $3`

export const CRM_AVATAR_TOOLS: AgentTool[] = [
  {
    name: 'crm_client_avatars',
    description:
      'Screen helper: fetch missing profile photos of CRM people through the owner session and remember them. Read-only for Telegram.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: `1..${AVATAR_BATCH_MAX}` },
      },
      additionalProperties: false,
    },
    async handler(args: Record<string, any>, ctx?: ToolContext) {
      await requireSeller(ctx)
      const owner = String(ctx!.telegramId)
      const pool = ctx!.pool as never as {
        query: (sql: string, p?: unknown[]) => Promise<{ rows: any[] }>
      }
      const limit = Math.min(
        AVATAR_BATCH_MAX,
        Math.max(1, Math.floor(Number(args.limit) || 20))
      )
      try {
        await ensureAvatarColumns(pool)
      } catch {
        return { fetched: 0, empty: 0, checked: 0, note: 'no crm_people yet' }
      }
      const due = (
        await pool.query(DUE_SQL, [owner, String(AVATAR_RECHECK_DAYS), limit])
      ).rows as Due[]
      if (!due.length) return { fetched: 0, empty: 0, checked: 0 }
      const { publishImageBytes } = await import('./tools')
      let fetched = 0
      let empty = 0
      await withClient(ctx, async (c: any) => {
        // One warm-up for the whole batch: a fresh client knows no entity,
        // and a bare id resolves only after the dialogs have been listed.
        await c.getDialogs?.({ limit: 200 }).catch(() => undefined)
        for (const p of due) {
          let url: string | null = null
          try {
            const target = p.username ? `@${p.username}` : String(p.lead_id)
            const bytes = await c.downloadProfilePhoto?.(target, {
              isBig: false,
            })
            if (Buffer.isBuffer(bytes) && bytes.length > 0) {
              url =
                (await publishImageBytes(
                  bytes,
                  'image/jpeg',
                  `crm-avatar-${p.lead_id}-${Date.now()}.jpg`
                )) || null
            }
          } catch {
            // No photo, hidden by privacy, or not resolvable: recorded as
            // checked, looked at again in a week.
          }
          if (url) fetched++
          else empty++
          await pool.query(
            `UPDATE crm_people
                SET avatar_url = COALESCE($3, avatar_url),
                    avatar_checked_at = now()
              WHERE owner_id = $1 AND lead_id = $2`,
            [owner, String(p.lead_id), url]
          )
        }
      })
      return { fetched, empty, checked: due.length }
    },
  },
]

/**
 * WHOSE FACE WE ALREADY KNOW, for a batch of leads.
 *
 * The queue's order is what the sweep's step 2 obeys ("take the first whose
 * next is not wait"), and the sweep's first action is a PORTRAIT. A candidate
 * with no face turns that whole sweep into "please send me a photo" -- the
 * weakest card there is, and by the brief's own rule a weak card DISPLACES
 * the next one. So the queue says who has a face and the order uses it.
 *
 * TWO ANSWERS, NEVER THREE. 'yes' when we hold a picture; 'unknown'
 * otherwise -- never 'no'. The cache is filled by the screen's batch and by
 * crm_client_face, so an empty row means nobody has looked yet, not that the
 * person has no photo. Calling that 'no' would push people down the queue for
 * a fact we never checked; the same rule the login reader follows (#2962).
 */
export async function facesKnown(
  pool: { query: (sql: string, p?: unknown[]) => Promise<{ rows: any[] }> },
  owner: string,
  leads: readonly string[]
): Promise<Set<string>> {
  const ids = [...new Set(leads.map(String).filter(Boolean))]
  if (!ids.length) return new Set()
  try {
    const r = await pool.query(
      `SELECT lead_id FROM crm_people
        WHERE owner_id = $1 AND lead_id = ANY($2::text[])
          AND avatar_url IS NOT NULL AND avatar_url <> ''`,
      [String(owner), ids]
    )
    return new Set((r.rows ?? []).map(x => String(x.lead_id)))
  } catch {
    // No column yet, or no table: nobody is known, and nobody is demoted for
    // it -- 'unknown' is the safe answer in both directions.
    return new Set()
  }
}
