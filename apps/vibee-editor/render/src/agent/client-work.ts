import { namesHouse } from '../house-names'

/**
 * IS THIS TURN WORK FOR A CLIENT?
 *
 * Owner, 03.10.2026, on a client's reel ending with HIS call: "why does it
 * make my CTA and not the client's?"
 *
 * On client work `ctx.telegramId` is the OWNER's id -- the turn runs through
 * his account, his storage, his wallet. So every "for our own" default keyed
 * on the caller (his avatar, his brand, his offer, his house check) fires on
 * a client's deliverable too. The caller cannot tell the two apart.
 *
 * Two marks can, and they are the only ones a turn carries:
 *
 *   - `faceOf`      -- the client this turn works for (chat.ts
 *                      clientTurnContext: a client thread, the duet's buyer);
 *   - `sellerSweep` -- an unattended tools-only sweep over the seller's leads,
 *                      where no output is ever for the seller himself.
 *
 * One function, so the rule is read in one place: a default that falls back
 * to the owner must ask this first, and refuse (before any charge) or use the
 * client's own value when it says yes.
 */
export function onClientWork(ctx: {
  faceOf?: unknown
  sellerSweep?: unknown
}): boolean {
  return !!String(ctx.faceOf ?? '').trim() || ctx.sellerSweep === true
}

/*
 * REMOTION COMPOSITIONS THAT ARE THE HOUSE'S OWN ADVERT.
 *
 * `reel_render` takes any composition id from Root.tsx, and props a model
 * leaves out fall back to `defaultProps`. Three of them carry the house in
 * those defaults or in fixed copy (audit 04.10, wave 2):
 *
 *   - RelaunchReel    -- the bot's own launch promo: its service list is
 *                        fixed copy, its handle defaults to a house bot;
 *   - TrinityBlogReel -- the house blog: the masthead and the ribbon are
 *                        fixed UI text naming the house;
 *   - NoirReel        -- the house club's canon: `brand` defaults to the
 *                        house masthead, club, site and delivery bot.
 *
 * On client work the first two are refused outright -- no prop removes the
 * house from them -- and NoirReel only when `brand` is missing, incomplete or
 * names the house. All before the twin lookup and the charge
 * (REFUSED_BEFORE_SPEND): a refusal never costs her anything, so no refund
 * path exists for it.
 *
 * Not here, on purpose: StoryReel and SplitTalkingHead are the client reels
 * (their calls follow crm-story-reel / split-reel; a client's StoryReel is
 * not refused but drawn on her card or a neutral one --
 * story-reel-tool.ts clientStoryReelProps, crm-client-workspace v6
 * story_card_from), and LeelaPlanReel is a
 * throw in the house's game -- the game is the subject, its address is the
 * end card, and `handle`/`url` props replace it.
 */
export const HOUSE_ADVERT_COMPOSITIONS: ReadonlySet<string> = new Set([
  'RelaunchReel',
  'TrinityBlogReel',
])

/** Composition -> the prop that must replace its house default. */
export const HOUSE_DEFAULT_PROP: Readonly<Record<string, string>> = {
  NoirReel: 'brand',
}

export const NOIR_BRAND_FIELDS: readonly string[] = [
  'masthead',
  'eyebrow',
  'name',
  'cta',
  'sub',
]

export const HOUSE_REEL_REFUSED =
  'это фирменный ролик нашего дома, не клиента — на работу клиенту он не идёт. ' + // cyrillic-ok: tool result copy
  'Для неё — StoryReel (story_reel) или SplitTalkingHead (split_reel) с её призывом' // cyrillic-ok: tool result copy

export const HOUSE_BRAND_REFUSED =
  'в работе клиенту NoirReel идёт только с её brand — все пять полей ' + // cyrillic-ok: tool result copy
  '(masthead, eyebrow, name, cta, sub), и ни одно не про наш дом' // cyrillic-ok: tool result copy

/**
 * Why this composition may not be rendered for a client, or null. The
 * house-name check is the shared detector, never a copy of it.
 */
export function houseReelRefusal(
  compositionId: unknown,
  props: unknown
): string | null {
  const id = String(compositionId ?? '')
  if (HOUSE_ADVERT_COMPOSITIONS.has(id)) return HOUSE_REEL_REFUSED
  const key = HOUSE_DEFAULT_PROP[id]
  if (!key) return null
  const given = (props as Record<string, unknown> | null)?.[key]
  if (!given || typeof given !== 'object') return HOUSE_BRAND_REFUSED
  const fields = NOIR_BRAND_FIELDS.map(f =>
    String((given as Record<string, unknown>)[f] ?? '').trim()
  )
  if (fields.some(f => !f) || fields.some(f => namesHouse(f)))
    return HOUSE_BRAND_REFUSED
  return null
}
