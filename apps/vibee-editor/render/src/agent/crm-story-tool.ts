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
  storyTopicIdeas,
  keepStoryFace,
  missingFor,
  nextLink,
  peekNextPlanItem,
  startStory,
  storyJobsOf,
  storySettingsOf,
  STORY_SCENES,
  STORY_TOPIC_MAX,
  storyPriceEstimate,
  storyPriceEstimateNotes,
  type StoryDeps,
} from './story-template'
import { voiceMode } from './story-voice-notes'
import {
  END_CARD_PARAM,
  endCardOf,
  endCardProblem,
  endCardUnreadable,
  endCardFix,
  endCardFixBg,
  endCardFixPalette,
  suggestOffered,
  keepEndCard,
  mergeEndCard,
} from './story-reel-tool'
import * as REEL from '../spec/crm-story-reel.gen'
import {
  buttonFrom,
  cardForReel,
  clientLines,
  houseReplacedNote,
  reelCall,
  takenWord,
  templateLines,
  templateOf,
  templatesForPanel,
} from './story-reel-templates'
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
      'ШАБЛОН «РИЛС-ИСТОРИЯ» CRM для клиента с лицом (аватарка) — ЛЮБОЙ говорящий рилс клиента его голосом, ' +
      'не ручная сборка. Голос: его клон (crm_voice_clone), а нет клона — его НАСТОЯЩИЕ голосовые из лички, ' +
      'нарезанные по сценам, липсинк на Kie (его слова, без клона и Replicate). ' +
      'Без start — готов ли клиент и его последние рилсы. start:true — рилс на ЛЮБУЮ тему (topic; ' +
      'без неё — следующий пункт его контент-плана или свежая тема про его дело): 3 сцены, его лицо: ' +
      'первая — его фото как есть, широко, дальше — планы той же студии, новое место — только если его назвали; ' +
      'его голос, пауза с призывом. Свой сценарий — scenes (+style, cta); ' +
      'готовый шаблон — template (+language ru|en; scenes правят его реплики), список — в ответе без start; ' +
      'нет палитры в профиле — end_card (#hex, нечитаемую откажет до траты), ' +
      'save_end_card:true — запомнить её клиенту на следующие рилсы (пустой end_card — снять); to — куда. ' +
      'Делается в фоне 5–10 мин; готовый приходит тебе КАРТОЧКОЙ «в группу» или «ему в личку» — ' +
      'одно нажатие; to:none — тебе, переслать самому. Платит тот, кто запустил.',
    parameters: {
      type: 'object',
      properties: {
        lead: { type: 'string', description: 'id или @username клиента' },
        start: { type: 'boolean', description: 'сделать рилс сейчас' },
        ideas: {
          type: 'boolean',
          description:
            'только темы: до 4 идей из договорённостей и SOUL клиента',
        },
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
              setting: {
                type: 'string',
                description: 'новая обстановка; пусто — кадр студии',
              },
              line: { type: 'string', description: 'реплика 2–4 с' },
            },
            required: ['line'],
          },
          description: 'свой сценарий вместо темы: сцены по порядку',
        },
        scene_count: {
          type: 'number',
          description: 'сколько сцен (кадров) написать: 1–6, по умолчанию 3',
        },
        style: { type: 'string', description: 'свой свет и тон кадров' },
        cta: { type: 'string', description: 'свой призыв в паузе' },
        [REEL.TEMPLATE_ARG]: {
          type: 'string',
          description: `готовый шаблон: ${REEL.TEMPLATE_HOOK_STUDIO} (хук, кадры студии; в конце призыв и кнопка клиента из его профиля, к ${REEL.TEMPLATE_BUTTON} — только на своём рилсе)`,
        },
        [REEL.LANGUAGE_ARG]: {
          type: 'string',
          enum: ['ru', 'en'],
          description: 'язык шаблона',
        },
        [REEL.END_CARD_ARG]: END_CARD_PARAM,
        [REEL.END_CARD_SAVE_ARG]: {
          type: 'boolean',
          description: 'запомнить end_card клиенту для следующих рилсов',
        },
        face_url: {
          type: 'string',
          description:
            'своё фото для рилсов клиента вместо аватарки (https); пустая строка — снова аватарка',
        },
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
      // The house's own reel; any other carries the client's call (spec v22,
      // which supersedes the stopgap of #3553 that refused a client's
      // template press).
      const ownReel = lead === seller

      let s = await storySettingsOf(ctx.pool, lead, seller)
      if (s && !s.faceUrl) {
        // The CRM has not looked at the avatar yet: look now (it is cached).
        const face = o.lookup('crm_client_face')
        if (face) {
          await face.handler({ lead_id: lead }, ctx).catch(() => null)
          s = await storySettingsOf(ctx.pool, lead, seller)
        }
      }
      // The seller's own photo over her avatar, kept for her next reels.
      if (s && typeof args.face_url === 'string') {
        const k = await keepStoryFace(
          ctx.pool as never,
          seller,
          lead,
          args.face_url
        )
        if (k.why) return { ready: false, started: false, why: k.why }
        s = await storySettingsOf(ctx.pool, lead, seller)
      }
      if (args.ideas === true) {
        const ideas = await storyTopicIdeas(
          ctx.pool as never,
          o.deps(ctx).write,
          seller,
          lead,
          s
        ).catch(() => [])
        return { lead, ideas }
      }
      // A seller's reel speaks her clone, or her own voice notes (spec v4).
      const missing = missingFor(s, { notes: true })

      // Where the finished reel is offered: her DM, a group bound here or
      // already, or nowhere but the seller.
      // A duet fixes it in the context (ToolContext.storyTo); the model's
      // `to` counts only where code did not.
      const want = String(ctx.storyTo ?? args.to ?? '').trim()
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

      // HER PALETTE, KEPT (spec v10): save_end_card keeps the checked card
      // for this seller and client, an empty card takes it off; a card that
      // fails the checks keeps nothing and starts nothing.
      let kept = s?.keptCard ?? null
      let keptNote = ''
      if (s && args[REEL.END_CARD_SAVE_ARG] === true) {
        const k = await keepEndCard(
          ctx.pool,
          seller,
          lead,
          args.end_card,
          s.endCard
        )
        if (k.action === REEL.KEEP_REFUSED)
          return {
            ready: false,
            started: false,
            kept: false,
            why: k.why,
            ...(k.fix ? { [REEL.SUGGEST_FIX_ARG]: k.fix } : {}),
            ...(k.fixPalette
              ? { [REEL.SUGGEST_PALETTE_ARG]: k.fixPalette }
              : {}),
            ...(k.fixBg ? { [REEL.SUGGEST_BG_ARG]: k.fixBg } : {}),
          }
        kept = k.kept
        keptNote =
          k.action === REEL.KEEP_CLEAR
            ? 'палитра клиента снята: дальше — визуал профиля или умолчание' // cyrillic-ok: tool result copy
            : 'палитра сохранена клиенту: следующие рилсы заканчиваются в ней без end_card' // cyrillic-ok: tool result copy
      }

      // The palette the reel would end on: the seller's over the kept one
      // over her profile's (spec v7, v10), shown before any start, so a bad
      // one is fixed for free.
      const badColour = endCardProblem(args.end_card)
      const endCard = mergeEndCard(
        cardForReel(endCardOf(args.end_card), ownReel),
        cardForReel(kept, ownReel),
        cardForReel(s?.endCard ?? null, ownReel)
      )
      const unreadable = endCardUnreadable(endCard)
      // The shade of her colour that reads, field by field (spec v12): for a
      // #hex card that does not read -- "black" is only named back.
      const fix = suggestOffered(!badColour, !unreadable)
        ? endCardFix(endCard)
        : null
      // Beside the shade, her own colour and her ground (spec v13).
      const fixPalette = fix ? endCardFixPalette(endCard) : null
      const fixBg = fix ? endCardFixBg(endCard) : null

      if (args.start !== true) {
        const jobs = await storyJobsOf(ctx.pool, seller, lead).catch(() => [])
        const cloneSpeaks =
          !!s &&
          voiceMode(s.hasVoice, o.deps(ctx).voiceDown?.() === true, true) ===
            REEL.VOICE_CLONE
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
                face_custom: s.faceCustom,
                avatar: s.avatarUrl || undefined,
                voice: s.hasVoice,
                // Her clone speaks new lines; without it -- or while its
                // provider refuses (spec v5) -- her own voice notes are
                // lip-synced on Kie: her words, no clone, no Replicate.
                voice_mode: cloneSpeaks ? 'clone' : 'notes',
                price_tokens: cloneSpeaks
                  ? storyPriceEstimate()
                  : storyPriceEstimateNotes(),
                // The price of every count the panel offers, so the figure
                // above the button follows the stepper without a guess.
                scenes: {
                  default: STORY_SCENES,
                  min: REEL.SCENES_MIN,
                  max: REEL.SCENES_MAX,
                  price_tokens: Object.fromEntries(
                    Array.from(
                      { length: REEL.SCENES_MAX - REEL.SCENES_MIN + 1 },
                      (_, i) => {
                        const n = REEL.SCENES_MIN + i
                        return [
                          n,
                          cloneSpeaks
                            ? storyPriceEstimate(n)
                            : storyPriceEstimateNotes(n),
                        ]
                      }
                    )
                  ),
                },
                vip: s.vip,
                style: s.style,
                cta: s.cta,
                pause_sec: s.pauseSec,
                end_card: endCard ?? undefined,
                end_card_kept: kept ?? undefined,
                ...(keptNote ? { end_card_saved: keptNote } : {}),
                ...(badColour || unreadable
                  ? { end_card_why: badColour || unreadable }
                  : {}),
                ...(fix ? { [REEL.SUGGEST_FIX_ARG]: fix } : {}),
                ...(fixPalette
                  ? { [REEL.SUGGEST_PALETTE_ARG]: fixPalette }
                  : {}),
                ...(fixBg ? { [REEL.SUGGEST_BG_ARG]: fixBg } : {}),
                client_pays_own_press: s.payer === 'client',
                // The gallery the panel draws (spec v20, TEMPLATES_FROM_SERVER);
                // a client's is the templates' client versions: no line names
                // the house, the last ends with her call, no house button (v22).
                templates: templatesForPanel(
                  ownReel ? undefined : { call: s.cta }
                ),
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
      /*
       * A TEMPLATE (spec v20): its lines, edited by the seller where he
       * wrote his own, shot in the studio. Its call and its house-bot button
       * only on the house's own reel (spec v22): a client's ends with her
       * call and her button.
       */
      const templateId = String(args[REEL.TEMPLATE_ARG] ?? '').trim()
      const template = templateId
        ? templateOf(templateId, String(args[REEL.LANGUAGE_ARG] ?? ''))
        : undefined
      if (templateId && !template)
        return { started: false, why: `template: нет шаблона «${templateId}»` }
      const lines = template
        ? templateLines(
            template,
            Array.isArray(args.scenes) ? args.scenes : undefined
          )
        : null
      if (typeof lines === 'string') return { started: false, why: lines }
      /*
       * A CLIENT'S REEL CARRIES HER CALL (spec v22, call_from, button_from):
       * the seller's word for her, else her own; a word naming the house is
       * replaced by hers, and the answer says so in one line. An empty call
       * is kept empty: the job takes hers from her profile when it runs.
       */
      const call = reelCall({
        given: args.cta,
        templateCall: template?.call,
        ownReel,
        ownCall: s?.cta ?? '',
      })
      const raw = args.end_card
      const isCard = !!raw && typeof raw === 'object' && !Array.isArray(raw)
      const button = takenWord(
        isCard ? (raw as Record<string, unknown>).button : '',
        ownReel
      )
      const way = buttonFrom(
        !!button.word,
        !!template,
        ownReel,
        !!kept?.button,
        !!s?.endCard?.button
      )
      const jobButton =
        way === REEL.FIELD_FROM_SELLER
          ? button.word
          : way === REEL.FIELD_FROM_TEMPLATE
            ? String(template?.button ?? '')
            : ''
      const rest: Record<string, unknown> = isCard
        ? { ...(raw as Record<string, unknown>) }
        : {}
      delete rest.button
      const jobCard =
        isCard || jobButton
          ? { ...rest, ...(jobButton ? { button: jobButton } : {}) }
          : raw
      /*
       * EVERY LINE OF A CLIENT'S REEL, READ (spec v22, line_way): a template's
       * line is its client version, the first as much as the last; a line the
       * seller or the agent wrote naming the house is refused here, before
       * anything is spent -- unless the person typed it herself this turn.
       * A script with no template is read the same way by startStory.
       */
      const spoken =
        template && lines && !ownReel
          ? clientLines(template, lines, call.call, ctx.ownerSaid)
          : null
      if (spoken?.refused) return { started: false, why: spoken.refused }
      const replaced = houseReplacedNote(
        [
          call.replaced,
          button.replaced ? String((raw as { button?: unknown }).button) : '',
        ],
        call.call
      )
      const said = spoken ? spoken.lines : lines
      const out = await startStory(o.deps(ctx), {
        lead,
        requester: seller,
        seller,
        topic: String(args.topic || (said ? said[0] : '')).slice(
          0,
          STORY_TOPIC_MAX
        ),
        about: String(args.about ?? ''),
        ...(said
          ? { scenes: said.map(line => ({ setting: '', line })) }
          : args.scenes !== undefined
            ? { scenes: args.scenes }
            : {}),
        ...(args.scene_count !== undefined
          ? { sceneCount: Number(args.scene_count) }
          : {}),
        style: String(args.style ?? ''),
        cta: call.from === REEL.CALL_FROM_PROFILE ? '' : call.call,
        ...(jobCard !== undefined ? { endCard: jobCard } : {}),
        deliverTo,
        caption: String(args.caption ?? ''),
        personSaid: ctx.ownerSaid,
      })
      return out.started
        ? {
            ...out,
            ...(keptNote ? { end_card_saved: keptNote } : {}),
            ...(replaced ? { house_replaced: replaced } : {}),
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
      'ТВОЙ РИЛС-ИСТОРИЯ: твоё лицо (аватарка) — первый кадр твоё фото как есть, широко, дальше планы той же студии, ' +
      'новое место — только если ты его назвал; твой голос (клон), ' +
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
        face_url: {
          type: 'string',
          description:
            'своё фото для рилсов вместо аватарки (https); пустая строка — снова аватарка',
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
      let s = await storySettingsOf(ctx.pool, me)
      // Her own photo over her avatar, kept with the seller whose template it is.
      if (s && typeof args.face_url === 'string') {
        const k = await keepStoryFace(
          ctx.pool as never,
          s.owner,
          me,
          args.face_url
        )
        if (k.why) return { ready: false, started: false, why: k.why }
        s = await storySettingsOf(ctx.pool, me, s.owner)
      }
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
              face_custom: s.faceCustom,
              avatar: s.avatarUrl || undefined,
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
