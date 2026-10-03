/**
 * Story reel TEMPLATES (specs/automation/crm-story-reel.t27 v20).
 *
 * A template is a finished script the CRM can press for any client: its
 * lines, its call and its end-card button -- the call and the button only
 * on the house's own reel; a client's reel ends with hers (v22). The server
 * owns the list
 * (TEMPLATES_FROM_SERVER) -- the panel draws what crm_story_reel answers,
 * so a new template is one entry here, not a release of the app.
 *
 * Lines are editable (TEMPLATE_LINES_EDITABLE): the seller may rewrite any
 * line before the press, within LINE_MAX_CHARS -- the length the editor
 * counts and the server refuses past. Shots carry no setting: a template
 * reel stays in the studio of the face it is given (STUDIO_SHOTS).
 *
 * The English lines are the spec's own; the Russian ones are interface
 * text and live here, as the spec keeps only ASCII.
 */
import * as SPEC from '../spec/crm-story-reel.gen'

export type TemplateLanguage = 'ru' | 'en'

export interface StoryTemplate {
  id: string
  language: TemplateLanguage
  /** Spoken lines, one per shot, the hook first. */
  lines: string[]
  /** The call drawn on the end card, as the widget draws it. */
  call: string
  /** The end card's button: the house bot on the house's own reel. */
  button: string
  /** The last line before its call (v22): a client's reel ends it with hers. */
  lead: string
}

const LEAD_RU = 'Хочешь так же?'
const HOOK_STUDIO_RU = [
  'Это говорю не я. Это Тринити.',
  'Она выучила мой голос по рилсам.',
  'Каждый рилс теперь звучит как я.',
  `${LEAD_RU} Напиши Тринити.`,
]
const HOOK_STUDIO_EN = [
  SPEC.TEMPLATE_LINE_EN_1,
  SPEC.TEMPLATE_LINE_EN_2,
  SPEC.TEMPLATE_LINE_EN_3,
  SPEC.TEMPLATE_LINE_EN_4,
]

export const STORY_TEMPLATES: readonly StoryTemplate[] = [
  {
    id: SPEC.TEMPLATE_HOOK_STUDIO,
    language: 'ru',
    lines: HOOK_STUDIO_RU,
    call: 'Напиши Тринити',
    button: SPEC.TEMPLATE_BUTTON,
    lead: LEAD_RU,
  },
  {
    id: SPEC.TEMPLATE_HOOK_STUDIO,
    language: 'en',
    lines: HOOK_STUDIO_EN,
    call: SPEC.TEMPLATE_CALL_EN,
    button: SPEC.TEMPLATE_BUTTON,
    lead: SPEC.TEMPLATE_LEAD_EN_4,
  },
]

/** Spec `line_fits_chars`: a line the editor and the press both accept. */
export function lineFitsChars(chars: number): boolean {
  return chars > 0 && chars <= SPEC.LINE_MAX_CHARS
}

/** Spec `reel_max_ms`: the longest a reel of so many scenes can run. */
export function reelMaxMs(scenes: number): number {
  return (
    scenes * SPEC.LINE_MAX_MS +
    (scenes - 1) * SPEC.BREATH_MS +
    SPEC.PAUSE_SEC * 1000
  )
}

/** Spec `language_of`: a line with a Cyrillic letter is Russian. */
export function languageOf(text: string): TemplateLanguage {
  return /[Ѐ-ӿ]/.test(text) ? 'ru' : 'en'
}

/** The template by id and language; the language falls back to Russian. */
export function templateOf(
  id: string,
  language?: string
): StoryTemplate | undefined {
  const same = STORY_TEMPLATES.filter(t => t.id === id)
  return same.find(t => t.language === language) ?? same[0]
}

/**
 * The lines a press speaks: the template's, each replaced by the seller's
 * edit where one was given. A string says which line was refused and why.
 */
export function templateLines(
  template: StoryTemplate,
  edited?: readonly unknown[]
): string[] | string {
  const lines = template.lines.map((line, i) => {
    const mine = edited?.[i]
    const text =
      typeof mine === 'string'
        ? mine
        : typeof (mine as { line?: unknown })?.line === 'string'
          ? String((mine as { line: string }).line)
          : line
    return text.replace(/\s+/g, ' ').trim()
  })
  const bad = lines.findIndex(l => !lineFitsChars(l.length))
  if (bad >= 0)
    return lines[bad]
      ? `строка ${bad + 1} длиннее ${SPEC.LINE_MAX_CHARS} знаков`
      : `строка ${bad + 1} пустая`
  return lines
}

/*
 * A CLIENT'S REEL CARRIES THE CLIENT'S CALL (spec v22). Owner, 2026-10-03:
 * a reel made for a client ended with "Write to Trinity" and the house bot.
 * On a reel whose lead is not its seller nothing that names the house is
 * said or drawn: the call is the seller's word for her, else her own; the
 * button is the seller's, her kept card, her profile, or none.
 */

/** The names of the house (spec HOUSE_MARKS): a word with one is ours. */
export const HOUSE_MARKS: readonly string[] = [
  SPEC.BOT_SPOKEN_AS,
  'Тринити',
  SPEC.HOUSE_DELIVERY_BOT,
]

/** Whether a call or a button names the house. */
export function namesHouse(text: unknown): boolean {
  const t = String(text ?? '').toLowerCase()
  return HOUSE_MARKS.some(m => t.includes(m.toLowerCase()))
}

/** Spec `word_taken`: a given word is used -- on a client's reel, not the house's. */
export function wordTaken(
  chars: number,
  house: boolean,
  ownReel: boolean
): boolean {
  return chars > 0 && (ownReel || !house)
}

/** Spec `house_word_replaced`: a given house word is replaced, and said so. */
export function houseWordReplaced(
  chars: number,
  house: boolean,
  ownReel: boolean
): boolean {
  return SPEC.HOUSE_WORD_REPLACED_SAID && chars > 0 && house && !ownReel
}

/** Spec `call_from`: the seller's word, the template's at home, else hers. */
export function callFrom(
  sellerOk: boolean,
  templateGiven: boolean,
  ownReel: boolean
): number {
  if (sellerOk) return SPEC.CALL_FROM_SELLER
  if (templateGiven && (ownReel || SPEC.HOUSE_CALL_ON_CLIENT_REEL))
    return SPEC.CALL_FROM_TEMPLATE
  return SPEC.CALL_FROM_PROFILE
}

/** Spec `profile_call_from`: her story call, her approved call, the default. */
export function profileCallFrom(storyOk: boolean, approvedOk: boolean): number {
  if (storyOk) return SPEC.CALL_FROM_STORY
  if (approvedOk) return SPEC.CALL_FROM_APPROVED
  return SPEC.CALL_FROM_DEFAULT
}

/** Spec `button_from`: the seller's, the template's at home, kept, profile, none. */
export function buttonFrom(
  sellerOk: boolean,
  templateGiven: boolean,
  ownReel: boolean,
  keptOk: boolean,
  profileOk: boolean
): number {
  if (sellerOk) return SPEC.FIELD_FROM_SELLER
  if (templateGiven && (ownReel || SPEC.HOUSE_BUTTON_ON_CLIENT_REEL))
    return SPEC.FIELD_FROM_TEMPLATE
  if (keptOk) return SPEC.FIELD_FROM_KEPT
  if (profileOk) return SPEC.FIELD_FROM_PROFILE
  return SPEC.FIELD_FROM_DEFAULT
}

/** Spec `last_line_way`: lead-in and call, the call alone, or the lead-in. */
export function lastLineWay(
  leadChars: number,
  callChars: number,
  sameLanguage: boolean
): number {
  if (callChars === 0 || !sameLanguage) return SPEC.LAST_LINE_LEAD
  if (leadChars + 1 + callChars <= SPEC.LINE_MAX_CHARS)
    return SPEC.LAST_LINE_LEAD_AND_CALL
  if (callChars <= SPEC.LINE_MAX_CHARS) return SPEC.LAST_LINE_CALL
  return SPEC.LAST_LINE_LEAD
}

/** Spec `voice_of`: the lead's voice, the caller's at home, or refused. */
export function voiceOf(
  leadNamed: boolean,
  clientTurn: boolean,
  namesThisClient: boolean
): number {
  if (clientTurn && leadNamed && !namesThisClient) return SPEC.SPEAKS_REFUSED
  if (leadNamed || (clientTurn && SPEC.CLIENT_TURN_SPEAKS_CLIENT))
    return SPEC.SPEAKS_LEAD
  return SPEC.SPEAKS_CALLER
}

const clean = (v: unknown): string =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : ''

/** A given call or button read for this reel: the word used, and whether a house one was dropped. */
export function takenWord(
  text: unknown,
  ownReel: boolean
): { word: string; replaced: boolean } {
  const t = clean(text)
  const house = namesHouse(t)
  return {
    word: wordTaken(t.length, house, ownReel) ? t : '',
    replaced: houseWordReplaced(t.length, house, ownReel),
  }
}

/** Her own call from her profile (spec profile_call_from); a house word is not hers. */
export function ownCallOf(
  story: unknown,
  approved: unknown,
  ownReel: boolean,
  fallback: string
): string {
  const s = takenWord(story, ownReel).word
  const a = takenWord(approved, ownReel).word
  const from = profileCallFrom(!!s, !!a)
  return from === SPEC.CALL_FROM_STORY
    ? s
    : from === SPEC.CALL_FROM_APPROVED
      ? a
      : fallback
}

/**
 * A reel's call (spec call_from): the seller's word unless it names the house
 * on a client's reel, the template's on the house's own reel, else hers.
 */
export function reelCall(o: {
  given?: unknown
  templateCall?: string
  ownReel: boolean
  ownCall: string
}): { call: string; from: number; replaced: string } {
  const given = takenWord(o.given, o.ownReel)
  const from = callFrom(!!given.word, !!clean(o.templateCall), o.ownReel)
  return {
    call:
      from === SPEC.CALL_FROM_SELLER
        ? given.word
        : from === SPEC.CALL_FROM_TEMPLATE
          ? clean(o.templateCall)
          : o.ownCall,
    from,
    replaced: given.replaced ? clean(o.given) : '',
  }
}

/** An end card for this reel: on a client's reel a button naming the house is dropped. */
export function cardForReel<T extends { button?: string }>(
  card: T | null | undefined,
  ownReel: boolean
): T | null {
  if (!card) return null
  if (!card.button || takenWord(card.button, ownReel).word) return card
  const rest = { ...card }
  delete rest.button
  return Object.keys(rest).length ? rest : null
}

/** One short line for the answer: which house words were replaced by hers. */
export function houseReplacedNote(
  words: readonly string[],
  call: string
): string {
  const said = words.filter(Boolean)
  if (!said.length) return ''
  const named = said.map(w => `«${w}»`).join(' и ')
  const verb = said.length > 1 ? 'ведут' : 'ведёт' // cyrillic-ok: tool result copy
  return `${named} ${verb} к нам, а не к клиенту: заменено, призыв — «${call}»` // cyrillic-ok: tool result copy
}

/** The template's last line with her call (spec last_line_way), never past the editor. */
export function lastLineFor(template: StoryTemplate, call: string): string {
  const c = clean(call)
  const said = !c || /[.!?…]$/.test(c) ? c : `${c}.`
  const way = lastLineWay(
    template.lead.length,
    said.length,
    !!c && languageOf(c) === template.language
  )
  return way === SPEC.LAST_LINE_LEAD_AND_CALL
    ? `${template.lead} ${said}`
    : way === SPEC.LAST_LINE_CALL
      ? said
      : template.lead
}

/**
 * The template as a client's reel tells it: its first lines kept
 * (TEMPLATE_LINES_KEPT), the last one ending with her call, her call on the
 * card, and no house button.
 */
export function templateForClient(
  template: StoryTemplate,
  call: string
): StoryTemplate {
  return {
    ...template,
    lines: [
      ...template.lines.slice(0, SPEC.TEMPLATE_LINES_KEPT),
      lastLineFor(template, call),
    ],
    call: clean(call),
    button: '',
  }
}

/**
 * The lines a press speaks on a client's reel: the seller's own edit of the
 * last line stays unless it names the house; the template's own last line,
 * or a house one, ends with her call.
 */
export function clientLines(
  template: StoryTemplate,
  lines: readonly string[],
  call: string
): { lines: string[]; replaced: string } {
  const i = SPEC.TEMPLATE_LINES_KEPT
  const last = clean(lines[i])
  const edited = !!last && last !== clean(template.lines[i])
  if (edited && !namesHouse(last)) return { lines: [...lines], replaced: '' }
  const out = [...lines]
  out[i] = lastLineFor(template, call)
  return { lines: out, replaced: edited ? last : '' }
}

/**
 * What crm_story_reel's ready answer lists for the panel's gallery: on a
 * client's panel (`client` given) each template ends with her call.
 */
export function templatesForPanel(client?: {
  call: string
}): Array<StoryTemplate & { scenes: number; max_seconds: number }> {
  return STORY_TEMPLATES.map(t => {
    const shown = client ? templateForClient(t, client.call) : t
    return {
      ...shown,
      lines: [...shown.lines],
      scenes: shown.lines.length,
      max_seconds: Math.ceil(reelMaxMs(shown.lines.length) / 1000),
    }
  })
}
