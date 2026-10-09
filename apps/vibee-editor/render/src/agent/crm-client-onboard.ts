/**
 * ONE CALL PUTS A CLIENT ON BOARD (spec crm-client-onboard.t27).
 *
 * Owner, 2026-10-09, a client thread in the mini app: "fill the client's SOUL
 * in her profile". crm_client_setup is the platform owner's installer and
 * refused the seller in 1 ms with the Telegram-reader gate's text, so the
 * agent told the seller the CLIENT was the platform owner; the thread named
 * the client by name only, so the agent asked for her telegram_id; and
 * skills_create filed four "client" skills in the seller's own account.
 *
 * This is the seller's door: the thread's client by default, the dossier
 * (profile fields, SOUL, skills) in the seller's own profile row for that
 * person (crm_client_profiles, keyed by owner and client -- nothing in the
 * client's account), and the next missing step named in the answer.
 */
import type { AgentTool, ToolContext } from './tools'
import * as SPEC from '../spec/crm-client-onboard.gen'
import {
  dossierFits,
  intoClientAccount,
  leadFrom,
  mayOnboard,
  nextStep,
} from '../spec/crm-client-onboard.logic'
import { ensureProfileTable, NO_ID_REASON } from './crm-client-setup-tool'
import { isPlatformOwner, isSeller } from './telegram-tools'
import { ownsLead } from './crm-reach'

export const NOT_YOUR_LEAD =
  'Этого человека нет в вашей переписке: досье клиента ставит продавец, у которого он в CRM.' // cyrillic-ok: tool result copy

export const TOO_BIG =
  `Досье не помещается: SOUL до ${SPEC.SOUL_MAX_CHARS} знаков, ` + // cyrillic-ok: tool result copy
  `скиллов до ${SPEC.SKILLS_MAX}, каждый до ${SPEC.SKILL_MAX_CHARS} знаков.` // cyrillic-ok: tool result copy

/** What to do after each step is missing, in STEPS order; the last is "all done". */
export const NEXT_STEP_SAID = [
  'профиль: имя и дело клиента', // cyrillic-ok: tool result copy
  'SOUL клиента: кто он, как говорит, чего избегать — по переписке', // cyrillic-ok: tool result copy
  'скиллы клиента: темы и правила работы с ним', // cyrillic-ok: tool result copy
  'лицо: crm_client_face (аватарка или его фото с лицом)', // cyrillic-ok: tool result copy
  'всё на месте — дальше портрет-подарок (crm_deliver_photo), афиша 9:16 (image_edit), рилс (crm_story_reel)', // cyrillic-ok: tool result copy
]

type Skill = { name: string; content: string }

function skillsOf(v: unknown): Skill[] | null {
  if (v == null) return []
  if (!Array.isArray(v)) return null
  const out: Skill[] = []
  for (const s of v) {
    const name = String(s?.name ?? '').trim()
    const content = String(s?.content ?? '').trim()
    if (!name || !content) return null
    out.push({ name, content })
  }
  return out
}

export const CRM_ONBOARD_TOOLS: AgentTool[] = [
  {
    name: SPEC.TOOL,
    description:
      'Поставить клиента в CRM одним вызовом: профиль (имя, дело), его SOUL и скиллы — в ваше досье о нём. ' + // cyrillic-ok: tool description
      'В разговоре о клиенте telegram_id не нужен. Отвечает, какой шаг дальше. ' + // cyrillic-ok: tool description
      'skills_create и soul_edit пишут ВАШИ собственные, не клиента.', // cyrillic-ok: tool description
    parameters: {
      type: 'object',
      properties: {
        telegram_id: {
          type: 'string',
          description: 'чей; в разговоре о клиенте — не указывать', // cyrillic-ok: tool description
        },
        name: { type: 'string', description: 'как зовут' }, // cyrillic-ok: tool description
        business: { type: 'string', description: 'чем занимается' }, // cyrillic-ok: tool description
        soul: {
          type: 'string',
          description: 'SOUL клиента: кто он, тон, чего избегать', // cyrillic-ok: tool description
        },
        skills: {
          type: 'array',
          description: 'скиллы клиента', // cyrillic-ok: tool description
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              content: { type: 'string' },
            },
            required: ['name', 'content'],
          },
        },
      },
      additionalProperties: false,
    },
    async handler(args: Record<string, any>, ctx?: ToolContext) {
      if (!ctx) throw new Error('no context')
      const named = String(args.telegram_id ?? '').trim()
      const thread = String(ctx.faceOf ?? '').trim()
      const source = leadFrom(named !== '', thread !== '')
      const lead = source === 1 ? named : source === 2 ? thread : ''
      if (!lead) return { done: false, reason: NO_ID_REASON }
      if (!/^\d{5,20}$/.test(lead))
        return { done: false, reason: 'telegram_id должен быть числом' } // cyrillic-ok: tool result copy

      const owner = String(ctx.telegramId)
      const platformOwner = isPlatformOwner(owner)
      const seller = await isSeller(ctx)
      const owns = await ownsLead(ctx, lead)
      if (!mayOnboard(platformOwner, seller, owns))
        return { done: false, reason: NOT_YOUR_LEAD }

      const soul = args.soul == null ? null : String(args.soul).trim()
      const skills = skillsOf(args.skills)
      if (skills === null) return { done: false, reason: TOO_BIG }
      const longest = Math.max(0, ...skills.map(s => s.content.length))
      if (
        skills.length > 255 ||
        !dossierFits(soul?.length ?? 0, skills.length, longest)
      )
        return { done: false, reason: TOO_BIG }

      await ensureProfileTable(ctx)
      const had = await ctx.pool.query(
        `SELECT client, profile FROM crm_client_profiles
          WHERE owner_id = $1 AND telegram_id = $2`,
        [owner, lead]
      )
      const old = (had.rows[0]?.profile ?? {}) as Record<string, unknown>
      const profile: Record<string, unknown> = { ...old }
      if (args.name) profile.name = String(args.name).trim()
      if (args.business) profile.business = String(args.business).trim()
      if (soul) profile.soul = soul
      if (skills.length) {
        const byName = new Map<string, Skill>(
          (Array.isArray(old.skills) ? (old.skills as Skill[]) : []).map(s => [
            s.name,
            s,
          ])
        )
        for (const s of skills) byName.set(s.name, s)
        profile.skills = [...byName.values()].slice(0, SPEC.SKILLS_MAX)
      }
      const client = String(had.rows[0]?.client ?? '') || `lead-${lead}`
      await ctx.pool.query(
        `INSERT INTO crm_client_profiles (telegram_id, owner_id, client, profile, updated_at)
         VALUES ($1, $2, $3, $4::jsonb, now())
         ON CONFLICT (owner_id, telegram_id) DO UPDATE
           SET profile = $4::jsonb, updated_at = now()`,
        [lead, owner, client, JSON.stringify(profile)]
      )

      const face = await ctx.pool
        .query(
          `SELECT avatar_url FROM crm_people WHERE owner_id = $1 AND lead_id = $2`,
          [owner, lead]
        )
        .then(r => Boolean(String(r.rows[0]?.avatar_url ?? '').trim()))
        .catch(() => false)
      const step = nextStep(
        Boolean(profile.name || profile.business),
        Boolean(profile.soul),
        Array.isArray(profile.skills) && profile.skills.length > 0,
        face
      )
      const connected = await isSeller({ ...ctx, telegramId: lead })
      return {
        done: true,
        telegram_id: lead,
        saved: {
          soul: Boolean(soul),
          skills: skills.map(s => s.name),
          name: profile.name ?? null,
        },
        next: NEXT_STEP_SAID[step],
        ...(intoClientAccount(platformOwner, connected)
          ? {
              note: 'Клиент подключён: в его собственный аккаунт SOUL ставит crm_client_setup.', // cyrillic-ok: tool result copy
            }
          : {}),
      }
    },
  },
]
