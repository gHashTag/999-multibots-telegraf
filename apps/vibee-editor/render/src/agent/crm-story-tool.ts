/**
 * crm_story_reel -- the CRM's story-reel template, for the seller (owner,
 * 2026-09-26: "create it in the CRM as a template for clients who gave their
 * voice and an avatar photo, for any story").
 *
 * One tool, two uses, the same for the agent and the client's card in the
 * app:
 *   - without `start`: is this client ready (face? voice?), with which
 *     settings, and the last reels made for them;
 *   - `start: true`: a reel on any topic, made in the background
 *     (story-template.ts). It comes to the SELLER to look at first; the
 *     seller forwards it. A client's material never reaches the client unseen
 *     by the person whose name is on it.
 *
 * The avatar is fetched here when the CRM has not looked yet: "a photo from
 * the avatar" is half of what qualifies a client, and an empty cache is not
 * "no photo" (crm-avatars.ts facesKnown).
 *
 * THE SELLER'S OWN SCRIPT AND THE CLIENT'S GROUP (owner, 2026-09-27: "build
 * it into the pipeline, not scripts by hand"). `scenes` / `style` / `cta`
 * make exactly the reel the seller wrote; a client with a bound group
 * (crm_client_group, or `group` here) gets the finished reel as a send card
 * for that group in the seller's bot -- one press (story-card.ts).
 */
import type { AgentTool, ToolContext } from './tools'
import {
  missingFor,
  nextLink,
  peekNextPlanItem,
  startStory,
  storyJobsOf,
  storySettingsOf,
  STORY_TOPIC_MAX,
  storyPriceEstimate,
  type StoryDeps,
} from './story-template'
import { requireSeller } from './telegram-tools'
import { bindClientGroup, clientGroupFor } from './crm-client-group'

export const NOT_THIS_CLIENT =
  'в разговоре за клиента рилс делается только ему самому' // cyrillic-ok: tool result copy

/** An id, or an @name the seller's CRM knows. */
async function leadOf(ctx: ToolContext, raw: unknown): Promise<string | null> {
  const v = String(raw ?? '')
    .trim()
    .replace(/^@/, '')
  if (/^\d{5,15}$/.test(v)) return v
  if (!/^[A-Za-z0-9_]{4,32}$/.test(v)) return null
  try {
    const r = await ctx.pool.query(
      `SELECT lead_id FROM crm_people
        WHERE owner_id = $1 AND lower(username) = lower($2) LIMIT 1`,
      [String(ctx.telegramId), v]
    )
    return r.rows?.[0]?.lead_id ? String(r.rows[0].lead_id) : null
  } catch {
    return null
  }
}

export function makeCrmStoryTool(o: {
  deps: (ctx: ToolContext) => StoryDeps
  lookup: (name: string) => AgentTool | undefined
}): AgentTool {
  return {
    name: 'crm_story_reel',
    description:
      'ШАБЛОН «РИЛС-ИСТОРИЯ» CRM для клиента с лицом (аватарка) и голосом (crm_voice_clone). ' +
      'Без start — готов ли клиент и его последние рилсы. start:true — рилс на ЛЮБУЮ тему (topic; ' +
      'без неё — следующий пункт его контент-плана или свежая тема про его дело): 3 сцены, его лицо ' +
      'в новой обстановке каждая, его голос, пауза с призывом. Свой сценарий — scenes (+style, cta); to — куда. ' +
      'Делается в фоне 5–10 мин; готовый приходит тебе КАРТОЧКОЙ «в группу» или «ему в личку» — ' +
      'одно нажатие; to:none — тебе, переслать самому. Платит тот, кто запустил.',
    parameters: {
      type: 'object',
      properties: {
        lead: { type: 'string', description: 'id или @username клиента' },
        start: { type: 'boolean', description: 'сделать рилс сейчас' },
        topic: {
          type: 'string',
          description: 'тема рилса своими словами; пусто — план или новая',
        },
        about: {
          type: 'string',
          description:
            'чем клиент занимается, если профиля нет (одна строка для сценария)',
        },
        scenes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              setting: { type: 'string', description: 'новая обстановка' },
              line: { type: 'string', description: 'реплика 2–4 с' },
            },
            required: ['setting', 'line'],
          },
          description: 'свой сценарий вместо темы: сцены по порядку',
        },
        style: { type: 'string', description: 'свой свет и тон кадров' },
        cta: { type: 'string', description: 'свой призыв в паузе' },
        to: {
          type: 'string',
          description:
            'куда готовый карточкой: "dm" — ему в личку подарком; chat_id группы из crm_groups (привяжет); "none" — только тебе; пусто — его привязанная группа',
        },
        caption: {
          type: 'string',
          description: 'подпись к рилсу; пусто — готовая',
        },
      },
      required: ['lead'],
      additionalProperties: false,
    },
    async handler(args, ctx) {
      await requireSeller(ctx)
      const lead = await leadOf(ctx, args.lead)
      if (!lead) return { ready: false, why: 'lead: id или @username клиента' }
      const forClient = String((ctx as { faceOf?: string }).faceOf ?? '').trim()
      if (forClient && forClient !== lead)
        return { ready: false, why: NOT_THIS_CLIENT }
      const seller = String(ctx.telegramId)

      let s = await storySettingsOf(ctx.pool, lead, seller)
      if (s && !s.faceUrl) {
        // The CRM has not looked at the avatar yet: look now (it is cached).
        const face = o.lookup('crm_client_face')
        if (face) {
          await face.handler({ lead_id: lead }, ctx).catch(() => null)
          s = await storySettingsOf(ctx.pool, lead, seller)
        }
      }
      const missing = missingFor(s)

      // Where the finished reel is offered: her DM, a group bound here or
      // already, or nowhere but the seller.
      const want = String(args.to ?? '').trim()
      const dm = want === 'dm'
      if (want && want !== 'none' && !dm) {
        try {
          await bindClientGroup(ctx.pool as never, seller, lead, want)
        } catch (e) {
          return {
            ready: false,
            started: false,
            why: String((e as Error)?.message ?? e),
          }
        }
      }
      const group =
        want === 'none' || dm
          ? null
          : await clientGroupFor(ctx.pool as never, seller, lead)
      const deliverTo = dm ? lead : (group?.chat_id ?? null)

      if (args.start !== true) {
        const jobs = await storyJobsOf(ctx.pool, seller, lead).catch(() => [])
        const bot = await o
          .deps(ctx)
          .botOf?.(lead)
          .catch(() => null)
        return {
          ready: !missing,
          ...(missing ? { why: missing } : {}),
          lead,
          ...(s
            ? {
                name: s.name || undefined,
                face: s.faceUrl || undefined,
                voice: s.hasVoice,
                vip: s.vip,
                style: s.style,
                cta: s.cta,
                pause_sec: s.pauseSec,
                client_pays_own_press: s.payer === 'client',
              }
            : {}),
          one_tap_link: nextLink(bot) || undefined,
          group: group
            ? { chat: group.chat_id, title: group.title ?? undefined }
            : undefined,
          jobs,
        }
      }

      if (missing) return { started: false, why: missing }
      const out = await startStory(o.deps(ctx), {
        lead,
        requester: seller,
        seller,
        topic: String(args.topic ?? '').slice(0, STORY_TOPIC_MAX),
        about: String(args.about ?? ''),
        ...(args.scenes !== undefined ? { scenes: args.scenes } : {}),
        style: String(args.style ?? ''),
        cta: String(args.cta ?? ''),
        deliverTo,
        caption: String(args.caption ?? ''),
      })
      return out.started
        ? {
            ...out,
            note: dm
              ? 'рилс делается в фоне 5–10 минут; готовый придёт тебе в бот карточкой «ему в личку» — одно нажатие'
              : group
                ? `рилс делается в фоне 5–10 минут; готовый придёт тебе в бот карточкой «в группу ${group.title ?? group.chat_id}» — одно нажатие`
                : 'рилс делается в фоне 5–10 минут; готовый придёт тебе в бот на проверку',
          }
        : out
    },
  }
}

export const USE_THE_CRM_TOOL =
  'в разговоре за клиента его рилс — crm_story_reel; my_story_reel — только свой' // cyrillic-ok: tool result copy

/**
 * my_story_reel -- the same reel for the person HERSELF (owner, 2026-09-26:
 * "a link into her bot, to a page -- ideally, so she can do the same
 * herself"). The page /story in the app and the agent in her own bot both
 * call it; the reel is hers, paid by her (or by her seller, for a VIP whose
 * profile says so), and comes back to her in her bot.
 *
 * Nothing about anybody else can be named here: the person is the caller,
 * never an argument.
 */
export function makeMyStoryTool(o: {
  deps: (ctx: ToolContext) => StoryDeps
}): AgentTool {
  return {
    name: 'my_story_reel',
    description:
      'ТВОЙ РИЛС-ИСТОРИЯ: твоё лицо (аватарка) в новой обстановке каждой сцены, твой голос (клон), ' +
      '3 сцены ~15 с и пауза с призывом. Без start — готово ли, следующая тема плана, цена и твои рилсы. ' +
      'start:true — сделать на ЛЮБУЮ тему (topic; пусто — следующая из твоего контент-плана). ' +
      'Готовый придёт в бот через 5–10 мин.',
    parameters: {
      type: 'object',
      properties: {
        start: { type: 'boolean', description: 'сделать рилс сейчас' },
        topic: {
          type: 'string',
          description: 'тема своими словами; пусто — следующая из плана',
        },
      },
      additionalProperties: false,
    },
    async handler(args, ctx) {
      const me = String(ctx.telegramId ?? '').trim()
      if (!/^\d{5,15}$/.test(me))
        return { ready: false, why: 'кто ты — неизвестно' }
      if (String((ctx as { faceOf?: string }).faceOf ?? '').trim())
        return { ready: false, why: USE_THE_CRM_TOOL }
      const deps = o.deps(ctx)
      const s = await storySettingsOf(ctx.pool, me)
      const missing = missingFor(s)
      if (args.start === true) {
        if (!s || missing) return { started: false, why: missing }
        const bot = await deps.botOf?.(me).catch(() => null)
        const out = await startStory(deps, {
          lead: me,
          requester: me,
          bot: bot ?? null,
          topic: String(args.topic ?? '').slice(0, STORY_TOPIC_MAX),
        })
        return out.started
          ? { ...out, note: 'рилс делается 5–10 минут; готовый придёт в бот' }
          : out
      }
      const [next, jobs, bot] = await Promise.all([
        s ? peekNextPlanItem(ctx.pool, me, s.done) : Promise.resolve(''),
        s
          ? storyJobsOf(ctx.pool, s.owner, me).catch(() => [])
          : Promise.resolve([]),
        deps.botOf?.(me).catch(() => null) ?? Promise.resolve(null),
      ])
      const gift = s?.payer === 'owner'
      return {
        ready: !missing,
        ...(missing ? { why: missing } : {}),
        ...(s
          ? {
              name: s.name || undefined,
              face: s.faceUrl || undefined,
              voice: s.hasVoice,
              cta: s.cta,
            }
          : {}),
        next_topic: next || undefined,
        ...(gift ? { gift: true } : { price_tokens: storyPriceEstimate() }),
        one_tap_link: nextLink(bot) || undefined,
        jobs,
      }
    },
  }
}
