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
 * Input: argv[2] is `{ tool, args, profile, kept, jobs, next_topic, gift }`
 * as JSON; `tool` is crm_story_reel (the seller's panel, the default) or
 * my_story_reel (her own page, the shape of that handler). Output: the
 * answer, one JSON line. Keeping (save_end_card) and start are refused -- a
 * shot never writes and never starts a reel. Prices are the host's own
 * estimates, never a typed number.
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
import {
  storyPriceEstimate,
  storyPriceEstimateNotes,
} from '../../apps/vibee-editor/render/src/agent/story-template'
import { templatesForPanel } from '../../apps/vibee-editor/render/src/agent/story-reel-templates'
import * as REEL from '../../apps/vibee-editor/render/src/spec/crm-story-reel.gen'

const input = JSON.parse(process.argv[2] ?? '{}')
const args = input.args ?? {}
const profile = endCardOf(input.profile)
const kept = endCardOf(input.kept)
const jobs = input.jobs ?? []

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

if (input.tool === 'my_story_reel') {
  // crm-story-tool.ts, makeMyStoryReelTool: her face and voice, the next
  // topic of her plan, the price before the press (or that it is a gift).
  console.log(
    JSON.stringify({
      ready: true,
      name: 'Harness',
      face: 'https://example.invalid/face.jpg',
      voice: true,
      next_topic: input.next_topic || undefined,
      ...(input.gift ? { gift: true } : { price_tokens: storyPriceEstimate() }), // secret-guard-ok: a price in tokens, not a credential
      one_tap_link: 't.me/harness_bot?start=reel',
      jobs,
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
    price_tokens: storyPriceEstimateNotes(), // secret-guard-ok: a price in tokens, not a credential
    vip: false,
    end_card: endCard ?? undefined,
    end_card_kept: kept ?? undefined,
    ...(badColour || unreadable
      ? { end_card_why: badColour || unreadable }
      : {}),
    ...(fix ? { [REEL.SUGGEST_FIX_ARG]: fix } : {}),
    ...(fixPalette ? { [REEL.SUGGEST_PALETTE_ARG]: fixPalette } : {}),
    ...(fixBg ? { [REEL.SUGGEST_BG_ARG]: fixBg } : {}),
    // The gallery (spec v20): the host's own list and the host's price of
    // every count, so the cards' figures are the server's.
    ...(input.templates
      ? {
          scenes: {
            default: 3,
            min: REEL.SCENES_MIN,
            max: REEL.SCENES_MAX,
            price_tokens: Object.fromEntries(
              Array.from(
                { length: REEL.SCENES_MAX - REEL.SCENES_MIN + 1 },
                (_, i) => [
                  REEL.SCENES_MIN + i,
                  storyPriceEstimateNotes(REEL.SCENES_MIN + i),
                ]
              )
            ),
          },
          templates: templatesForPanel(),
        }
      : {}),
    one_tap_link: 't.me/harness_bot?start=reel',
    jobs,
  })
)
