/**
 * The house's names, read in ONE place (crm-story-reel v22, split-reel v7).
 *
 * A reel made for a client never names the house -- not in a spoken line,
 * so not in a caption, not in the call, not on the end card's button --
 * unless it is the person's own words, typed this turn. Every reel that
 * refuses a house name reads this detector, so a new spelling is one entry
 * here and not a fix in each tool that happened to keep its own copy (the
 * recorded defect: a rule in three files, two of which knew it).
 *
 * The marks (crm-story-reel HOUSE_MARKS): the bot as the voice speaks it
 * (BOT_SPOKEN_AS, and its Russian spelling), the delivery bot with or
 * without its at-sign (HOUSE_DELIVERY_BOT), the brand (HOUSE_BRAND) and the
 * product (HOUSE_PRODUCT, also with a superscript three or a space).
 */
import * as SPEC from './spec/crm-story-reel.gen'

const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The marks as words, one per spec mark: what a test feeds the detector. */
export const HOUSE_MARKS: readonly string[] = [
  SPEC.BOT_SPOKEN_AS,
  'Тринити', // cyrillic-ok: the brand as the voice speaks it
  SPEC.HOUSE_DELIVERY_BOT,
  SPEC.HOUSE_BRAND,
  SPEC.HOUSE_PRODUCT,
]

/** One pattern for every mark, in any case. */
export const HOUSE_NAMES = new RegExp(
  [
    escaped(SPEC.HOUSE_DELIVERY_BOT),
    `\\b${escaped(SPEC.BOT_SPOKEN_AS)}\\b`,
    'тринити', // cyrillic-ok: the brand as the voice speaks it
    `\\b${escaped(SPEC.HOUSE_BRAND)}\\b`,
    '\\bs\\s*[³3]\\s*ai\\b',
  ].join('|'),
  'i'
)

/** Does this text name the house (its bot, its brand or its product)? */
export function namesHouse(text: unknown): boolean {
  return HOUSE_NAMES.test(String(text ?? ''))
}

/**
 * A house name nobody typed: the text names the house, and the person's own
 * words this turn (`personSaid`, set only by code -- ToolContext.ownerSaid)
 * do not. The model, a writer or an edit naming the house is refused on a
 * client's reel; what she typed herself is hers to say.
 */
export function houseNameByAgent(text: unknown, personSaid?: string): boolean {
  return namesHouse(text) && !namesHouse(String(personSaid ?? ''))
}
