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
import { cutShot, shotOfScene } from './studio-shots'
import type { HeardVoice } from './split-reel-tool'
import {
  cardForReel,
  houseLineRefused,
  houseReplacedNote,
  languageOf,
  reelCall,
  takenWord,
  voiceOf,
} from './story-reel-templates'
import { captionsFromWords, type SpokenWord } from '../split-reel-plan'

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
  'the person is the subject of the frame, face clearly visible; ' +
  'change ONLY the setting around them, and never keep the plain background of the source photo.'

/** Our own eyes on a new still: true a face, false none, null unchecked. */
export interface StoryEyes {
  hasFace: (url: string, ctx: ToolContext) => Promise<boolean | null>
}

/** What a new still's face check leads to (spec still_face_action). */
export function stillFaceAction(hasFace: boolean, redraws: number): number {
  if (hasFace) return SPEC.FACE_KEEP
  if (redraws < SPEC.STILL_FACE_REDRAWS) return SPEC.FACE_REDRAW
  return SPEC.FACE_STOP
}

/** Whether a line, as heard, may go on to its lip-sync (spec line_fits). */
export function lineFits(ms: number): boolean {
  return ms <= SPEC.LINE_MAX_MS
}

const LINE_MAX_SEC_TEXT = String(SPEC.LINE_MAX_MS / 1000).replace('.', ',')

export interface StoryScene {
  setting: string
  line: string
}

/**
 * The prompt of one scene's still: the person first, then the setting and the
 * one style (spec v19, STILL_IDENTITY_FIRST: setting-first gave an empty street).
 */
export function stillPrompt(setting: string, style: string): string {
  return [
    KEEP_THE_PERSON,
    `Setting: ${setting.trim()}.`,
    style.trim(),
    'Vertical 9:16, no text, no letters, no logos.',
  ]
    .filter(Boolean)
    .join(' ')
}

/**
 * Whether a scene shows the source photo as it is (spec v19, OPEN_ON_SOURCE):
 * a talking-head reel opens on the talking head, wide, not on a picture.
 */
export function sceneIsSource(scene: number): boolean {
  return SPEC.OPEN_ON_SOURCE && scene === SPEC.OPEN_SCENE
}

/**
 * A first line that opens with a greeting or the weather (spec v19,
 * FIRST_LINE_HOOK): the owner's reel of 2026-10-03 opened "good morning in
 * the rain", and the first second of a reel is the hook or nothing.
 */
const GREETING_OPENER =
  /^(доброе\s+утро|добрый\s+(день|вечер)|доброй\s+ночи|привет|всем\s+привет|здравствуй|здорово|хай|салют|good\s+(morning|afternoon|evening)|hello|hi|hey)(?!\p{L})/iu // cyrillic-ok

export function opensWithGreeting(line: string): boolean {
  return GREETING_OPENER.test(line.trim().replace(/^[^\p{L}]+/u, ''))
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
    // No setting is a shot of the source (spec v19, STUDIO_SHOTS): the
    // studio is never left unless a caller names a place.
    if (!line || (!setting && !sceneIsSource(i) && !SPEC.STUDIO_SHOTS))
      return `scenes.${i}: нужны и setting (обстановка), и line (реплика)`
    out.push({ setting, line })
  }
  if (SPEC.FIRST_LINE_HOOK && opensWithGreeting(out[0].line))
    return (
      'scenes.0: первая реплика — хук (утверждение, вопрос, цифра), ' +
      'а не приветствие: рилс решается в первую секунду'
    )
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
): Promise<{
  kept: StoryEndCard | null
  action: number
  why?: string
  fix?: Pick<StoryEndCard, 'title' | 'accent'> | null
  fixPalette?: Pick<StoryEndCard, 'title' | 'accent'> | null
  fixBg?: Pick<StoryEndCard, 'bg'> | null
}> {
  const given =
    !!raw &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    Object.values(raw as Record<string, unknown>).some(
      v => v !== undefined && v !== null && String(v).trim() !== ''
    )
  const card = given ? endCardOf(raw) : null
  // Read as her reel will draw it (spec v25, CLIENT_CARD_CHECKED_AS_DRAWN):
  // a colour she keeps none of is ink there, never the house's gold.
  const drawn = (c: StoryEndCard) =>
    endCardForReel(mergeEndCard(c, null, profile), owner === lead, '')
  const why = given
    ? endCardProblem(raw) ||
      (card ? endCardUnreadable(drawn(card)) : '') ||
      (card ? '' : 'end_card: ни одного цвета #hex и ни строки кнопки')
    : ''
  const action = keepAction(true, given, given && !why)
  if (action === SPEC.KEEP_REFUSED) {
    // A #hex card that does not read gets its options (v12, v13); "black"
    // does not.
    const merged = card && !endCardProblem(raw) ? drawn(card) : null
    return {
      kept: null,
      action,
      why,
      fix: endCardFix(merged),
      fixPalette: endCardFixPalette(merged),
      fixBg: endCardFixBg(merged),
    }
  }
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
 * The pairs held against the background, as the card will render (the
 * composition's defaults fill what the card leaves out): the call in the
 * title colour, and the button line in the accent -- only when there is one.
 */
const readPairs = (
  card: StoryEndCard
): Array<{ what: string; field: 'title' | 'accent'; colour: string }> => [
  {
    what: 'призыв',
    field: 'title',
    colour: card.title ?? SPEC.END_CARD_DEFAULT_TITLE,
  },
  ...(card.button
    ? [
        {
          what: 'строка кнопки',
          field: 'accent' as const,
          colour: card.accent ?? SPEC.END_CARD_DEFAULT_ACCENT,
        },
      ]
    : []),
]

/**
 * Whether the call and the button read on the card as it will render; ''
 * when they do, else what does not, in words, with the shade of that colour
 * that does read (spec v12), so the words alone are enough to fix it.
 */
export function endCardUnreadable(card: StoryEndCard | null): string {
  if (!card) return ''
  const bg = card.bg ?? SPEC.END_CARD_DEFAULT_BG
  for (const { what, colour } of readPairs(card)) {
    const x10 = contrastX10(colour, bg)
    if (!endCardReadable(x10))
      return `${what} цветом ${colour} на фоне ${bg} читается плохо: контраст ${ratio(x10)}:1, нужно не меньше ${ratio(SPEC.END_CARD_CONTRAST_MIN_X10)}:1; читается ${readableShade(colour, bg)}`
  }
  return ''
}

/*
 * A CLIENT'S CARD IS NEVER THE HOUSE'S (spec v25). StoryReel draws what a
 * card leaves out in its defaults -- the house's gold call and green button --
 * and draws a card whenever there is a call, even with no card at all. So a
 * client with no palette, or half of one, ended her reel in the house's
 * colours. Her card is now filled before the render: her colours where she
 * has them, else white or black ink, whichever reads on her ground.
 */

/** The spec's card_filled. */
export function cardFilled(
  ownReel: boolean,
  hasEndCard: boolean,
  callChars: number
): boolean {
  return (
    !ownReel &&
    !SPEC.HOUSE_COLOURS_ON_CLIENT_REEL &&
    // the spec's cta_card_shown, as StoryReel.tsx reads it
    SPEC.CTA_CARD_LIKE_WIDGET &&
    (hasEndCard || callChars > 0)
  )
}

/** The spec's default_ink. */
export function defaultInk(
  ownReel: boolean,
  whiteX10: number,
  blackX10: number
): number {
  if (ownReel || SPEC.HOUSE_COLOURS_ON_CLIENT_REEL) return SPEC.INK_HOUSE
  if (whiteX10 >= blackX10) return SPEC.INK_WHITE
  return SPEC.INK_BLACK
}

/** The spec's card_complete (v26). */
export function cardComplete(
  ownReel: boolean,
  hasEndCard: boolean,
  callChars: number
): boolean {
  if (cardFilled(ownReel, hasEndCard, callChars)) return true
  return (
    ownReel &&
    SPEC.OWN_CARD_FILLED &&
    SPEC.CTA_CARD_LIKE_WIDGET &&
    (hasEndCard || callChars > 0)
  )
}

/** The spec's reel_is_own (v26). */
export function reelIsOwn(houseOwn: boolean, leadIsCaller: boolean): boolean {
  if (houseOwn) return true
  return leadIsCaller && SPEC.CALLER_OWN_LEAD_IS_OWN_REEL
}

/**
 * The card as the reel will draw it: whenever the pause shows the card, every
 * colour is set before the render (spec v26, card_complete). The composition
 * does not apply its defaults to a card passed with some fields, so a field
 * left out was drawn as nothing: no ground, a dark call over the face. A
 * client's card takes hers, else ink (v25); the own reel's takes the
 * defaults. A reel with no card shown keeps the card as given.
 */
export function endCardForReel(
  card: StoryEndCard | null,
  ownReel: boolean,
  call: string
): StoryEndCard | null {
  if (!cardComplete(ownReel, !!card, call.trim().length)) return card
  if (!cardFilled(ownReel, !!card, call.trim().length))
    return {
      ...card,
      bg: card?.bg ?? SPEC.END_CARD_DEFAULT_BG,
      title: card?.title ?? SPEC.END_CARD_DEFAULT_TITLE,
      text: card?.text ?? SPEC.END_CARD_DEFAULT_TEXT,
      accent: card?.accent ?? SPEC.END_CARD_DEFAULT_ACCENT,
    }
  const bg = card?.bg ?? SPEC.END_CARD_DEFAULT_BG
  const ink =
    defaultInk(
      ownReel,
      contrastX10(SPEC.INK_WHITE_HEX, bg),
      contrastX10(SPEC.INK_BLACK_HEX, bg)
    ) === SPEC.INK_BLACK
      ? SPEC.INK_BLACK_HEX
      : SPEC.INK_WHITE_HEX
  return {
    ...card,
    bg,
    title: card?.title ?? ink,
    text: card?.text ?? ink,
    accent: card?.accent ?? ink,
  }
}

/** The spec's shade_way. */
export function shadeWay(
  lightStep: number,
  darkStep: number,
  lightReadsBetter: boolean
): number {
  if (lightStep < darkStep) return SPEC.WAY_LIGHT
  if (darkStep < lightStep) return SPEC.WAY_DARK
  return lightReadsBetter ? SPEC.WAY_LIGHT : SPEC.WAY_DARK
}

/** The spec's suggest_offered. */
export function suggestOffered(colourOk: boolean, readable: boolean): boolean {
  if (!colourOk) return SPEC.SUGGEST_FOR_BAD_HEX
  return !readable
}

const WHITE = 255
const BLACK = 0

/*
 * OKLCH (spec v14): lightness, chroma and hue as the eye sees them. The
 * shade moves only the lightness, so her hue and chroma stay hers; the sRGB
 * mix of v12 and v13 turned a dark blue 19.8 degrees toward lavender.
 */
const toLinear = (v: number) => {
  const x = v / 255
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
}
const toGamma = (x: number) =>
  x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055

/** A #hex colour in OKLab: [L, a, b]. */
export function oklabOf(colour: string): [number, number, number] {
  const [r, g, b] = rgbOf(colour).map(toLinear)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

/** A #hex colour in OKLCH: lightness 0..1, chroma, hue in degrees. */
export function oklchOf(colour: string): { l: number; c: number; h: number } {
  const [l, a, b] = oklabOf(colour)
  return {
    l,
    c: Math.hypot(a, b),
    h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360,
  }
}

const linearOf = (l: number, c: number, h: number) => {
  const [a, b] = [
    c * Math.cos((h * Math.PI) / 180),
    c * Math.sin((h * Math.PI) / 180),
  ]
  const L = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const M = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const S = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ]
}
const shown = (v: number[]) => v.every(x => x >= -1e-6 && x <= 1 + 1e-6)

/**
 * An OKLCH colour as #rrggbb. Chroma a screen cannot show is cut back
 * (SHADE_CHROMA_CUT_TO_SRGB) -- by halving, so the hue stays -- never
 * clipped channel by channel, which would turn it.
 */
export function hexOfOklch(l: number, c: number, h: number): string {
  let chroma = c
  if (!shown(linearOf(l, chroma, h))) {
    let [lo, hi] = [0, c]
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2
      if (shown(linearOf(l, mid, h))) lo = mid
      else hi = mid
    }
    chroma = lo
  }
  return `#${linearOf(l, chroma, h)
    .map(x =>
      Math.round(
        Math.min(1, Math.max(0, toGamma(Math.min(1, Math.max(0, x))))) * 255
      )
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`
}

/** The spec's hue_checked. */
export function hueChecked(chromaX1000: number): boolean {
  return chromaX1000 >= SPEC.HUE_CHECKED_MIN_CHROMA_X1000
}

/** The spec's hue_kept. */
export function hueKept(driftDeg: number): boolean {
  return driftDeg <= SPEC.HUE_DRIFT_MAX_DEG
}

/** How far two hues are apart, in whole degrees, rounded up. */
export function hueDrift(a: string, b: string): number {
  const d = Math.abs(oklchOf(a).h - oklchOf(b).h) % 360
  return Math.ceil(d > 180 ? 360 - d : d)
}

/**
 * Her colour, `step` of SUGGEST_STEPS of the way to white or black -- in
 * OKLCH lightness only (spec v14). Step 0 is her colour itself; the last
 * step is lightness 1 or 0, which holds no chroma: pure white or black.
 */
export function shadeOf(colour: string, target: number, step: number): string {
  const k = Math.min(step, SPEC.SUGGEST_STEPS) / SPEC.SUGGEST_STEPS
  if (k === 0) return spelled(colour)
  const { l, c, h } = oklchOf(colour)
  const to = target === WHITE ? 1 : 0
  return hexOfOklch(l + (to - l) * k, c, h)
}

/** The first step toward white or black at which her colour reads on bg. */
export function firstReadableStep(
  colour: string,
  bg: string,
  target: number
): number {
  for (let step = 1; step <= SPEC.SUGGEST_STEPS; step++)
    if (endCardReadable(contrastX10(shadeOf(colour, target, step), bg)))
      return step
  return SPEC.SUGGEST_NEVER
}

/**
 * THE LEAST SHADE OF HER COLOUR THAT READS (spec v12). Her colour mixed
 * toward white or toward black in SUGGEST_STEPS equal steps; the way that
 * reads in fewer steps, a tie to the extreme that reads better on bg. The
 * last step is pure white or black, and one of the two always reads
 * (EXTREME_MIN_CONTRAST_X10), so there is always an answer.
 */
export function readableShade(colour: string, bg: string): string {
  const light = firstReadableStep(colour, bg, WHITE)
  const dark = firstReadableStep(colour, bg, BLACK)
  const way = shadeWay(
    light,
    dark,
    contrastX10('#fff', bg) >= contrastX10('#000', bg)
  )
  return way === SPEC.WAY_LIGHT
    ? shadeOf(colour, WHITE, light)
    : shadeOf(colour, BLACK, dark)
}

/**
 * The shade that reads for each field that does not, by the card's own
 * field names (spec v12, SUGGEST_FIX_ARG); null when all of it reads.
 */
export function endCardFix(
  card: StoryEndCard | null
): Pick<StoryEndCard, 'title' | 'accent'> | null {
  if (!card) return null
  const bg = card.bg ?? SPEC.END_CARD_DEFAULT_BG
  const out: Pick<StoryEndCard, 'title' | 'accent'> = {}
  // Her card's colours passed endCardOf: every one is #hex.
  for (const { field, colour } of readPairs(card))
    if (suggestOffered(true, endCardReadable(contrastX10(colour, bg))))
      out[field] = readableShade(colour, bg)
  return out.title || out.accent ? out : null
}

/** The spec's palette_offered. */
export function paletteOffered(reads: boolean, sameAsShade: boolean): boolean {
  return reads && !sameAsShade
}

/** The spec's bg_offered. */
export function bgOffered(
  unreadable: boolean,
  allReadAtSomeStep: boolean
): boolean {
  return unreadable && allReadAtSomeStep
}

/**
 * One spelling for a #hex colour: #rrggbb, lower case, its alpha dropped
 * (a shade of step 0). split_reel compares and draws its call colours in it.
 */
export function spelled(c: string): string {
  return `#${rgbOf(c)
    .map(v => v.toString(16).padStart(2, '0'))
    .join('')}`
}
/** The difference the eye sees (spec v14, NEAREST_BY): distance in OKLab. */
const distance = (a: string, b: string) => {
  const [x, y] = [oklabOf(a), oklabOf(b)]
  return x.reduce((sum, v, i) => sum + (v - y[i]) ** 2, 0)
}

/**
 * HER OWN COLOUR THAT READS (spec v13, SUGGEST_PALETTE_ARG). For each field
 * that does not read: of the colours already on her card -- the call, the
 * text, the accent; never the ground, never the composition's defaults,
 * never an invented one -- the one that reads there and is nearest to the
 * refused colour. Not offered when it is the very shade already named.
 */
export function endCardFixPalette(
  card: StoryEndCard | null
): Pick<StoryEndCard, 'title' | 'accent'> | null {
  if (!card) return null
  const bg = card.bg ?? SPEC.END_CARD_DEFAULT_BG
  const hers = [card.title, card.text, card.accent].filter(
    (c): c is string => !!c
  )
  const out: Pick<StoryEndCard, 'title' | 'accent'> = {}
  for (const { field, colour } of readPairs(card)) {
    if (endCardReadable(contrastX10(colour, bg))) continue
    const pick = hers
      .filter(c => endCardReadable(contrastX10(c, bg)))
      .sort((a, b) => distance(a, colour) - distance(b, colour))[0]
    const same = !!pick && spelled(pick) === readableShade(colour, bg)
    if (pick && paletteOffered(true, same)) out[field] = pick
  }
  return out.title || out.accent ? out : null
}

/** The first step of her ground toward white or black at which every line reads. */
export function firstGroundStep(card: StoryEndCard, target: number): number {
  const bg = card.bg ?? SPEC.END_CARD_DEFAULT_BG
  const pairs = readPairs(card)
  for (let step = 1; step <= SPEC.SUGGEST_STEPS; step++) {
    const ground = shadeOf(bg, target, step)
    if (pairs.every(p => endCardReadable(contrastX10(p.colour, ground))))
      return step
  }
  return SPEC.SUGGEST_NEVER
}

/**
 * HER GROUND, SHADED UNTIL EVERY LINE READS (spec v13, SUGGEST_BG_ARG). The
 * least shade of her background toward white or black at which the call
 * and the button line both read (shade_way picks the way, a tie going to
 * the extreme the call reads better on). Null when the card reads, and
 * when no shade of her ground does it (BG_FIX_ALWAYS_EXISTS is false: a
 * dark call and a light button share no ground).
 */
export function endCardFixBg(
  card: StoryEndCard | null
): Pick<StoryEndCard, 'bg'> | null {
  if (!card) return null
  const bg = card.bg ?? SPEC.END_CARD_DEFAULT_BG
  const pairs = readPairs(card)
  const unreadable = pairs.some(
    p => !endCardReadable(contrastX10(p.colour, bg))
  )
  const light = firstGroundStep(card, WHITE)
  const dark = firstGroundStep(card, BLACK)
  if (!bgOffered(unreadable, Math.min(light, dark) <= SPEC.SUGGEST_STEPS))
    return null
  const call = pairs[0].colour
  const way = shadeWay(
    light,
    dark,
    contrastX10(call, '#fff') >= contrastX10(call, '#000')
  )
  return {
    bg:
      way === SPEC.WAY_LIGHT
        ? shadeOf(bg, WHITE, light)
        : shadeOf(bg, BLACK, dark),
  }
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

/* ── yellow captions, word by word (spec v20) ───────────────────────────── */

/** Our own ears: a clip on the shelf -> its words with times (whisper). */
export type StoryHear = (
  url: string,
  language?: string
) => Promise<HeardVoice | string>

/** Whether a scene's captions show its line as written (`caption_uses_line`). */
export function captionUsesLine(
  lineWords: number,
  heardWords: number
): boolean {
  return (
    SPEC.CAPTION_TEXT_FROM_LINE && heardWords > 0 && lineWords === heardWords
  )
}

export interface SceneCaption {
  text: string
  startMs: number
  endMs: number
  confidence: number
}

/**
 * One scene's captions from its OWN clip's words, timed from the clip's zero
 * (CAPTIONS_PER_SCENE). Whisper's times, the line's spelling when whisper
 * counted the same words -- "Тринити", not whatever it heard.
 */
export function sceneCaptions(
  line: string,
  words: readonly SpokenWord[],
  speech?: HeardVoice['speech']
): SceneCaption[] {
  const heard = captionsFromWords(words, 0, speech)
  const written = line.split(/\s+/).filter(Boolean)
  return captionUsesLine(written.length, heard.length)
    ? heard.map((c, i) => ({ ...c, text: written[i] }))
    : heard
}

export function makeStoryReelTool(
  lookup: (name: string) => Tool,
  late?: StoryLate,
  eyes?: StoryEyes,
  cut: (sourceUrl: string, shot: number) => Promise<string> = cutShot,
  hear?: StoryHear
): AgentTool {
  const now = late?.now ?? Date.now
  const sleep =
    late?.sleep ?? ((ms: number) => new Promise(r => setTimeout(r, ms)))
  return {
    name: 'story_reel',
    // Borrowed from the registry, each charging for itself: the price that makes
    // this a paid tool (tool-charges.ts, crm-duet.t27 v5).
    charges: [
      'image_edit',
      'audio_generate',
      'lipsync_generate',
      'reel_render',
    ],
    description:
      `РИЛС-ИСТОРИЯ ОДНИМ ВЫЗОВОМ (шаблон StoryReel): одно фото с лицом → ${STORY_SCENES_MIN}–${STORY_SCENES_MAX} сцен. ` +
      'Сцена 1 — САМО фото, общий план говорящей головы, её реплика — ХУК, не приветствие. ' +
      'По умолчанию из студии не выходим: сцена без setting — план того же фото (крупный, средний), ничего не рисуется; ' +
      'setting — только если человек сам назвал место (новый кадр в ОДНОМ стиле) → реплика на сцену голосом (for_lead — голос клиента из crm_voice_clone; в разговоре за клиента — всегда его голос, его призыв и его кнопка; ' +
      'клон владельца — только на своём рилсе) → липсинк → сборка: склейки, вдох между репликами и в конце ПАУЗА с призывом cta. ' +
      `Реплика звучит до ${LINE_MAX_SEC_TEXT} с (длиннее — липсинк не делается, реплика названа: сократи), ` +
      `ролик из ${SPEC.SCENES_DEFAULT} сцен с паузой — до ${SPEC.STORY_DEFAULT_MAX_SEC} с. Кадр без лица перерисовывается один раз. ` +
      'Если вернулись stills/clips без видео — повтори с ними: ' +
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
                description:
                  'НЕ задавать по умолчанию (тогда план того же фото в студии); только место, названное человеком',
              },
              line: {
                type: 'string',
                description: `реплика до ${LINE_MAX_SEC_TEXT} с (6–8 слов), названия словами (бот — «Тринити»)`,
              },
            },
            required: ['line'],
          },
          description:
            'сцены по порядку; первая реплика — хук, последняя — призыв',
        },
        style: {
          type: 'string',
          description: 'один стиль на все кадры (свет, тона, канон бренда)',
        },
        for_lead: {
          type: 'string',
          description: 'id клиента: говорить ЕГО голосом (crm_voice_clone)',
        },
        cta: {
          type: 'string',
          description:
            'надпись в паузе в конце; у рилса клиента пусто — его призыв из профиля',
        },
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
      /*
       * WHOSE REEL THIS IS (spec v22, voice_of). In a turn for a client
       * (ctx.faceOf) the reel speaks HER voice: for_lead defaults to her and
       * another id is refused -- before v22 a reel without for_lead spoke the
       * owner's clone. A reel for a client takes her call and her card, never
       * the house's (call_from, button_from); the runner (surface 'story')
       * has already read them from her profile.
       */
      const me = String(ctx.telegramId ?? '').trim()
      const faceOf = String(ctx.faceOf ?? '').trim()
      const clientTurn = !!faceOf && faceOf !== me
      const named = String(args.for_lead ?? '').trim()
      const voice = voiceOf(!!named, clientTurn, named === faceOf)
      if (voice === SPEC.SPEAKS_REFUSED)
        return {
          done: false,
          reason: `for_lead: в разговоре за клиента рилс говорит только его голосом — for_lead ${faceOf} или пусто`, // cyrillic-ok: tool result copy
        }
      const lead = voice === SPEC.SPEAKS_LEAD ? named || faceOf : ''
      let cta = String(args.cta ?? '')
      let endCard = endCardOf(args.end_card)
      let houseReplaced = ''
      if (lead && lead !== me && ctx.surface !== 'story') {
        // No line of her reel names the house unless she typed it this turn
        // (spec v22, line_way): the agent's line is refused, before any cut.
        const houseLine = houseLineRefused(scenes, false, ctx.ownerSaid)
        if (houseLine) return { done: false, reason: houseLine }
        const { storySettingsOf, STORY_DEFAULT_CTA } = await import(
          './story-template'
        )
        const her = ctx.pool
          ? await storySettingsOf(ctx.pool as never, lead, me).catch(() => null)
          : null
        const call = reelCall({
          given: args.cta,
          ownReel: false,
          ownCall: her?.cta || STORY_DEFAULT_CTA,
        })
        cta = call.call
        // The house's words the agent wrote are replaced, and the answer says
        // so in one line (house_word_replaced), as the CRM press does.
        const button = String(endCard?.button ?? '')
        houseReplaced = houseReplacedNote(
          [call.replaced, takenWord(button, false).replaced ? button : ''],
          cta
        )
        // Every colour set before the render (spec v25, card_filled): what
        // she has no colour for is ink, never the house's gold.
        endCard = endCardForReel(
          mergeEndCard(
            cardForReel(endCard, false),
            cardForReel(her?.keptCard, false),
            cardForReel(her?.endCard, false)
          ),
          false,
          cta
        )
      }
      const stills = carried(args.stills, n)
      const clips = carried(args.clips, n)
      // The opening scene is the talking head itself, wide (spec v19,
      // OPEN_ON_SOURCE): the source photo as it is, nothing drawn or checked.
      for (let i = 0; i < n; i++)
        if (sceneIsSource(i) && !stills[i]) stills[i] = source
      // A scene with no setting is a shot of the same photo (STUDIO_SHOTS):
      // cut, not drawn -- the studio and the look stay exactly the source's.
      const uncut: string[] = []
      await Promise.all(
        scenes.map(async (s, i) => {
          if (stills[i] || clips[i] || s.setting) return
          stills[i] = await cut(source, shotOfScene(i)).catch(e => {
            uncut.push(`${i + 1}: ${String(e).slice(0, 160)}`)
            return ''
          })
        })
      )
      if (uncut.length)
        return {
          done: false,
          reason: `план из фото не вырезан: ${uncut.join('; ')}`,
          ...(stills.some(Boolean) ? { stills } : {}),
        }
      const given = [...stills]
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

      const drawing: string[] = []
      // One still, drawn from the one source; true when it came back.
      const draw = async (i: number, s: StoryScene): Promise<boolean> => {
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
        return !!stills[i]
      }

      // 1. The stills that are missing, all at once, from the one source.
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
          await draw(i, s)
        })
      )
      await progress()

      // 1b. Every new still is looked at (spec v19, STILL_FACE_CHECKED): no
      // face, one redraw; still none, stop before a voice is paid for it.
      const faceless: number[] = []
      const unchecked: number[] = []
      if (eyes) {
        await Promise.all(
          scenes.map(async (s, i) => {
            for (let redraws = 0; stills[i] && stills[i] !== given[i]; ) {
              const seen = await eyes.hasFace(stills[i], ctx).catch(() => null)
              if (seen === null) {
                unchecked.push(i + 1)
                return
              }
              const act = stillFaceAction(seen, redraws)
              if (act === SPEC.FACE_KEEP) return
              stills[i] = ''
              if (act === SPEC.FACE_STOP) {
                faceless.push(i + 1)
                return
              }
              redraws += 1
              if (!(await draw(i, s))) return
            }
          })
        )
        await progress()
      }
      if (faceless.length) {
        return {
          done: false,
          reason:
            `в кадре ${faceless.sort((a, b) => a - b).join(', ')} нет лица и после перерисовки — ` +
            'поменяй обстановку (setting) этой сцены и повтори; остальные кадры сохранены, голос и липсинк не оплачивались',
          ...sofar(),
        }
      }
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
                      ...(lead ? { for_lead: lead } : {}),
                    },
                    ctx
                  )
                  .catch(e => ({ сделано: false, причина: String(e) })) // cyrillic-ok: audio_generate's own answer keys
              )
          if (!v.ok || !v.url) {
            failed.push(`голос ${i + 1}: ${v.why}`)
            return
          }
          // Heard before its lip-sync (spec v19, LINE_MEASURED_BEFORE_LIPSYNC):
          // a long line would push the reel past its 15 s.
          const ms = Math.round(v.seconds * 1000)
          if (!recorded[i] && ms > 0 && !lineFits(ms)) {
            failed.push(
              `реплика ${i + 1} звучит ${String(v.seconds).replace('.', ',')} с, длиннее ${LINE_MAX_SEC_TEXT} с: ` +
                'сократи её — липсинк этой сцены не делался'
            )
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

      // 4. Captions (spec v20): every clip heard by itself. Nothing heard is
      // no reason to throw the lip-syncs away -- the reel goes out without
      // them and the answer says so (CAPTIONS_MISSING_KEEPS_REEL).
      const language = languageOf(scenes.map(s => s.line).join(' '))
      const deaf: string[] = []
      const captions: SceneCaption[][] = await Promise.all(
        clips.map(async (clip, i) => {
          if (!SPEC.CAPTIONS_ON) return []
          if (!hear) {
            deaf.push(`${i + 1}: слух не подключён`)
            return []
          }
          const got = await hear(clip, language).catch(e => String(e))
          if (typeof got === 'string' || !got.words.length) {
            deaf.push(
              `${i + 1}: ${typeof got === 'string' ? got.slice(0, 120) : 'слов не услышано'}`
            )
            return []
          }
          return sceneCaptions(scenes[i].line, got.words, got.speech)
        })
      )

      // 5. The template: cuts, breaths, and the pause with the call to action.
      // Every colour of the card shown is set here (spec v26, card_complete):
      // the own reel's from the defaults, a client's already in hers or ink.
      const drawnCard = endCardForReel(endCard, !lead || lead === me, cta)
      const r = outcome(
        await render
          .handler(
            {
              compositionId: 'StoryReel',
              props: {
                scenes: clips.map((video, i) => ({
                  video,
                  captions: captions[i],
                })),
                pauseSec: pause,
                breathSec: STORY_BREATH_SEC,
                cta,
                ...(drawnCard ? { endCard: drawnCard } : {}),
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
        ...(deaf.length
          ? { captions_missing: `без титров: ${deaf.join('; ')}` }
          : { captions: `${n} из ${n} сцен` }),
        ...(unchecked.length
          ? {
              faces_unchecked: `кадры ${unchecked.sort((a, b) => a - b).join(', ')}: лицо не проверено (зрение не ответило)`,
            }
          : {}),
        ...(spoken
          ? {
              seconds:
                Math.round((spoken + STORY_BREATH_SEC * (n - 1) + pause) * 10) /
                10,
            }
          : {}),
        ...(houseReplaced ? { house_replaced: houseReplaced } : {}),
        give_to_person: r.url,
      }
    },
  }
}
