/**
 * Story reel TEMPLATES (specs/automation/crm-story-reel.t27 v20).
 *
 * A template is a finished script the CRM can press for any client: its
 * lines, its call and its end-card button. The server owns the list
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
  /** The end card's button: the house bot. */
  button: string
}

const HOOK_STUDIO_RU = [
  'Это говорю не я. Это Тринити.',
  'Она выучила мой голос по рилсам.',
  'Каждый рилс теперь звучит как я.',
  'Хочешь так же? Напиши Тринити.',
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
  },
  {
    id: SPEC.TEMPLATE_HOOK_STUDIO,
    language: 'en',
    lines: HOOK_STUDIO_EN,
    call: SPEC.TEMPLATE_CALL_EN,
    button: SPEC.TEMPLATE_BUTTON,
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

/** What crm_story_reel's ready answer lists for the panel's gallery. */
export function templatesForPanel(): Array<
  StoryTemplate & { scenes: number; max_seconds: number }
> {
  return STORY_TEMPLATES.map(t => ({
    ...t,
    lines: [...t.lines],
    scenes: t.lines.length,
    max_seconds: Math.ceil(reelMaxMs(t.lines.length) / 1000),
  }))
}
