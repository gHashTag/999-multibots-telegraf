/**
 * THE FACE, WHERE THE AGENT CAN REACH IT.
 *
 * Owner, 24.09.2026: "why does the agent have no access to the user's avatar?
 * this is the main thing in the CRM -- we hook clients through their face."
 *
 * He is right that it was missing, and the shape of the miss is worth
 * writing down, because every piece looked present. A face was fetched in
 * three places -- the lead magnet, the portrait, the CRM screen -- and not
 * one of them was a TOOL. `crm_client_avatars` exists but is
 * DIRECT_CALL_ONLY: a screen helper the model is forbidden to call, so a
 * batch fills the list behind the owner's own eyes. `crm_client_card` shows
 * `avatar_url` only when that batch had already run.
 *
 * So the agent could DRAW a face and could not LOOK at one. It could not
 * answer "does she have a photo to work from?", could not open a
 * conversation with what it saw, and told people it had nothing when the
 * owner could see their picture in his own chat list. The face was reachable
 * by every path except the one that talks to the person.
 *
 * This is that path: one person, on demand, fetched now.
 *
 * ── WHOSE FACE, AND WHY IT IS NOT AN ARGUMENT ──────────────────────────────
 *
 * In a turn working for a client (`ctx.faceOf`), the target is THAT person
 * and an argument naming somebody else is refused. Two reasons, and both are
 * recorded defects rather than caution:
 *
 *   - the caller's own avatar in a client turn is the OWNER's face, and a
 *     portrait of the owner captioned with the client's name is the defect
 *     the owner stopped work over (client-face.ts);
 *   - the photos come through the owner's Telegram session. A client's
 *     sentence must not be able to name a stranger and receive their face.
 *
 * Outside a client turn the caller may name a lead of their own, or nobody,
 * which means themselves.
 *
 * ── WHAT IS RETURNED ───────────────────────────────────────────────────────
 *
 * A URL on OUR storage, never a Telegram file link: that address carries the
 * bot token, and handing it to an image provider would publish the token.
 * `from` says where it came from, so the agent can be honest about it:
 * 'avatar' is the picture the person chose for themselves, 'sent' a photo
 * they sent that shows exactly one adult face, 'none' means ask them.
 */
import type { AgentTool, ToolContext } from './tools'
import { clientFace } from './client-face'

export interface FaceToolDeps {
  /** A lead's profile photo on our storage; '' when there is none. */
  avatar: (
    ctx: any,
    lead: { id: string; username?: string | null }
  ) => Promise<string>
  /** Photos this person sent this owner, newest first. */
  sentPhotos: (
    ctx: any,
    lead: string
  ) => Promise<Array<{ url: string; transcript: string | null }>>
  /** The caller's own avatar, for a turn about nobody else. */
  ownAvatar: (ctx: any) => Promise<string>
}

/** Remembered on the CRM row so the screen and the next turn need no fetch. */
export const REMEMBER_FACE = `UPDATE crm_people
     SET avatar_url = $3, avatar_checked_at = now()
   WHERE owner_id = $1 AND lead_id = $2`

export const NOT_YOUR_CALL =
  'в разговоре за клиента лицо берётся только его собственное — ' + // cyrillic-ok: tool result copy
  'чужое имя здесь не читается' // cyrillic-ok: tool result copy

export const ASK_FOR_A_PHOTO =
  'у человека нет ни аватарки, ни присланного фото с лицом. ' + // cyrillic-ok: tool result copy
  'Попроси фото одной строкой — рисовать человека не из его лица нельзя' // cyrillic-ok: tool result copy

export function makeClientFaceTool(deps: FaceToolDeps): AgentTool[] {
  return [
    {
      name: 'crm_client_face',
      description:
        'Face to work from: their avatar, else a photo they sent showing one ' +
        'adult face. Returns a URL or none. In a client turn: that client.',
      parameters: {
        type: 'object',
        properties: {
          lead_id: { type: 'string', description: 'Whose. Omit for your own.' },
        },
        additionalProperties: false,
      },
      async handler(args: Record<string, any>, ctx: ToolContext) {
        const asked = String(args.lead_id ?? '').trim()
        const forClient = String((ctx as any).faceOf ?? '').trim()
        if (forClient && asked && asked !== forClient)
          return { has: false, why: NOT_YOUR_CALL }
        const target = forClient || asked
        const owner = String(ctx.telegramId)

        // Nobody named, and no client in the turn: the caller's own face.
        if (!target) {
          const mine = await deps.ownAvatar(ctx).catch(() => '')
          return mine
            ? { has: true, url: mine, from: 'avatar', whose: owner }
            : { has: false, why: ASK_FOR_A_PHOTO, whose: owner }
        }

        /*
         * The @name comes from the CRM row, not from the model. A fresh
         * session knows no entity, and a bare id then fails to resolve for
         * everyone without a username -- but asking the model for it spends
         * schema tokens on a fact we already hold, and invites it to guess
         * one. A row that is missing simply leaves it null.
         */
        let username: string | null = null
        try {
          const r = await ctx.pool.query(
            `SELECT username FROM crm_people WHERE owner_id = $1 AND lead_id = $2`,
            [owner, target]
          )
          username = String(r.rows?.[0]?.username ?? '').trim() || null
        } catch {
          username = null
        }
        /*
         * clientFace, not the avatar helper directly: the rules about WHAT
         * counts as this person's face -- avatar first, a sent photo only
         * when it shows exactly one adult face, a child or an advert never --
         * live there and must not be restated here. A second copy of them is
         * a second place to get them wrong.
         */
        const face = await clientFace(
          ctx,
          { id: target, username },
          { avatar: deps.avatar, sentPhotos: deps.sentPhotos }
        )
        if (!face || 'refused' in face)
          return { has: false, why: ASK_FOR_A_PHOTO, whose: target }

        /*
         * Remembered for the screen and the next turn. Never fatal: a CRM row
         * that is missing, or a column an older database has not grown yet,
         * must not turn a face we are holding into "no face".
         */
        if (face.from === 'avatar') {
          try {
            await ctx.pool.query(REMEMBER_FACE, [owner, target, face.url])
          } catch {
            /* the face stands whether or not the row took it */
          }
        }
        return {
          has: true,
          url: face.url,
          from: face.from,
          whose: target,
          ...(face.ignored ? { ignored: face.ignored } : {}),
        }
      },
    },
  ]
}
