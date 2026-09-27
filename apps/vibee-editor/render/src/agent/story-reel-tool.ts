/**
 * story_reel -- the story reel as ONE call (owner, 2026-09-26: "save the
 * template for constant work; only add a pause at the end for the CTA").
 *
 * The owner's format, proven twice that day (the owner's own launch reel and
 * a florist client's gift reel): one face, three scenes in one style and a
 * NEW setting each, one short line per scene in a real voice, a lip-sync per
 * scene, the Remotion StoryReel template -- hard cuts, a breath between
 * lines, and at the end the last frame held for a pause while the call to
 * action stands on screen.
 *
 * Before this tool the chain was eight separate calls, which is the agent's
 * whole step budget, and each long call died on the next redeploy of the
 * render (other sessions merge every 10-15 minutes). Here the chain runs
 * inside one call, in parallel where it can:
 *
 *   stills  -- image_edit per scene, all at once, from the one source photo
 *   voices  -- audio_generate per line (for_lead: the client's own clone)
 *   clips   -- lipsync_generate per scene
 *   reel    -- reel_render StoryReel {scenes, pauseSec, breathSec, cta}
 *
 * RESUMABLE, NOT REPAID. Every answer carries the stills and clips made so
 * far. A call cut by a redeploy, or a still that is still drawing, comes back
 * with them, and the next call passes them in (`stills`, `clips`): the parts
 * already paid for are never made twice.
 *
 * A STILL THAT IS STILL DRAWING IS PAID ONCE (spec v3). It has no URL yet, so
 * `stills` cannot carry it: until 2026-09-27 the next call ordered it again
 * and paid again -- after a redeploy during the wait (the id died with the
 * process) and after any still slower than STILL_WAIT_MS. Now a story job
 * keeps the provider's task id on its row the moment the task is accepted
 * (ctx.storyStillTasks, set only by code), and a resume ASKS about that task
 * (stillResume): take the picture, wait for it, or -- refused, or silent past
 * STILL_GIVE_UP_MS -- give its charge back once and draw anew.
 *
 * Each borrowed tool charges for itself exactly as when called alone (the
 * house pays nothing), so this file holds no prices of its own.
 */
import type { AgentTool, ToolContext } from './tools'
import type { LateOutcome } from './late-picture'
// The numbers are the spec's: gHashTag/t27 specs/automation/crm-story-reel.t27,
// vendored with its `t27c gen-ts` output (see story-template.ts).
import * as SPEC from '../spec/crm-story-reel.gen'

/** Scenes a story holds: the owner's form is three. */
export const STORY_SCENES_MIN = SPEC.SCENES_MIN
export const STORY_SCENES_MAX = SPEC.SCENES_MAX
/** The pause for the call to action, seconds (StoryReel's own default). */
export const STORY_PAUSE_SEC = SPEC.PAUSE_SEC
/** The quiet between two scenes, seconds. */
export const STORY_BREATH_SEC = SPEC.BREATH_MS / 1000

/** The pause the template renders, whatever was asked (spec: pause_of). */
export function pauseOf(asked: unknown): number {
  // Not given is the default; a number given, zero included, is clamped.
  if (asked === undefined || asked === null || asked === '')
    return STORY_PAUSE_SEC
  const n = Number(asked)
  if (!Number.isFinite(n)) return STORY_PAUSE_SEC
  return Math.min(SPEC.PAUSE_SEC_MAX, Math.max(SPEC.PAUSE_SEC_MIN, n))
}
/**
 * How long a still may draw inside this call. image_edit alone waits about
 * three minutes; measured 2026-09-26, two stills of a client took just over
 * three and arrived in "my files" twenty seconds after the tool had given up.
 */
export const STORY_STILL_WAIT_MS = SPEC.STILL_WAIT_MS

/** A still ordered, paid for, and not drawn yet: the provider's task. */
export interface StillTask {
  task: string
  /** When the provider accepted it, ms since the epoch. */
  at: number
  /** What its charge took; the refund gives back exactly this, never a table price. */
  charged?: number
  /** The op it was charged under. */
  op?: string
}

/**
 * What a resume does with a still whose task is known (spec: still_resume):
 * RESUME_USE the picture, RESUME_WAIT for it, or RESUME_REDRAW -- its charge
 * back once, then draw anew.
 */
export function stillResume(
  ready: boolean,
  refused: boolean,
  ageMs: number
): number {
  if (ready) return SPEC.RESUME_USE
  if (refused) return SPEC.RESUME_REDRAW
  if (ageMs >= SPEC.STILL_GIVE_UP_MS) return SPEC.RESUME_REDRAW
  return SPEC.RESUME_WAIT
}

/** The still tasks a job's row holds, one per scene; junk is dropped. */
export function stillTasksOf(raw: unknown, n: number): (StillTask | null)[] {
  let v = raw
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v)
    } catch {
      v = []
    }
  }
  const list = Array.isArray(v) ? v : []
  return Array.from({ length: n }, (_, i) => {
    const t = list[i] as Partial<StillTask> | null | undefined
    const task = String(t?.task ?? '').trim()
    const at = Number(t?.at)
    if (!/^[\w-]{1,128}$/.test(task) || !Number.isFinite(at) || at <= 0)
      return null
    const charged = Number(t?.charged)
    return {
      task,
      at,
      ...(Number.isFinite(charged) && charged > 0 ? { charged } : {}),
      ...(t?.op ? { op: String(t.op) } : {}),
    }
  })
}

/** How the tool asks about a still task and gives its charge back. */
export interface StoryLate {
  /** One question about a task: never creates or charges anything. */
  look: (taskId: string, ctx: ToolContext) => Promise<LateOutcome>
  /** Give a still's charge back, at most once per task. */
  refund: (t: StillTask, ctx: ToolContext, why: string) => Promise<void>
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

export const KEEP_THE_PERSON =
  'Keep the person EXACTLY as in the source photo -- the same face, features, hair, age and outfit; ' +
  'change ONLY the setting around them, and never keep the plain background of the source photo.'

export interface StoryScene {
  setting: string
  line: string
}

/** The prompt of one scene's still: the setting, the one style, the person kept. */
export function stillPrompt(setting: string, style: string): string {
  return [
    `Setting: ${setting.trim()}.`,
    KEEP_THE_PERSON,
    style.trim(),
    'Vertical 9:16, no text, no letters, no logos.',
  ]
    .filter(Boolean)
    .join(' ')
}

/** The scenes as given, checked: 1..4, each with a setting and a line. */
export function scenesOf(raw: unknown): StoryScene[] | string {
  if (!Array.isArray(raw)) return 'scenes: список сцен {setting, line}'
  if (raw.length < STORY_SCENES_MIN || raw.length > STORY_SCENES_MAX)
    return `scenes: от ${STORY_SCENES_MIN} до ${STORY_SCENES_MAX} сцен`
  const out: StoryScene[] = []
  for (const [i, s] of raw.entries()) {
    const setting = String((s as StoryScene)?.setting ?? '').trim()
    const line = String((s as StoryScene)?.line ?? '').trim()
    if (!setting || !line)
      return `scenes.${i}: нужны и setting (обстановка), и line (реплика)`
    out.push({ setting, line })
  }
  return out
}

export interface StoryEndCard {
  bg?: string
  title?: string
  text?: string
  accent?: string
  button?: string
}

/*
 * A COLOUR IS #HEX THAT CSS READS (spec v7, hex_digits_ok): #rgb, #rgba,
 * #rrggbb, #rrggbbaa. v6 took 5 and 7 digits too, and CSS drops those
 * without a word -- the card rendered in its defaults.
 */
export function hexDigitsOk(n: number): boolean {
  return n === 3 || n === 4 || n === 6 || n === 8
}
const HEX_BODY = /^#[0-9a-fA-F]+$/
const hex = (v: unknown): string | undefined => {
  const t = String(v ?? '').trim()
  return HEX_BODY.test(t) && hexDigitsOk(t.length - 1) ? t : undefined
}
const COLOURS = ['bg', 'title', 'text', 'accent'] as const

/**
 * The end card as given, checked: colours are #hex or dropped, the button
 * line is short. Nothing usable -- no card, and the reel ends as before.
 */
export function endCardOf(raw: unknown): StoryEndCard | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const button = String(r.button ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SPEC.END_CARD_BUTTON_MAX)
  const card: StoryEndCard = {}
  for (const k of COLOURS) {
    const c = hex(r[k])
    if (c) card[k] = c
  }
  if (button) card.button = button
  return Object.keys(card).length ? card : null
}

/**
 * What is wrong with a card the SELLER gave, in words he can act on; '' when
 * nothing is (spec v7, SELLER_BAD_COLOUR_REFUSED). "black" used to be dropped
 * in silence and the reel ended in the default gold on black.
 */
export function endCardProblem(raw: unknown): string {
  if (raw === undefined || raw === null) return ''
  if (typeof raw !== 'object' || Array.isArray(raw))
    return 'end_card: объект {bg, title, text, accent, button}'
  const r = raw as Record<string, unknown>
  for (const k of COLOURS) {
    if (r[k] === undefined || r[k] === null || r[k] === '') continue
    if (!hex(r[k]))
      return `end_card.${k}: «${String(r[k]).slice(0, 20)}» — нужен цвет #hex: #rgb или #rrggbb, например #1a1a1a`
  }
  return ''
}

/**
 * Where one end-card colour comes from (spec v10, end_card_field): the
 * seller's word for this reel, the palette kept for her, her profile, the
 * default.
 */
export function endCardField(
  sellerGave: boolean,
  keptHas: boolean,
  profileHas: boolean
): number {
  if (sellerGave) return SPEC.FIELD_FROM_SELLER
  if (keptHas) return SPEC.FIELD_FROM_KEPT
  if (profileHas) return SPEC.FIELD_FROM_PROFILE
  return SPEC.FIELD_FROM_DEFAULT
}

/**
 * The seller's card over the kept one over her profile's, field by field
 * (spec v7, v10). Null when none gives anything: the reel then ends on its
 * held last frame.
 */
export function mergeEndCard(
  seller: StoryEndCard | null,
  kept: StoryEndCard | null,
  profile: StoryEndCard | null
): StoryEndCard | null {
  const out: StoryEndCard = {}
  const from = {
    [SPEC.FIELD_FROM_SELLER]: seller,
    [SPEC.FIELD_FROM_KEPT]: kept,
    [SPEC.FIELD_FROM_PROFILE]: profile,
  } as Record<number, StoryEndCard | null>
  for (const k of [...COLOURS, 'button'] as const) {
    const v =
      from[endCardField(!!seller?.[k], !!kept?.[k], !!profile?.[k])]?.[k]
    if (v) out[k] = v
  }
  return Object.keys(out).length ? out : null
}

/*
 * HER PALETTE, KEPT (spec v10). v7 took the seller's end_card for one reel;
 * the next one ended in the defaults unless he said it again. It is kept per
 * seller and client in its own table -- NOT in her profile's story_reel
 * block, which is what turns her own paid presses on (story-template.ts
 * sellerOf finds her seller by it).
 */
export async function ensureKeptEndCards(pool: {
  query: (sql: string, params?: unknown[]) => Promise<any>
}): Promise<void> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS story_end_cards (
       owner_id   text NOT NULL,
       lead_id    text NOT NULL,
       end_card   jsonb NOT NULL,
       updated_at timestamptz NOT NULL DEFAULT now(),
       PRIMARY KEY (owner_id, lead_id)
     )`
  )
}

/** The palette kept for this seller and client, or null. */
export async function keptEndCardOf(
  pool: { query: (sql: string, params?: unknown[]) => Promise<any> },
  owner: string,
  lead: string
): Promise<StoryEndCard | null> {
  try {
    const r = await pool.query(
      `SELECT end_card FROM story_end_cards WHERE owner_id = $1 AND lead_id = $2`,
      [String(owner), String(lead)]
    )
    const raw = r?.rows?.[0]?.end_card
    return endCardOf(typeof raw === 'string' ? JSON.parse(raw) : raw)
  } catch {
    return null // no table yet: nothing was kept
  }
}

/** The spec's keep_action. */
export function keepAction(
  saveAsked: boolean,
  cardGiven: boolean,
  cardOk: boolean
): number {
  if (!saveAsked) return SPEC.KEEP_NONE
  if (!cardGiven) return SPEC.KEEP_CLEAR
  if (cardOk) return SPEC.KEEP_SAVE
  return SPEC.KEEP_REFUSED
}

/**
 * Keep or clear her palette for this seller (spec v10). The card is checked
 * as a start checks it -- #hex, then contrast over her profile's own card --
 * and a card that fails is refused in words with nothing kept.
 */
export async function keepEndCard(
  pool: { query: (sql: string, params?: unknown[]) => Promise<any> },
  owner: string,
  lead: string,
  raw: unknown,
  profile: StoryEndCard | null
): Promise<{ kept: StoryEndCard | null; action: number; why?: string }> {
  const given =
    !!raw &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    Object.values(raw as Record<string, unknown>).some(
      v => v !== undefined && v !== null && String(v).trim() !== ''
    )
  const card = given ? endCardOf(raw) : null
  const why = given
    ? endCardProblem(raw) ||
      (card ? endCardUnreadable(mergeEndCard(card, null, profile)) : '') ||
      (card ? '' : 'end_card: ни одного цвета #hex и ни строки кнопки')
    : ''
  const action = keepAction(true, given, given && !why)
  if (action === SPEC.KEEP_REFUSED) return { kept: null, action, why }
  await ensureKeptEndCards(pool)
  if (action === SPEC.KEEP_CLEAR) {
    await pool.query(
      `DELETE FROM story_end_cards WHERE owner_id = $1 AND lead_id = $2`,
      [String(owner), String(lead)]
    )
    return { kept: null, action }
  }
  await pool.query(
    `INSERT INTO story_end_cards (owner_id, lead_id, end_card, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (owner_id, lead_id)
       DO UPDATE SET end_card = EXCLUDED.end_card, updated_at = now()`,
    [String(owner), String(lead), JSON.stringify(card)]
  )
  return { kept: card, action }
}

const rgbOf = (c: string): [number, number, number] => {
  const h = c.slice(1)
  const full =
    h.length <= 4
      ? h
          .slice(0, 3)
          .split('')
          .map(x => x + x)
          .join('')
      : h.slice(0, 6)
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ]
}
const luminance = (c: string): number => {
  const [r, g, b] = rgbOf(c).map(v => {
    const x = v / 255
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * WCAG contrast of two #hex colours, times ten and rounded down, so 4.49:1
 * is 44 and reads as unreadable. Alpha is ignored: the card is flat.
 */
export function contrastX10(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return Math.floor(((hi + 0.05) / (lo + 0.05)) * 10 + 1e-9)
}

/** The spec's end_card_readable. */
export function endCardReadable(x10: number): boolean {
  return x10 >= SPEC.END_CARD_CONTRAST_MIN_X10
}

/** The spec's end_card_refused: only the seller's own palette stops a reel. */
export function endCardRefused(
  sellerGave: boolean,
  readable: boolean
): boolean {
  if (readable) return false
  return sellerGave
    ? SPEC.SELLER_PALETTE_UNREADABLE_REFUSED
    : SPEC.PROFILE_PALETTE_UNREADABLE_REFUSED
}

const ratio = (x10: number) => (x10 / 10).toFixed(1).replace('.', ',')

/**
 * Whether the call and the button read on the card as it will render (the
 * composition's defaults fill what the card leaves out); '' when they do,
 * else what does not, in words.
 */
export function endCardUnreadable(card: StoryEndCard | null): string {
  if (!card) return ''
  const bg = card.bg ?? SPEC.END_CARD_DEFAULT_BG
  const pairs: Array<[string, string]> = [
    ['призыв', card.title ?? SPEC.END_CARD_DEFAULT_TITLE],
    ...(card.button
      ? [
          ['строка кнопки', card.accent ?? SPEC.END_CARD_DEFAULT_ACCENT] as [
            string,
            string,
          ],
        ]
      : []),
  ]
  for (const [what, colour] of pairs) {
    const x10 = contrastX10(colour, bg)
    if (!endCardReadable(x10))
      return `${what} цветом ${colour} на фоне ${bg} читается плохо: контраст ${ratio(x10)}:1, нужно не меньше ${ratio(SPEC.END_CARD_CONTRAST_MIN_X10)}:1`
  }
  return ''
}

/**
 * The client's own visual as an end card, from her profile: `visual` (or
 * `visual_tokens`) for the colours, `approved_cta` for the button line.
 * A profile without a visual has no card; a colour that is not #hex is
 * dropped there (spec v7, PROFILE_BAD_COLOUR_DROPPED), not refused.
 */
export function endCardFromProfile(profile: any): StoryEndCard | null {
  const v = profile?.visual ?? profile?.visual_tokens
  if (!v || typeof v !== 'object') return null
  const cta = profile?.approved_cta
  const button =
    cta && typeof cta === 'object'
      ? [cta.button, cta.bot].filter(Boolean).map(String).join(' · ')
      : ''
  return endCardOf({
    bg: hex(v.bg) ?? hex(v.surface),
    title: hex(v.gold_title) ?? hex(v.title) ?? hex(v.win),
    text: hex(v.text),
    accent: hex(v.accent_cta) ?? hex(v.accent),
    button,
  })
}

/** The end_card parameter, one schema for story_reel and crm_story_reel. */
export const END_CARD_PARAM = {
  type: 'object',
  description:
    'финал в визуале клиента вместо стоп-кадра: bg, title (призыв), text, accent (кнопка) — #hex; button — строка кнопки',
  properties: {
    bg: { type: 'string' },
    title: { type: 'string' },
    text: { type: 'string' },
    accent: { type: 'string' },
    button: { type: 'string' },
  },
  additionalProperties: false,
} as const

/** A list the caller passed back, kept only where it matches the scenes. */
function carried(raw: unknown, n: number): string[] {
  const list = Array.isArray(raw) ? raw.map(x => String(x ?? '').trim()) : []
  return Array.from({ length: n }, (_, i) =>
    /^https?:\/\//.test(list[i] ?? '') ? list[i] : ''
  )
}

type Tool = AgentTool | undefined

/** A borrowed tool's answer, read the same whichever language it answers in. */
function outcome(v: any): {
  ok: boolean
  url: string
  why: string
  pending: boolean
  taskId: string
  charged: number
  seconds: number
  voice: string
} {
  const ok =
    v?.done === true || v?.['сделано'] === true || v?.['готово'] === true
  return {
    ok,
    url: String(v?.url ?? ''),
    why: String(v?.reason ?? v?.['причина'] ?? v?.error ?? ''),
    pending: v?.pending === true,
    taskId: String(v?.taskId ?? ''),
    charged: Number(v?.charged) || 0,
    seconds: Number(v?.seconds) || 0,
    voice: String(v?.['голос'] ?? ''),
  }
}

export function makeStoryReelTool(
  lookup: (name: string) => Tool,
  late?: StoryLate
): AgentTool {
  const now = late?.now ?? Date.now
  const sleep =
    late?.sleep ?? ((ms: number) => new Promise(r => setTimeout(r, ms)))
  return {
    name: 'story_reel',
    description:
      'РИЛС-ИСТОРИЯ ОДНИМ ВЫЗОВОМ (шаблон StoryReel): одно фото с лицом → 1–4 сцены в ОДНОМ стиле и НОВОЙ ' +
      'обстановке каждая → реплика на сцену голосом (for_lead — голос клиента из crm_voice_clone; без него — ' +
      'клон владельца) → липсинк → сборка: склейки, вдох между репликами и в конце ПАУЗА с призывом cta. ' +
      'Реплики по 2–4 с, весь ролик с паузой до 15 с. Если вернулись stills/clips без видео — повтори с ними: ' +
      'готовое не делается и не оплачивается второй раз.',
    parameters: {
      type: 'object',
      properties: {
        image_url: {
          type: 'string',
          description:
            'фото с лицом на нашей полке: эталон владельца или crm_client_face клиента',
        },
        scenes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              setting: {
                type: 'string',
                description: 'новая обстановка сцены',
              },
              line: {
                type: 'string',
                description:
                  'реплика 2–4 с, названия словами (бот — «Тринити»)',
              },
            },
            required: ['setting', 'line'],
          },
          description: 'сцены по порядку; последняя реплика — призыв',
        },
        style: {
          type: 'string',
          description: 'один стиль на все кадры (свет, тона, канон бренда)',
        },
        for_lead: {
          type: 'string',
          description: 'id клиента: говорить ЕГО голосом (crm_voice_clone)',
        },
        cta: { type: 'string', description: 'надпись в паузе в конце' },
        [SPEC.END_CARD_ARG]: END_CARD_PARAM,
        pause_sec: {
          type: 'number',
          description: `пауза с призывом в конце, 1–4 с (по умолчанию ${STORY_PAUSE_SEC})`,
        },
        stills: {
          type: 'array',
          items: { type: 'string' },
          description:
            'уже готовые кадры (из прошлого ответа) — не рисовать заново',
        },
        clips: {
          type: 'array',
          items: { type: 'string' },
          description:
            'уже готовые липсинки (из прошлого ответа) — не делать заново',
        },
      },
      required: ['image_url', 'scenes'],
      additionalProperties: false,
    },
    async handler(args, ctx) {
      const scenes = scenesOf(args.scenes)
      if (typeof scenes === 'string') return { done: false, reason: scenes }
      const source = String(args.image_url ?? '').trim()
      if (!/^https?:\/\//.test(source))
        return { done: false, reason: 'image_url: ссылка на фото с лицом' }
      const style = String(args.style ?? '')
      const n = scenes.length
      const pause = pauseOf(args.pause_sec)
      const endCard = endCardOf(args.end_card)
      const stills = carried(args.stills, n)
      const clips = carried(args.clips, n)
      // Only the job's row names a task (spec: STILL_TASK_FROM_MODEL false).
      const tasks = stillTasksOf(ctx.storyStillTasks ?? [], n)
      const progress = () =>
        ctx
          .storyProgress?.({ stills, clips, stillTasks: tasks })
          .catch(() => undefined)
      const sofar = () => ({
        stills,
        clips,
        ...(tasks.some(Boolean) ? { still_tasks: tasks } : {}),
        how_to_continue:
          'повтори story_reel с теми же scenes и этими stills и clips: готовое не делается заново',
      })

      /*
       * A still whose task is known: ask, within the same wait a new still
       * gets, and never order it again while it can still come.
       */
      const settle = async (
        t: StillTask
      ): Promise<{ act: number; url: string; why: string }> => {
        // No way to ask is no way to give back either: drawing anew would
        // be the second charge this exists to prevent. Wait.
        if (!late)
          return { act: SPEC.RESUME_WAIT, url: '', why: 'не у кого спросить' }
        const until = now() + STORY_STILL_WAIT_MS
        for (;;) {
          const out: LateOutcome = await late.look(t.task, ctx).catch(
            (e): LateOutcome => ({
              state: 'unknown',
              taskId: t.task,
              reason: String(e),
            })
          )
          const act = stillResume(
            out.state === 'ready',
            out.state === 'failed',
            now() - t.at
          )
          if (act !== SPEC.RESUME_WAIT || now() >= until)
            return {
              act,
              url: out.state === 'ready' ? out.url : '',
              why:
                out.state === 'failed'
                  ? `провайдер отказал: ${out.reason}`
                  : 'провайдер не ответил за время ожидания',
            }
          await sleep(SPEC.STILL_POLL_MS)
        }
      }

      const edit = lookup('image_edit')
      const speak = lookup('audio_generate')
      const lip = lookup('lipsync_generate')
      const render = lookup('reel_render')
      if (!edit || !speak || !lip || !render)
        return {
          done: false,
          reason: 'инструменты рилса недоступны на этом сервере',
        }

      // 1. The stills that are missing, all at once, from the one source.
      const drawing: string[] = []
      await Promise.all(
        scenes.map(async (s, i) => {
          if (stills[i] || clips[i]) {
            tasks[i] = null
            return
          }
          const known = tasks[i]
          if (known) {
            const v = await settle(known)
            if (v.act === SPEC.RESUME_USE && v.url) {
              stills[i] = v.url
              tasks[i] = null
              return
            }
            if (v.act !== SPEC.RESUME_REDRAW) {
              drawing.push(
                `${i + 1}: ещё рисуется (оплачен, заново не заказан)`
              )
              return
            }
            // Refused, or given up on: its charge back once, then anew.
            await late?.refund(known, ctx, v.why).catch(() => undefined)
            tasks[i] = null
          }
          const drawCtx: ToolContext = {
            ...ctx,
            imageWaitMs: STORY_STILL_WAIT_MS,
            // The id is kept the moment the provider accepts it: a redeploy
            // during the wait no longer takes the only copy with it.
            onImageTask: (task, paid) => {
              tasks[i] = {
                task,
                at: now(),
                charged: paid?.charged ?? 0,
                op: paid?.op ?? 'image_edit',
              }
              return progress()
            },
          }
          const r = outcome(
            await edit
              .handler(
                {
                  image_url: source,
                  prompt: stillPrompt(s.setting, style),
                  aspect_ratio: SPEC.ASPECT_RATIO,
                },
                drawCtx
              )
              .catch(e => ({ done: false, reason: String(e) }))
          )
          if (r.ok && r.url) {
            stills[i] = r.url
            tasks[i] = null
          } else if (r.pending && r.taskId) {
            const had = tasks[i]
            tasks[i] = {
              task: r.taskId,
              at: had?.task === r.taskId ? had.at : now(),
              charged: r.charged || had?.charged || 0,
              op: had?.op ?? 'image_edit',
            }
            drawing.push(`${i + 1}: ещё рисуется (оплачен, придёт сам)`)
          } else {
            // Refused on the spot: image_edit gave its charge back itself.
            tasks[i] = null
            drawing.push(`${i + 1}: ${r.why}`)
          }
        })
      )
      await progress()
      if (stills.some((u, i) => !u && !clips[i])) {
        return {
          done: false,
          reason:
            `кадры не все: ${drawing.join('; ')}. Дорисованный придёт в «мои файлы» (my_assets) — ` +
            'возьми его в stills по порядку сцен, не рисуй заново',
          ...sofar(),
        }
      }

      // 2 + 3. A voice and a lip-sync per scene that has no clip yet. Her
      // own recorded piece, when the job brought one (spec v4: no clone,
      // her words), is spoken as it is -- nothing is synthesised.
      const seconds: number[] = Array(n).fill(0)
      let voiceKind = ''
      const failed: string[] = []
      const recorded = (ctx.storyVoices ?? []).map(u =>
        /^https?:\/\//.test(String(u ?? '')) ? String(u) : ''
      )
      await Promise.all(
        scenes.map(async (s, i) => {
          if (clips[i]) return
          const v = recorded[i]
            ? outcome({ done: true, url: recorded[i], голос: 'её голосовое' }) // cyrillic-ok: audio_generate's own answer keys
            : outcome(
                await speak
                  .handler(
                    {
                      text: s.line,
                      ...(args.for_lead
                        ? { for_lead: String(args.for_lead) }
                        : {}),
                    },
                    ctx
                  )
                  .catch(e => ({ сделано: false, причина: String(e) })) // cyrillic-ok: audio_generate's own answer keys
              )
          if (!v.ok || !v.url) {
            failed.push(`голос ${i + 1}: ${v.why}`)
            return
          }
          voiceKind ||= v.voice
          const c = outcome(
            await lip
              .handler({ image_url: stills[i], voice_url: v.url }, ctx)
              .catch(e => ({ done: false, reason: String(e) }))
          )
          if (c.ok && c.url) {
            clips[i] = c.url
            seconds[i] = c.seconds
            await progress()
          } else failed.push(`липсинк ${i + 1}: ${c.why}`)
        })
      )
      if (clips.some(c => !c)) {
        return { done: false, reason: failed.join('; '), ...sofar() }
      }

      // 4. The template: cuts, breaths, and the pause with the call to action.
      const r = outcome(
        await render
          .handler(
            {
              compositionId: 'StoryReel',
              props: {
                scenes: clips.map(video => ({ video })),
                pauseSec: pause,
                breathSec: STORY_BREATH_SEC,
                cta: String(args.cta ?? ''),
                ...(endCard ? { endCard } : {}),
              },
            },
            ctx
          )
          .catch(e => ({ done: false, reason: String(e) }))
      )
      if (!r.ok || !r.url) {
        return { done: false, reason: `сборка: ${r.why}`, ...sofar() }
      }
      const spoken = seconds.reduce((a, b) => a + b, 0)
      return {
        done: true,
        url: r.url,
        stills,
        clips,
        ...(voiceKind ? { voice: voiceKind } : {}),
        ...(spoken
          ? {
              seconds:
                Math.round((spoken + STORY_BREATH_SEC * (n - 1) + pause) * 10) /
                10,
            }
          : {}),
        give_to_person: r.url,
      }
    },
  }
}
