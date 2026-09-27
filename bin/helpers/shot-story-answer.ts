/**
 * WHAT `crm_story_reel` WOULD ANSWER FOR THIS CARD -- for `tri shot` only.
 *
 * The panel on the phone is shot with answers from the host's own palette
 * functions, not from a hand-written JSON: a fixture typed by hand agrees
 * with the screen it was typed for and with nothing else. Only the ORDER is
 * repeated here (the seller's card over the kept one over her profile's --
 * crm-story-tool.ts, spec v7/v10), and every decision is the host's:
 * endCardProblem, mergeEndCard, endCardUnreadable, suggestOffered,
 * endCardFix, endCardFixPalette, endCardFixBg.
 *
 * Input: argv[2] is `{ args, profile, kept }` as JSON. Output: the answer,
 * one JSON line. Keeping (save_end_card) and start are refused -- a shot
 * never writes and never starts a reel.
 *
 * Run with the render's tsx: it resolves the host's imports.
 */
import {
  endCardFix,
  endCardFixBg,
  endCardFixPalette,
  endCardOf,
  endCardProblem,
  endCardUnreadable,
  mergeEndCard,
  suggestOffered,
} from '../../apps/vibee-editor/render/src/agent/story-reel-tool'
import * as REEL from '../../apps/vibee-editor/render/src/spec/crm-story-reel.gen'

const input = JSON.parse(process.argv[2] ?? '{}')
const args = input.args ?? {}
const profile = endCardOf(input.profile)
const kept = endCardOf(input.kept)

if (args.start === true || args[REEL.END_CARD_SAVE_ARG] === true) {
  console.log(
    JSON.stringify({
      started: false,
      kept: false,
      why: 'tri shot: a shot never keeps and never starts',
    })
  )
  process.exit(0)
}

const badColour = endCardProblem(args.end_card)
const endCard = mergeEndCard(endCardOf(args.end_card), kept, profile)
const unreadable = endCardUnreadable(endCard)
const fix = suggestOffered(!badColour, !unreadable) ? endCardFix(endCard) : null
const fixPalette = fix ? endCardFixPalette(endCard) : null
const fixBg = fix ? endCardFixBg(endCard) : null

console.log(
  JSON.stringify({
    ready: true,
    lead: args.lead,
    name: 'Harness',
    face: 'https://example.invalid/face.jpg',
    voice: true,
    voice_mode: 'notes',
    price_tokens: 270,
    vip: false,
    end_card: endCard ?? undefined,
    end_card_kept: kept ?? undefined,
    ...(badColour || unreadable
      ? { end_card_why: badColour || unreadable }
      : {}),
    ...(fix ? { [REEL.SUGGEST_FIX_ARG]: fix } : {}),
    ...(fixPalette ? { [REEL.SUGGEST_PALETTE_ARG]: fixPalette } : {}),
    ...(fixBg ? { [REEL.SUGGEST_BG_ARG]: fixBg } : {}),
    one_tap_link: 't.me/harness_bot?start=reel',
    jobs: input.jobs ?? [],
  })
)
