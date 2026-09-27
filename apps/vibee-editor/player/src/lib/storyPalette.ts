/**
 * HER PALETTE ON THE CLIENT'S CARD (crm-story-reel.t27 v11).
 *
 * The card's story panel read `crm_story_reel` and dropped the palette in its
 * answer: the seller could not see what the next reel ends on, and could keep
 * it only by asking the agent in words. This module is the panel's logic,
 * pure and import-free, so the render's spec binding runs these very
 * functions against the spec's vectors.
 *
 * The panel computes no contrast of its own (PANEL_VERDICT_FROM_SERVER): a
 * check is the tool's read without `start`, and its `end_card_why` is the
 * verdict. "Keep" is offered only for the card the last check passed.
 */

export type EndCardColour = 'bg' | 'title' | 'text' | 'accent'

export const END_CARD_COLOURS: readonly EndCardColour[] = [
  'bg',
  'title',
  'text',
  'accent',
]

/** The end card of a story reel: #hex colours and the button line. */
export interface StoryEndCard {
  bg?: string
  title?: string
  text?: string
  accent?: string
  button?: string
}

/** Where one field of the card the reel will end on comes from. */
export type FieldSource = 'kept' | 'profile' | 'default'

/**
 * The spec's end_card_field with no word of the seller's for this reel: the
 * kept palette, else her profile (whatever else the server merged in), else
 * the composition's default.
 */
export function fieldSource(
  field: keyof StoryEndCard,
  kept: StoryEndCard | null,
  card: StoryEndCard | null
): FieldSource {
  if (kept?.[field]) return 'kept'
  if (card?.[field]) return 'profile'
  return 'default'
}

/** The spec's panel_keep_offered. */
export function panelKeepOffered(
  checked: boolean,
  editedSinceCheck: boolean,
  verdictClean: boolean
): boolean {
  return checked && !editedSinceCheck && verdictClean
}

/**
 * A colour an `<input type="color">` takes: #rrggbb. #rgb is spelled out,
 * #rrggbbaa loses its alpha (the card is flat), anything else is black so
 * the input still opens.
 */
export function toColourInput(hex: string | undefined): string {
  const h = String(hex ?? '').trim()
  if (/^#[0-9a-fA-F]{3,4}$/.test(h))
    return `#${h
      .slice(1, 4)
      .split('')
      .map(x => x + x)
      .join('')}`.toLowerCase()
  if (/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(h))
    return h.slice(0, 7).toLowerCase()
  return '#000000'
}

/** Two cards are the same card when every field is the same. */
export function cardKey(c: StoryEndCard | null): string {
  const card = c ?? {}
  return JSON.stringify(
    [...END_CARD_COLOURS, 'button'].map(
      k => card[k as keyof StoryEndCard] ?? ''
    )
  )
}
